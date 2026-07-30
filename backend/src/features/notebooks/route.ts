// ============================================
// DAYA AI — Cuadernos (notebooks): investigación anclada a fuentes.
// Port nativo del concepto de NotebookLM / Open Notebook (MIT) sobre el motor
// que DAYA ya tiene: DocRAG (chunks + embeddings), Hybrid Search y read-url.
// - Cada cuaderno agrupa fuentes: documentos de la Biblioteca, URLs y texto.
// - El chat responde SOLO con ese material y cita [n] (sistema de citas
//   portado del prompt source_chat de Open Notebook: nunca inventar IDs).
// - Transformaciones (resumen denso, ideas clave, guía de estudio, FAQ),
//   transformations por defecto.
// Cada chat/transformación consume 1 mensaje de la cuota del plan.
// ============================================
import { Router, Request, Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../../middleware/auth'
import { chatBurstLimiter, heavyLimiter } from '../../middleware/rateLimiter'
import { prisma } from '../../lib/prisma'
import { chatSingle, chatJSON, MODELS } from '../../services/openrouter'
import { indexDocument, removeDocumentChunks } from '../docrag/service'
import { embedText } from '../../services/embeddings'
import { hybridSearchPrecomputed, HybridDoc } from '../hybridsearch/hybridSearch'
import { readPageText } from '../readurl/route'
import { resolveEffectivePlan, resetUsageIfDue, consumeQuota, refundQuota } from '../../services/quota'
import { trackUsage } from '../insights/usageTracker'
import { transcribeAudio, isTranscriptionConfigured } from '../../services/transcription'
import { buildProfessionalHTML } from '../../services/documents/pdfGenerator'
import { htmlToPDF } from '../../services/documents/pdfRenderer'
import { saveToLibrary } from '../../services/documents/documentService'

const db = prisma as any
const router = Router()
router.use(requireAuth)

// Multer en memoria para fuentes de audio (máx 25MB, igual que el dictado del chat)
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

const MAX_SOURCES = 20

// Cada chat/transformación consume 1 mensaje del plan (mismo patrón atómico del chat).
async function consumeMessage(userId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, plan: true, planExpiresAt: true, usageResetAt: true,
      messagesUsed: true, imagesUsed: true, searchesUsed: true, studioUsed: true, documentsUsed: true,
    },
  })
  if (!user) return { ok: false, error: 'Usuario no encontrado.' }
  await resolveEffectivePlan(user)
  await resetUsageIfDue(user)
  const reserved = await db.$executeRaw`
    UPDATE "User" SET "messagesUsed" = "messagesUsed" + 1
    WHERE id = ${userId}::text AND "messagesUsed" < "messagesLimit"`
  if (Number(reserved) === 0) return { ok: false, error: 'Alcanzaste el límite de mensajes de tu plan. Mejora tu plan para continuar.' }
  return { ok: true }
}

// Clave de recuperación de una fuente: los documentos de Biblioteca ya están
// indexados con su docId; las URLs y textos se indexan con el id de la fuente.
const ragKey = (s: any) => (s.type === 'document' ? s.docId : s.id)

async function getNotebook(userId: string, id: string) {
  return db.notebook.findFirst({ where: { id, userId } })
}

// ── CRUD de cuadernos ─────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const notebooks = await db.notebook.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })
    const counts = await db.notebookSource.groupBy({ by: ['notebookId'], where: { userId }, _count: true })
    const countMap: Record<string, number> = {}
    for (const c of counts) countMap[c.notebookId] = c._count
    res.json(notebooks.map((n: any) => ({ ...n, sourceCount: countMap[n.id] || 0 })))
  } catch { res.status(500).json({ error: 'No se pudieron cargar los cuadernos.' }) }
})

router.post('/', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const title = String(req.body?.title || '').trim().slice(0, 120) || 'Cuaderno sin título'
  try {
    const nb = await db.notebook.create({ data: { userId, title } })
    res.json(nb)
  } catch { res.status(500).json({ error: 'No se pudo crear el cuaderno.' }) }
})

