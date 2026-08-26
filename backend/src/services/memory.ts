import { prisma } from '../lib/prisma'
import { chatSingle } from './openrouter'
import { embedText, cosineSimilarity } from './embeddings'
import { tokenize } from '../utils/nlp'
import { getUserContext as getUserGraphContext } from '../features/memory/userGraph'
import { getAdaptedPersonality } from '../features/memory/personality'
import { getLearningContext } from '../features/memory/learning'
import { getCrossFeatureContext } from '../features/memory/crossIntelligence'

// Extrae recuerdos importantes de una conversación y los guarda CON embedding real.
export async function extractMemories(
  userId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  try {
    const extractPrompt = `Eres el FILTRO DE MEMORIA de un asistente. Decide si en este intercambio hay algún dato DURADERO y ÚTIL sobre el usuario que valga la pena recordar para futuras conversaciones. Sé MUY selectivo: en la mayoría de los intercambios NO hay nada que guardar.

Usuario dijo: "${userMessage}"
IA respondió: "${aiResponse}"

GUARDA solo lo que cumpla las TRES condiciones a la vez: (1) es duradero en el tiempo, (2) es sobre el usuario, sus proyectos o sus preferencias, (3) sirve para personalizar futuras respuestas.
Ejemplos válidos: profesión, ciudad, idioma, en qué proyecto trabaja, cómo prefiere que le respondan, herramientas o temas que usa de forma recurrente, metas claras.

NO guardes NUNCA: saludos ni charla trivial; preguntas puntuales (clima, cálculos, "cómo se hace X"); estados temporales ("hoy estoy cansado"); cualquier cosa de una sola vez; y JAMÁS datos sensibles (contraseñas, tarjetas, tokens, claves, documentos de identidad).

Responde SOLO con JSON, MÁXIMO 2 elementos, y array vacío [] si no hay nada que cumpla (que es lo más común):
[{"content": "dato corto y concreto, en tercera persona", "category": "trabajo|personal|preferencias|proyectos|intereses|metas"}]`

    // Memoria usa un modelo BARATO (no necesita el caro).
    const result = await chatSingle([{ role: 'user', content: extractPrompt }], 'chat')
    const cleaned = result.replace(/```json|```/g, '').trim()

    let memories: { content: string; category: string }[]
    try {
      memories = JSON.parse(cleaned)
    } catch {
      return // si no es JSON válido, no interrumpir
    }
    if (!Array.isArray(memories) || memories.length === 0) return

    // Refuerza la selectividad aunque el modelo se pase: máximo 2 por intercambio.
    memories = memories.slice(0, 2)

    // Nunca guardar datos sensibles, aunque el modelo los proponga.
    const SENSITIVE = /(contrase|password|tarjeta|cvv|\btoken\b|secreto|secret|api[_ ]?key|\b\d{12,}\b)/i

    // Evitar duplicados Y casi-duplicados (uno contiene al otro).
    const existing = await prisma.memory.findMany({ where: { userId }, select: { content: true } })
    const existingList = existing.map(e => e.content.toLowerCase().trim())

    for (const m of memories) {
      const content = (m.content || '').trim()
      if (!content || content.length < 4) continue
      if (SENSITIVE.test(content)) continue
      const lc = content.toLowerCase()
      if (existingList.some(e => e === lc || e.includes(lc) || lc.includes(e))) continue
      const embedding = await embedText(content).catch(() => [] as number[])
      await prisma.memory.create({
        data: { userId, content, category: m.category || 'general', embedding },
      })
      existingList.push(lc)
    }

    // Tope anti-acumulación: conserva los ~40 recuerdos más recientes.
    const MAX_MEMORIES = 40
    const total = await prisma.memory.count({ where: { userId } })
    if (total > MAX_MEMORIES) {
      const oldest = await prisma.memory.findMany({
        where: { userId }, orderBy: { createdAt: 'asc' }, take: total - MAX_MEMORIES, select: { id: true },
      })
      if (oldest.length) await prisma.memory.deleteMany({ where: { id: { in: oldest.map(o => o.id) } } })
    }
  } catch (err) {
    console.error('Error extracting memories:', err instanceof Error ? err.message : err)
  }
}

// ── Recuperación HÍBRIDA de memoria (vector + palabras clave + recencia) ──
// Idea: el puro vector falla con nombres propios/términos exactos, y el puro
// keyword falla con sinónimos. Combinar ambos da mucho mejor recall, y la
// recencia desempata. Todo implementado de forma nativa en DAYA.


// Solapamiento de palabras clave entre consulta y recuerdo (0..1), con bonus por frase.
function keywordScore(queryTokens: string[], content: string): number {
  if (!queryTokens.length) return 0
  const memTokens = new Set(tokenize(content))
  if (!memTokens.size) return 0
  let hits = 0
  for (const t of queryTokens) if (memTokens.has(t)) hits++
  return hits / queryTokens.length
}