router.get('/:id', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    const sources = await db.notebookSource.findMany({
      where: { notebookId: nb.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, title: true, docId: true, createdAt: true },
    })
    res.json({ ...nb, sources })
  } catch { res.status(500).json({ error: 'No se pudo cargar el cuaderno.' }) }
})

router.patch('/:id', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const title = String(req.body?.title || '').trim().slice(0, 120)
  if (!title) return res.status(400).json({ error: 'Falta el título.' })
  try {
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    res.json(await db.notebook.update({ where: { id: nb.id }, data: { title } }))
  } catch { res.status(500).json({ error: 'No se pudo renombrar.' }) }
})

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    const sources = await db.notebookSource.findMany({ where: { notebookId: nb.id } })
    for (const s of sources) {
      if (s.type !== 'document') await removeDocumentChunks(userId, s.id)
    }
    await db.notebookSource.deleteMany({ where: { notebookId: nb.id } })
    await db.notebook.delete({ where: { id: nb.id } })
    res.json({ success: true })
  } catch { res.status(500).json({ error: 'No se pudo eliminar el cuaderno.' }) }
})

// ── Fuentes ───────────────────────────────────────────────────────────────────

router.post('/:id/sources', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { type } = req.body || {}
  try {
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    const count = await db.notebookSource.count({ where: { notebookId: nb.id } })
    if (count >= MAX_SOURCES) return res.status(400).json({ error: `Máximo ${MAX_SOURCES} fuentes por cuaderno.` })

    let source: any = null

    if (type === 'document') {
      const docId = String(req.body?.docId || '')
      const doc = await db.libraryDocument.findFirst({ where: { id: docId, userId } })
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado en tu Biblioteca.' })
      const dup = await db.notebookSource.findFirst({ where: { notebookId: nb.id, docId } })
      if (dup) return res.status(400).json({ error: 'Ese documento ya está en el cuaderno.' })
      source = await db.notebookSource.create({
        data: { notebookId: nb.id, userId, type: 'document', title: doc.fileName, docId },
      })
      // Si el documento nunca se indexó (o es texto plano), indexarlo ahora para
      // que el chat del cuaderno pueda recuperarlo. Los binarios (__B64__) se omiten.
      const chunks = await db.docChunk.count({ where: { userId, docId } })
      if (chunks === 0 && doc.content && !doc.content.startsWith('__B64__')) {
        indexDocument(userId, docId, doc.fileName, doc.content.slice(0, 200000)).catch(() => {})
      }
    } else if (type === 'url') {
      const url = String(req.body?.url || '').trim()
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL no válida.' })
      const page = await readPageText(url)
      if ('error' in page) return res.status(400).json({ error: `No pude leer esa página: ${page.error}` })
      const title = String(req.body?.title || '').trim() || url.replace(/^https?:\/\//, '').slice(0, 80)
      source = await db.notebookSource.create({
        data: { notebookId: nb.id, userId, type: 'url', title, content: page.text },
      })
      await indexDocument(userId, source.id, title, page.text).catch(() => {})
    } else if (type === 'text') {
      const content = String(req.body?.content || '').trim().slice(0, 100000)
      if (content.length < 40) return res.status(400).json({ error: 'El texto es demasiado corto (mínimo 40 caracteres).' })
      const title = String(req.body?.title || '').trim().slice(0, 120) || 'Texto pegado'
      source = await db.notebookSource.create({
        data: { notebookId: nb.id, userId, type: 'text', title, content },
      })
      await indexDocument(userId, source.id, title, content).catch(() => {})
    } else {
      return res.status(400).json({ error: 'type debe ser document, url o text.' })
    }

    await db.notebook.update({ where: { id: nb.id }, data: { updatedAt: new Date() } }).catch(() => {})
    res.json({ id: source.id, type: source.type, title: source.title, docId: source.docId, createdAt: source.createdAt })
  } catch (e: any) {
    console.error('[notebooks] error añadiendo fuente:', e?.message || e)
    res.status(500).json({ error: 'No se pudo añadir la fuente.' })
  }
})