// Fila mínima que consume la puntuación híbrida (compatible con el modelo de Prisma)
interface MemoryRow {
  id: string
  content: string
  category: string
  embedding?: unknown
  createdAt: Date | string
}

// Puntúa y ordena los recuerdos combinando las tres señales.
function scoreMemories<T extends MemoryRow>(
  memories: T[],
  queryVec: number[],
  queryTokens: string[]
): { m: T; score: number; vec: number; kw: number }[] {
  const now = Date.now()
  const DAY = 86_400_000
  return memories
    .map(m => {
      const vec = queryVec.length && Array.isArray(m.embedding) && m.embedding.length
        ? Math.max(0, cosineSimilarity(queryVec, m.embedding as number[]))   // 0..1
        : 0
      const kw = keywordScore(queryTokens, m.content)            // 0..1
      // Recencia: 1.0 hoy → ~0.5 a los 30 días (decaimiento suave)
      const ageDays = (now - new Date(m.createdAt).getTime()) / DAY
      const recency = 1 / (1 + ageDays / 30)
      // Fusión: el significado pesa más; las palabras clave rescatan términos exactos.
      const score = 0.6 * vec + 0.3 * kw + 0.1 * recency
      return { m, score, vec, kw }
    })
    .sort((a, b) => b.score - a.score)
}
export async function getRelevantMemories(
  userId: string,
  query?: string,
  limit = 8
): Promise<string> {
  const memories = await prisma.memory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200, // candidatos; luego se reordena por relevancia híbrida
  })
  if (memories.length === 0) return ''

  let selected = memories

  // Recuperación híbrida si hay consulta: vector + palabras clave + recencia
  if (query && query.trim()) {
    const queryTokens = tokenize(query)
    const queryVec = await embedText(query).catch(() => [] as number[])
    const scored = scoreMemories(memories, queryVec, queryTokens)

    // Umbral de relevancia: descarta lo que claramente no tiene que ver con la
    // consulta (evita "ensuciar" el prompt con recuerdos irrelevantes). Si nada
    // supera el umbral, no forzamos memoria.
    const relevant = scored.filter(s => s.vec >= 0.18 || s.kw >= 0.34)
    selected = (relevant.length ? relevant : scored.slice(0, limit)).map(s => s.m)
  }

  const memoryText = selected
    .slice(0, limit)
    .map((m) => `- [${m.category}] ${m.content}`)
    .join('\n')

  if (!memoryText) return ''
  return `\n\nLo que sé sobre este usuario:\n${memoryText}\n`
}

// Bloque de contexto de usuario solo para el agente (sin el "You are DAYA" del chat).
// Combina memorias relevantes + preferencias de perfil + fragmentos de documentos.
export async function getUserContextForAgent(userId: string, query: string): Promise<string> {
  const [memories, docContext, graphContext, prof] = await Promise.all([
    getRelevantMemories(userId, query).catch(() => ''),
    (async () => {
      try {
        const { retrieveRelevant } = await import('../features/docrag/service')
        return await retrieveRelevant(userId, query)
      } catch { return '' }
    })(),
    (async () => {
      try {
        const { getGraphContext } = await import('../features/graphrag/query')
        return await getGraphContext(userId, query, 3)
      } catch { return '' }
    })(),
    prisma.userProfile.findUnique({
      where: { userId },
      select: { tone: true, responseLength: true, profession: true, language: true },
    }).catch(() => null),
  ])

  const parts: string[] = []
  if (prof?.profession) parts.push(`El usuario trabaja en: ${prof.profession}.`)
  if (prof?.language && prof.language !== 'es') {
    const langs: Record<string, string> = { en: 'inglés', pt: 'portugués', fr: 'francés', de: 'alemán' }
    if (langs[prof.language]) parts.push(`Responde en ${langs[prof.language]}.`)
  }
  if (prof?.tone === 'formal' || prof?.tone === 'tecnico') parts.push('El usuario prefiere respuestas formales.')
  if (prof?.tone === 'casual' || prof?.tone === 'amigable') parts.push('El usuario prefiere respuestas directas y cercanas.')
  if (prof?.responseLength === 'brief' || prof?.responseLength === 'corta') parts.push('Responde brevemente.')

  let ctx = ''
  if (parts.length) ctx += '\nPreferencias del usuario: ' + parts.join(' ')
  if (memories) ctx += memories
  if (docContext) ctx += docContext
  if (graphContext) ctx += graphContext
  return ctx
}

// Cache para las partes del system prompt que no varían por mensaje (perfil, skills, lifecontext).
// TTL 45 s: elimina 3-4 queries DB repetidas en rafagas de mensajes seguidos.
const _spCache = new Map<string, { v: string; ts: number }>()
const SP_TTL = 45_000