// Fuente de AUDIO: sube una grabación (reunión, clase, nota de voz), se
// transcribe con Whisper (servicio ya existente) y entra como fuente indexada.
router.post('/:id/sources/audio', heavyLimiter, audioUpload.single('audio'), async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió el archivo de audio.' })
    if (!isTranscriptionConfigured()) return res.status(503).json({ error: 'La transcripción de audio no está disponible.' })
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    const count = await db.notebookSource.count({ where: { notebookId: nb.id } })
    if (count >= MAX_SOURCES) return res.status(400).json({ error: `Máximo ${MAX_SOURCES} fuentes por cuaderno.` })

    const result = await transcribeAudio(req.file.buffer, req.file.originalname || 'audio.webm')
    if (!result.success || !result.text || result.text.trim().length < 40) {
      return res.status(400).json({ error: result.error || 'La transcripción salió vacía o demasiado corta.' })
    }
    const title = (req.file.originalname || 'Grabación').replace(/\.[a-z0-9]+$/i, '').slice(0, 120)
    const source = await db.notebookSource.create({
      data: { notebookId: nb.id, userId, type: 'audio', title, content: result.text.slice(0, 100000) },
    })
    await indexDocument(userId, source.id, title, result.text).catch(() => {})
    await db.notebook.update({ where: { id: nb.id }, data: { updatedAt: new Date() } }).catch(() => {})
    res.json({ id: source.id, type: source.type, title: source.title, createdAt: source.createdAt })
  } catch (e: any) {
    console.error('[notebooks] error en fuente de audio:', e?.message || e)
    res.status(500).json({ error: 'No se pudo transcribir el audio.' })
  }
})

router.delete('/:id/sources/:sid', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    const source = await db.notebookSource.findFirst({ where: { id: req.params.sid, notebookId: nb.id } })
    if (!source) return res.status(404).json({ error: 'Fuente no encontrada.' })
    // Los chunks de URLs/texto son exclusivos del cuaderno: se limpian. Los de
    // documentos pertenecen a la Biblioteca y se conservan.
    if (source.type !== 'document') await removeDocumentChunks(userId, source.id)
    await db.notebookSource.delete({ where: { id: source.id } })
    res.json({ success: true })
  } catch { res.status(500).json({ error: 'No se pudo eliminar la fuente.' }) }
})

// ── Chat anclado a fuentes, con citas [n] ─────────────────────────────────────
// System prompt portado del source_chat de Open Notebook (MIT): asistente de
// investigación, SOLO el material dado, citas con IDs reales, nunca inventar.
const CHAT_SYSTEM = `Eres el asistente de investigación de DAYA dentro de un cuaderno de fuentes.

REGLAS ESTRICTAS:
1. Responde usando ÚNICAMENTE el material de las FUENTES numeradas que se te da. Nada de conocimiento externo, suposiciones ni datos inventados.
2. CITA cada afirmación con el número de su fuente entre corchetes: [1], [2]… Usa SOLO números que existan en las fuentes dadas; nunca inventes citas.
3. Si la respuesta no está en las fuentes, dilo con claridad: "Las fuentes de este cuaderno no contienen esa información." No rellenes con generalidades.
4. Cuando varias fuentes se complementen o contradigan, señálalo y cita ambas.
5. Responde en el idioma del usuario. Para matemáticas usa $$…$$ en bloque o $…$ en línea.
Sé claro, riguroso y directo: profundidad con sustancia, sin paja.`

router.post('/:id/chat', chatBurstLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const question = String(req.body?.question || '').trim()
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : []
  if (!question) return res.status(400).json({ error: 'Falta la pregunta.' })
  try {
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    const sources = await db.notebookSource.findMany({ where: { notebookId: nb.id }, orderBy: { createdAt: 'asc' } })
    if (!sources.length) return res.status(400).json({ error: 'Añade al menos una fuente al cuaderno.' })

    const quota = await consumeMessage(userId)
    if (!quota.ok) return res.status(429).json({ error: quota.error })

    // Recuperación anclada: SOLO los chunks de las fuentes de este cuaderno.
    const keyToN = new Map<string, number>()
    sources.forEach((s: any, i: number) => keyToN.set(ragKey(s), i + 1))
    const keys = [...keyToN.keys()].filter(Boolean)

    const qVec = await embedText(question).catch(() => [] as number[])
    const chunks = await db.docChunk.findMany({ where: { userId, docId: { in: keys } }, take: 800 }).catch(() => [])
    let context = ''
    if (chunks.length) {
      const docs: HybridDoc[] = chunks.map((c: any) => ({
        id: c.id,
        text: c.text,
        vector: (qVec.length && Array.isArray(c.embedding) && c.embedding.length) ? c.embedding : undefined,
        meta: { key: c.docId },
      }))
      const hits = await hybridSearchPrecomputed(question, qVec, docs, { topK: 10 })
      context = hits.map(h => `[${keyToN.get(String(h.meta?.key)) || '?'}] ${h.text}`).join('\n\n')
    }
    // Respaldo: si aún no hay chunks (indexación en curso), usa el inicio del contenido.
    if (!context) {
      context = sources
        .map((s: any, i: number) => (s.content ? `[${i + 1}] ${s.content.slice(0, 3000)}` : ''))
        .filter(Boolean).join('\n\n')
    }
    if (!context) return res.status(400).json({ error: 'Las fuentes aún se están procesando. Intenta en unos segundos.' })

    const sourceList = sources.map((s: any, i: number) => `[${i + 1}] ${s.title} (${s.type === 'document' ? 'documento' : s.type === 'url' ? 'web' : 'texto'})`).join('\n')
    const userPrompt = `FUENTES DEL CUADERNO:\n${sourceList}\n\nFRAGMENTOS RELEVANTES:\n${context}\n\nPREGUNTA DEL USUARIO:\n${question}`
    const msgs = [...history.map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: String(m.content || '').slice(0, 4000) })), { role: 'user' as const, content: userPrompt }]

    const answer = await chatSingle(msgs, 'flash', CHAT_SYSTEM, undefined, 2500)
    trackUsage({ userId, model: MODELS.flash, inputText: userPrompt, outputText: answer, feature: 'notebooks' }).catch(() => {})

    res.json({
      answer: (answer || '').trim() || 'No pude generar una respuesta. Intenta de nuevo.',
      citations: sources.map((s: any, i: number) => ({ n: i + 1, title: s.title, type: s.type })),
    })
  } catch (e: any) {
    console.error('[notebooks] error en chat:', e?.message || e)
    res.status(500).json({ error: 'No se pudo responder. Intenta de nuevo.' })
  }
})

// ── Transformaciones (portadas de las por defecto de Open Notebook) ───────────
const TRANSFORMS: Record<string, { title: string; prompt: string }> = {
  resumen: {
    title: 'Resumen denso',
    prompt: 'Crea un RESUMEN DENSO de todo el material: captura todas las ideas importantes, datos, cifras y conclusiones en el menor espacio posible sin perder sustancia. Estructura con títulos (##) y párrafos compactos. Cita las fuentes [n] en cada sección.',
  },
  ideas: {
    title: 'Ideas clave',
    prompt: 'Extrae las IDEAS CLAVE del material: los insights más importantes, sorprendentes o accionables. Lista de 8-15 puntos, cada uno con una frase contundente + 1-2 líneas de explicación + su cita [n]. Ordena de mayor a menor impacto.',
  },
  guia: {
    title: 'Guía de estudio',
    prompt: 'Crea una GUÍA DE ESTUDIO del material: ## Conceptos esenciales (definidos con claridad), ## Relaciones entre ideas, ## Preguntas de repaso (8-10, con las respuestas al final), ## Glosario de términos. Cita las fuentes [n] en cada concepto.',
  },
  faq: {
    title: 'Preguntas frecuentes',
    prompt: 'Genera las PREGUNTAS FRECUENTES que alguien haría sobre este material: 8-12 preguntas con respuestas completas pero directas, basadas SOLO en las fuentes, cada respuesta con su cita [n]. Ordena de lo general a lo específico.',
  },
}