// Invalida el cache de un usuario (llamar cuando actualiza su perfil/ajustes).
export function clearUserCache(userId: string) {
  _spCache.delete(`s:${userId}`)
}

function spCacheGet(k: string) {
  const e = _spCache.get(k)
  if (!e || Date.now() - e.ts > SP_TTL) { _spCache.delete(k); return null }
  return e.v
}
function spCacheSet(k: string, v: string) {
  if (_spCache.size >= 200) {
    const old = [..._spCache.entries()].reduce((a, b) => a[1].ts < b[1].ts ? a : b)
    _spCache.delete(old[0])
  }
  _spCache.set(k, { v, ts: Date.now() })
}

// Construye el system prompt personalizado de DAYA (con memoria relevante al mensaje).
export async function buildSystemPrompt(
  userId: string,
  currentMessage?: string,
  _aiPersona = 'DAYA'
): Promise<string> {
  // Las partes dinámicas (memoria + RAG) y las estáticas (perfil + skills + lifecontext)
  // se resuelven en paralelo. Las estáticas usan cache de 45 s.
  const [memories, docContext, graphContext, staticRaw, approvedBlock, userGraphCtx, personalityCtx, learningCtx, crossCtx] = await Promise.all([
    getRelevantMemories(userId, currentMessage),
    (async () => {
      try {
        const { retrieveRelevant } = await import('../features/docrag/service')
        return await retrieveRelevant(userId, currentMessage || '')
      } catch { return '' }
    })(),
    (async () => {
      try {
        const { getGraphContext } = await import('../features/graphrag/query')
        return await getGraphContext(userId, currentMessage || '', 3)
      } catch { return '' }
    })(),
    (async () => {
      const cached = spCacheGet(`s:${userId}`)
      if (cached) return cached
      const [lifeCtx, skillsCtx, prof] = await Promise.all([
        (async () => { try { const m = await import('../features/lifecontext/lifeContextAgent'); return await m.buildLifeContextBlock(userId) } catch { return '' } })(),
        (async () => { try { const m = await import('../features/memoryskills/memorySkills'); return await m.buildSkillsPromptBlock(userId) } catch { return '' } })(),
        prisma.userProfile.findUnique({
          where: { userId },
          select: { tone: true, responseLength: true, profession: true, language: true },
        }).catch(() => null),
      ])
      const v = JSON.stringify({ lifeCtx, skillsCtx, prof })
      spCacheSet(`s:${userId}`, v)
      return v
    })(),
    // Mejoras de instrucciones aprobadas por el admin (cache interno de 60 s).
    (async () => {
      try { const m = await import('./training'); return await m.getApprovedInstructionBlock() } catch { return '' }
    })(),
    // ── New memory system: UserGraph, Personality, Learning, Cross-Feature ──
    getUserGraphContext(userId).catch(() => ''),
    getAdaptedPersonality(userId, currentMessage || '').then(p => p.instructions).catch(() => ''),
    getLearningContext(userId).catch(() => ''),
    getCrossFeatureContext(userId, currentMessage || '').catch(() => ''),
  ])

  const { lifeCtx: lifeContext, skillsCtx: skillsContext, prof: profile } = (() => {
    try { return JSON.parse(staticRaw) } catch { return { lifeCtx: '', skillsCtx: '', prof: null } }
  })()

  // Preferencias de personalización del usuario (Ajustes)
  let prefsText = ''
  if (profile) {
    const toneMap: Record<string, string> = {
      formal: 'Usa un tono formal y profesional.',
      neutral: 'Usa un tono equilibrado y natural.',
      casual: 'Usa un tono cercano y casual.',
      // Valores que guarda la pantalla de Ajustes (en español)
      amigable: 'Usa un tono cercano, cálido y amigable.',
      tecnico: 'Usa un tono técnico y preciso, con terminología exacta cuando corresponda.',
    }
    const lenMap: Record<string, string> = {
      brief: 'Responde de forma breve y directa, sin rodeos.',
      balanced: 'Responde con un nivel de detalle equilibrado.',
      detailed: 'Responde de forma detallada y completa cuando aporte valor.',
      // Valores que guarda la pantalla de Ajustes (en español)
      corta: 'Responde de forma breve y directa, sin rodeos.',
      normal: 'Responde con un nivel de detalle equilibrado.',
      detallada: 'Responde de forma detallada y completa cuando aporte valor.',
    }
    const parts: string[] = []
    if (profile.tone && toneMap[profile.tone]) parts.push(toneMap[profile.tone])
    if (profile.responseLength && lenMap[profile.responseLength]) parts.push(lenMap[profile.responseLength])
    if (profile.profession) parts.push(`El usuario trabaja en: ${profile.profession}.`)
    if (parts.length) prefsText = '\n\nPreferencias del usuario:\n' + parts.join(' ') + '\n'
  }

  // El nombre es parte de la marca y NO se puede cambiar: siempre DAYA.
  const persona = 'DAYA'

  // Idioma: si el usuario fijó uno en Ajustes, se respeta; si no, DAYA responde
  // SIEMPRE en el mismo idioma en que el usuario escribió (clave para uso mundial).
  const langNames: Record<string, string> = {
    es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés',
    de: 'alemán', it: 'italiano', zh: 'chino', ja: 'japonés', ko: 'coreano',
  }
  const fixedLang = profile?.language && langNames[profile.language]
  const languageRule = fixedLang
    ? `Responde siempre en ${langNames[profile!.language]}.`
    : `Responde SIEMPRE en el mismo idioma en que el usuario escribe su mensaje. Si cambia de idioma, tú también.`

  const now = new Date()
  const todayStr = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return `You are ${persona}, an advanced, empathetic AI created by DAYA AI.
Eres inteligente, curiosa, directa y genuinamente útil. Tienes personalidad propia: proactiva, no genérica.

Fecha y hora actuales: ${todayStr}. Usa esta fecha siempre que el usuario pregunte por "hoy", "este año", "actualmente" o cualquier referencia temporal. NUNCA digas que no sabes la fecha.

${languageRule}

Capacidades: programación, análisis, escritura, matemáticas, consejos, investigación, creatividad, generación de imágenes y más.

IMÁGENES: DAYA SÍ puede generar imágenes (sistema integrado con Pollinations AI). Las peticiones claras de imagen las maneja el sistema automáticamente, antes de llegar a ti. Si aun así te piden una imagen, NUNCA digas que no puedes crearla ni recomiendes otras herramientas (DALL·E, Midjourney, etc.): indícale al usuario que puede generarla activando el modo imagen con el ícono de foto en la barra de entrada, o reformulando como "genera una imagen de…". No afirmes que ya la estás generando si no aparece.

VERACIDAD (muy importante): Di solo lo que sea verdadero y verificable. NUNCA inventes datos, cifras, fechas, nombres, citas, enlaces, estudios ni hechos. Si no estás seguro o no tienes la información, dilo con claridad ("no estoy seguro" o "no tengo ese dato") en lugar de adivinar. Para información actual, reciente o que cambia con el tiempo (noticias, precios, resultados, personas en cargos, datos en vivo), aclara que puede haber cambiado y, si está disponible, sugiere usar el Agente (que sí busca en la web en tiempo real). Prefiere ser honesto y útil antes que sonar seguro. Si el usuario te corrige con razón, reconócelo.

Profundidad: por defecto desarrolla tus respuestas con sustancia — explica el porqué, aporta contexto, ejemplos y, cuando ayude, los siguientes pasos o matices importantes. No te quedes en una o dos líneas cuando el tema da para más: una respuesta completa y bien desarrollada es más útil que una escueta. Ajusta la extensión a la pregunta — para dudas triviales sé directo; para preguntas abiertas, explicativas, técnicas o de trabajo, sé generoso y minucioso. Eso sí, nunca rellenes con paja: más largo debe significar más valor, no más palabras vacías. (Si el usuario pide expresamente brevedad, respétala.)

Formato: responde de forma natural y conversacional. En respuestas cortas y directas, usa texto limpio sin símbolos de markdown. Reserva el formato (## títulos, listas con guion, **negritas**) solo para respuestas largas o técnicas donde realmente aporte estructura y claridad. Nunca uses asteriscos, almohadillas ni guiones si el contenido no los necesita — el texto limpio es siempre preferible a forzar formato.

Matemáticas y diagramas (cuando de verdad ayuden, no a la fuerza): para fórmulas o ecuaciones usa LaTeX en bloque entre $$ … $$ (se renderizan con formato bonito). Para procesos, flujos, arquitecturas, líneas de tiempo o relaciones, puedes dibujar un diagrama con un bloque \`\`\`mermaid (flowchart, sequenceDiagram, gantt, etc.). Para comparar cifras, tendencias o distribuciones, puedes dibujar un gráfico con un bloque \`\`\`chart y este JSON exacto: {"type":"bar|line|pie|doughnut","title":"opcional","labels":["A","B","C"],"datasets":[{"label":"Serie","data":[10,20,15]}]}. Úsalos solo cuando aporten claridad real; para números sueltos (precios, cantidades) escribe normal, sin LaTeX ni gráficos.
${approvedBlock}${prefsText}${memories}${docContext}${graphContext}${lifeContext}${skillsContext}${userGraphCtx}${personalityCtx}${learningCtx}${crossCtx}
Adapta el idioma, el contexto y el tono a cada usuario. Recuerda lo que sabes de él y personaliza tus respuestas.`
}