// Material completo del cuaderno, por fuente y con topes de seguridad.
async function collectMaterial(userId: string, sources: any[], capPerSource = 20000, capTotal = 90000): Promise<string> {
  const parts: string[] = []
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]
    let text = s.content || ''
    if (!text && s.type === 'document' && s.docId) {
      const chunks = await db.docChunk.findMany({ where: { userId, docId: s.docId }, orderBy: { createdAt: 'asc' }, take: 60 }).catch(() => [])
      text = chunks.map((c: any) => c.text).join('\n')
    }
    if (text) parts.push(`===== FUENTE [${i + 1}]: ${s.title} =====\n${text.slice(0, capPerSource)}`)
  }
  return parts.join('\n\n').slice(0, capTotal)
}

router.post('/:id/transform', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const kind = String(req.body?.kind || '')
  const t = TRANSFORMS[kind]
  if (!t) return res.status(400).json({ error: 'kind debe ser: resumen, ideas, guia o faq.' })
  try {
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    const sources = await db.notebookSource.findMany({ where: { notebookId: nb.id }, orderBy: { createdAt: 'asc' } })
    if (!sources.length) return res.status(400).json({ error: 'Añade al menos una fuente al cuaderno.' })

    const quota = await consumeMessage(userId)
    if (!quota.ok) return res.status(429).json({ error: quota.error })

    const material = await collectMaterial(userId, sources)
    if (!material) return res.status(400).json({ error: 'Las fuentes aún se están procesando. Intenta en unos segundos.' })

    const content = await chatSingle(
      [{ role: 'user', content: `${t.prompt}\n\nMATERIAL:\n${material}` }],
      'flash',
      'Eres el asistente de investigación de DAYA. Trabaja SOLO con el material dado, en el idioma del material, con markdown limpio y citas [n]. Nunca inventes datos.',
      undefined,
      4000
    )
    trackUsage({ userId, model: MODELS.flash, inputText: material.slice(0, 60000), outputText: content, feature: 'notebooks' }).catch(() => {})
    res.json({ title: t.title, content: (content || '').trim() })
  } catch (e: any) {
    console.error('[notebooks] error en transformación:', e?.message || e)
    res.status(500).json({ error: 'No se pudo generar. Intenta de nuevo.' })
  }
})

// ── Fase 2: Resumen en audio — mini-podcast de dos voces desde las fuentes ────
// Guion con Gemini Flash → voces neuronales de Microsoft Edge (msedge-tts:
// gratis, sin API key, calidad alta y multiidioma) → un solo MP3.
// Progreso por SSE (mismo patrón que deep-research).
const VOICE_MAP: Record<string, { A: string; B: string }> = {
  es: { A: 'es-MX-DaliaNeural', B: 'es-MX-JorgeNeural' },
  en: { A: 'en-US-AriaNeural', B: 'en-US-GuyNeural' },
  pt: { A: 'pt-BR-FranciscaNeural', B: 'pt-BR-AntonioNeural' },
  fr: { A: 'fr-FR-DeniseNeural', B: 'fr-FR-HenriNeural' },
  de: { A: 'de-DE-KatjaNeural', B: 'de-DE-ConradNeural' },
  it: { A: 'it-IT-ElsaNeural', B: 'it-IT-DiegoNeural' },
}

async function ttsSegment(text: string, voice: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const mod: any = await import('msedge-tts')
      const tts = new mod.MsEdgeTTS()
      await tts.setMetadata(voice, mod.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      const { audioStream } = tts.toStream(text)
      const buf = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        const timer = setTimeout(() => reject(new Error('timeout de voz')), 60000)
        audioStream.on('data', (c: Buffer) => chunks.push(c))
        audioStream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)) })
        audioStream.on('error', (e: any) => { clearTimeout(timer); reject(e) })
      })
      try { tts.close?.() } catch {}
      if (buf.length > 1000) return buf
    } catch { /* reintento abajo */ }
    await new Promise(rs => setTimeout(rs, 1200))
  }
  return null
}

router.post('/:id/audio', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const nb = await getNotebook(userId, req.params.id)
  if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
  const sources = await db.notebookSource.findMany({ where: { notebookId: nb.id }, orderBy: { createdAt: 'asc' } })
  if (!sources.length) return res.status(400).json({ error: 'Añade al menos una fuente al cuaderno.' })
  const quota = await consumeMessage(userId)
  if (!quota.ok) return res.status(429).json({ error: quota.error })

  // A partir de aquí: SSE (la generación toma ~1-2 min y se reporta el avance).
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  const send = (o: any) => res.write(`data: ${JSON.stringify(o)}\n\n`)

  try {
    send({ status: 'Leyendo las fuentes…' })
    const material = await collectMaterial(userId, sources, 15000, 60000)
    if (!material) { send({ error: 'Las fuentes aún se están procesando. Intenta en unos segundos.' }); res.end(); return }

    send({ status: 'Escribiendo el guion del episodio…' })
    const script = await chatJSON(
      `Crea el guion de un mini-podcast (4-6 minutos hablados) en el MISMO idioma del material. Dos presentadores: A (Ana, curiosa, hace las preguntas inteligentes) y B (Leo, experto, explica con datos). Estructura: apertura de una frase presentando el tema, 3-5 temas clave del material discutidos con datos CONCRETOS del material (cifras, nombres, conclusiones), y un cierre con la idea más importante. Conversacional y con ritmo, cero relleno. Entre 10 y 12 intervenciones, alternando A y B, de 2 a 4 frases cada una.\n\nResponde SOLO este JSON: {"lang":"código ISO del idioma del guion (es, en, pt, fr, de, it)","segments":[{"speaker":"A","text":"..."},{"speaker":"B","text":"..."}]}\n\nMATERIAL:\n${material}`,
      'Eres un guionista de podcasts de divulgación. Trabajas SOLO con el material dado; nunca inventas datos. Respondes únicamente JSON válido.',
      MODELS.flash,
      3000
    ).catch(() => null)

    const segments = (Array.isArray(script?.segments) ? script.segments : [])
      .filter((s: any) => s && typeof s.text === 'string' && s.text.trim())
      .slice(0, 12)
      .map((s: any) => ({ speaker: s.speaker === 'B' ? 'B' : 'A', text: String(s.text).trim().slice(0, 480) }))
    if (segments.length < 4) { send({ error: 'No pude generar un guion sólido con estas fuentes. Intenta de nuevo.' }); res.end(); return }
    const voices = VOICE_MAP[String(script?.lang || 'es').toLowerCase().slice(0, 2)] || VOICE_MAP.es

    // Voces en paralelo (3 a la vez), preservando el orden de los segmentos.
    const buffers: (Buffer | null)[] = new Array(segments.length).fill(null)
    let next = 0
    let done = 0
    const workers = Array.from({ length: 3 }, async () => {
      for (;;) {
        const i = next++
        if (i >= segments.length) return
        buffers[i] = await ttsSegment(segments[i].text, voices[segments[i].speaker as 'A' | 'B'])
        done++
        send({ status: `Grabando voces… ${done}/${segments.length}` })
      }
    })
    await Promise.all(workers)

    const ok = buffers.filter(Boolean) as Buffer[]
    if (ok.length < Math.ceil(segments.length / 2)) {
      send({ error: 'El servicio de voz no respondió lo suficiente. Intenta de nuevo en unos minutos.' })
      res.end(); return
    }
    const mp3 = Buffer.concat(ok)
    trackUsage({ userId, model: MODELS.flash, inputText: material.slice(0, 60000), outputText: segments.map((s: any) => s.text).join(' '), feature: 'notebooks' }).catch(() => {})

    send({
      done: true,
      title: `Resumen en audio — ${nb.title}`,
      mime: 'audio/mpeg',
      audio: mp3.toString('base64'),
      transcript: segments.map((s: any) => `${s.speaker === 'A' ? 'Ana' : 'Leo'}: ${s.text}`).join('\n\n'),
    })
    res.end()
  } catch (e: any) {
    console.error('[notebooks] error en audio:', e?.message || e)
    send({ error: 'No se pudo generar el audio. Intenta de nuevo.' })
    res.end()
  }
})

// ── Fase 3: Informe PDF del cuaderno ──────────────────────────────────────────
// Redacta un informe ejecutivo con TODO el material y lo entrega como PDF real
// (motor editorial ya existente: buildProfessionalHTML + Puppeteer), guardado
// en la Biblioteca del usuario. Consume 1 de la cuota de documentos del plan.
router.post('/:id/report', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  let charged = false
  try {
    const nb = await getNotebook(userId, req.params.id)
    if (!nb) return res.status(404).json({ error: 'Cuaderno no encontrado.' })
    const sources = await db.notebookSource.findMany({ where: { notebookId: nb.id }, orderBy: { createdAt: 'asc' } })
    if (!sources.length) return res.status(400).json({ error: 'Añade al menos una fuente al cuaderno.' })

    const quota = await consumeQuota(userId, 'document')
    if (!quota.ok) return res.status(429).json({ error: quota.error })
    charged = true

    const material = await collectMaterial(userId, sources)
    if (!material) { await refundQuota(userId, 'document'); return res.status(400).json({ error: 'Las fuentes aún se están procesando. Intenta en unos segundos.' }) }

    const sourceList = sources.map((s: any, i: number) => `[${i + 1}] ${s.title}`).join('\n')
    const markdown = await chatSingle(
      [{ role: 'user', content: `Redacta un INFORME ejecutivo completo, en el idioma del material, en markdown limpio:\n## Resumen ejecutivo (lo esencial en 2-3 párrafos)\n## Secciones por tema (3-6 secciones con los datos concretos del material, citando [n])\n## Conclusiones (accionables, sin paja)\n## Fuentes (la lista numerada tal cual se te da)\n\nFUENTES:\n${sourceList}\n\nMATERIAL:\n${material}` }],
      'flash',
      'Eres el analista de investigación de DAYA. Trabajas SOLO con el material dado, citas [n] cada dato, nunca inventas. Markdown limpio, denso y profesional.',
      undefined,
      5000
    )
    if (!markdown || markdown.trim().length < 200) throw new Error('informe vacío')

    const title = `Informe — ${nb.title}`
    const html = buildProfessionalHTML(title, markdown, [])
    const pdf = await htmlToPDF(html)
    const stored = `__B64__:application/pdf:${pdf.toString('base64')}`
    const docId = await saveToLibrary(userId, `${title}.pdf`, 'pdf', stored, pdf.length)

    trackUsage({ userId, model: MODELS.flash, inputText: material.slice(0, 60000), outputText: markdown, feature: 'notebooks' }).catch(() => {})
    res.json({ docId, title: `${title}.pdf` })
  } catch (e: any) {
    if (charged) await refundQuota(userId, 'document').catch(() => {})
    console.error('[notebooks] error en informe:', e?.message || e)
    res.status(500).json({ error: 'No se pudo generar el informe. Intenta de nuevo.' })
  }
})

export default router
