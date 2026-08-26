// ============================================
// DAYA IA — Selección inteligente de modelos
//   Open-source: usa cualquier modelo de OpenRouter (Anthropic, OpenAI, Google,
//   DeepSeek, Qwen, GLM, Kimi, Meta, Mistral, xAI…).
//   Un mundo, dos planes: Gratis y Pro ($13).
//   Los DOS reciben los mismos modelos BASE (baratos y de alta calidad).
//   La diferencia: el free se queda en la base (candado de coste); el Pro
//   ESCALA a modelos más fuertes en tareas difíciles.
// ============================================
import { getPremiumModel, registerHealable, pickByPrefix } from './modelCatalog'
import { logger } from './logger'

export type TaskType =
  | 'fast'       // pregunta simple, definición, traducción
  | 'chat'       // conversación general
  | 'code'       // código y programación
  | 'math'       // matemáticas, estadísticas
  | 'reasoning'  // análisis profundo, estrategia
  | 'creative'   // escritura creativa
  | 'document'   // generación de documentos

export type UserPlan = 'FREE' | 'PRO'

export function detectTaskType(message: string): TaskType {
  const m = message.toLowerCase()

  // code: términos con word boundaries para acrónimos cortos, substring para largos
  // "api" se quita porque coincide en "capitalismo", "capitán", etc.
  if (/\b(código|code|programa|función|function|script|bug|error|debug|html|css|javascript|python|typescript|sql|json|react|vue|node|backend|frontend|clase|método|array|loop|algoritmo|framework)\b/.test(m))
    return 'code'

  if (/calcula|matemátic|estadístic|porcentaje|fórmula|ecuación|álgebra|derivada|integral|probabilidad|geometría|\d+\s*[\+\-\*\/]\s*\d+/.test(m))
    return 'math'

  if (/(genera|crea|hazme|elabora|haz|escribe|redacta).*(informe|reporte|documento|presentación|powerpoint|excel|pdf|word|contrato|propuesta|plan de negocio|currículum|carta|factura|acta|manual)/.test(m))
    return 'document'

  if (/historia|cuento|poema|canción|guión|narrativa|creativamente|imagina|ficción/.test(m))
    return 'creative'

  if (/analiza en detalle|compara exhaustivamente|explica a fondo|estrategia completa|estudio de caso|investiga a profundidad|razona|por qué ocurre/.test(m))
    return 'reasoning'

  if (/qué es|define|cuándo|dónde|quién|cómo se llama|traduce|qué significa|fecha|capital de|sinónimo|antónimo|cuántos/.test(m))
    return 'fast'

  return 'chat'
}

// ─────────────────────────────────────────────────────────────────────────────
// MODELOS — tres capas
//
// Todos los proveedores de OpenRouter: Anthropic, OpenAI, Google, DeepSeek,
// Qwen (Alibaba), GLM (Z.ai), Kimi (Moonshot), Meta, Mistral, xAI y más.
//
// IDs y precios verificados contra el catálogo VIVO de OpenRouter (jul 2026); el
// precio del comentario es USD por millón de tokens de SALIDA. Un ID muerto aquí
// devuelve 404 y el chat degrada EN SILENCIO a un fallback más caro.
//
// FREECAP → SOLO el plan Gratis (techo duro de $0.87/1M out — ni un céntimo más).
// BASE    → barato + alta calidad, IGUAL para todos los planes.
// ESCALA  → SOLO planes de pago en tareas difíciles. Se dispara poquísimo (solo
//           Pro + solo complejo) → casi no pesa en coste, pero da el "wow".
// ─────────────────────────────────────────────────────────────────────────────
// FREECAP: tope de coste para el plan Gratis. Cualquier tarea que en BASE
// supere los $0.87/1M out se baja a deepseek-v4-pro. Así un usuario FREE
// nunca dispara un modelo de más de $0.87 por millón de tokens de salida.
const FREECAP: Partial<Record<TaskType, string>> = {
  math:      'deepseek/deepseek-v4-pro',     // $0.87 — en lugar de deepseek-r1 ($2.15)
  reasoning: 'deepseek/deepseek-v4-pro',     // $0.87 — en lugar de deepseek-r1 ($2.15)
}

const BASE: Record<TaskType, string> = {
  fast:      'deepseek/deepseek-v4-flash',   // $0.28 — preguntas simples, datos
  chat:      'deepseek/deepseek-v4-pro',     // $0.87 — conversación general
  code:      'qwen/qwen3-coder-next',        // $0.80 — código especialista
  math:      'deepseek/deepseek-r1-0528',    // $2.15 — razonamiento matemático CoT
  reasoning: 'deepseek/deepseek-r1-0528',    // $2.15 — análisis profundo CoT
  creative:  'deepseek/deepseek-v4-pro',     // $0.87 — escribe muy bien
  document:  'qwen/qwen3.7-plus',            // $1.28 — 1M de contexto
}

// ESCALÓN MEDIO (Pro + tarea difícil): occidentales + chinos fuertes.
// Claude Sonnet (último) para lógica, Kimi para escritura, Gemini para docs.
const ESCALATE: Partial<Record<TaskType, string>> = {
  chat:      '~anthropic/claude-sonnet-latest', // Último Sonnet: conversación difícil
  code:      '~anthropic/claude-sonnet-latest', // Último Sonnet: código
  reasoning: '~anthropic/claude-sonnet-latest', // Último Sonnet: razonamiento
  creative:  'moonshotai/kimi-k2.6',            // $2.72 — escritura con estilo
  document:  '~google/gemini-pro-latest',       // Último Gemini Pro: 1M de contexto
}

// ÉLITE → lo mejor (Pro + nivel experto). Se dispara rarísimo.
const ELITE: Partial<Record<TaskType, string>> = {
  code:      '~anthropic/claude-opus-latest', // Último Opus: código experto
  reasoning: '~anthropic/claude-opus-latest', // Último Opus: razonamiento profundo
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓDIGO — modelos para programación.
// BASE usa Qwen (barato, $0.80); ESCALATE y ÉLITE usan Claude.
const CODE_TIERS = {
  base:     { prefixes: ['qwen/qwen3.8'],   fallback: 'qwen/qwen3-coder-next' },  // $0.80
  escalate: { prefixes: ['~anthropic/claude-sonnet-latest'], fallback: '~anthropic/claude-sonnet-latest' },
  elite:    { prefixes: ['~anthropic/claude-opus-latest'],   fallback: '~anthropic/claude-opus-latest' },
} as const

function codeModel(tier: keyof typeof CODE_TIERS): string {
  const t = CODE_TIERS[tier]
  return pickByPrefix([...t.prefixes], t.fallback)
}

// Modelos de puesto fijo. Van en una TABLA (y no en constantes sueltas) porque
// así el sanador del catálogo puede sustituirlos si mueren: una constante
// suelta es justo lo que se queda muerta durante semanas sin que nadie lo note.
const FIXED = {
  trivial:    'deepseek/deepseek-v4-flash',        // saludos: lo más barato
  vision:     'qwen/qwen3-vl-32b-instruct',        // $0.42 — visión fiable y barata
  visionPro:  '~anthropic/claude-sonnet-latest',    // Pro: visión top (último Sonnet)
  classifier: 'deepseek/deepseek-v4-flash',        // clasificador (barato y rápido)
}

// Los dos modelos de cada cadena del modo colaborativo (ver selectChain).
const CHAIN_MODELS = {
  reasoner:   'deepseek/deepseek-r1-0528',   // razona a fondo (CoT) — $2.15
  stylist:    'moonshotai/kimi-k2.6',        // escritura con estilo — $2.72
  mathWriter: 'qwen/qwen3-max-thinking',     // verifica y entrega — $3.90
  docPlanner: 'qwen/qwen3.7-plus',           // estructura con 1M de contexto — $1.28
}

// Auto-sanado + vigilancia: el refresco diario del catálogo mantiene estas
// tablas vivas (sustituye lo muerto, adopta versiones nuevas) y avisa de lo que
// no haya podido arreglar solo.
registerHealable('modelSelector.FREECAP', FREECAP as Record<string, string>)
registerHealable('modelSelector.BASE', BASE)
registerHealable('modelSelector.ESCALATE', ESCALATE as Record<string, string>)
registerHealable('modelSelector.ELITE', ELITE as Record<string, string>)
registerHealable('modelSelector.FIXED', FIXED)
registerHealable('modelSelector.CHAIN', CHAIN_MODELS)

// Modo local (desarrollo): si no hay key de OpenRouter y se define LOCAL_LLM_MODEL,
// TODOS los modelos de este archivo apuntan a ese modelo local (Ollama).
// Sin esto, selectBestModel() devuelve IDs de OpenRouter que Ollama no tiene → 404.
if (!process.env.OPENROUTER_API_KEY && process.env.LOCAL_LLM_MODEL) {
  const local = process.env.LOCAL_LLM_MODEL
  const patch = (obj: Record<string, unknown>) => { for (const k of Object.keys(obj)) obj[k] = local }
  patch(FIXED)
  patch(BASE)
  patch(FREECAP)
  patch(ESCALATE)
  patch(ELITE)
  patch(CHAIN_MODELS)
  for (const tier of Object.values(CODE_TIERS)) {
    const t = tier as unknown as { prefixes: string[]; fallback: string }; t.prefixes = [local]; t.fallback = local
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECCIÓN DE COMPLEJIDAD
// ─────────────────────────────────────────────────────────────────────────────
export type Complexity = 'trivial' | 'normal' | 'complex'

export function detectComplexity(message: string): Complexity {
  const m = message.trim().toLowerCase()
  const words = m.split(/\s+/).length

  if (
    words <= 6 &&
    /^(hola|hey|buenas|buenos|buen|ok|vale|gracias|listo|sí|si|no|adiós|chau|perfecto|genial|entendido|dale|claro|daya|ey|oye|bien|qué tal|cómo estás|cómo está|test|prueba|hi|hello|thanks|good)/.test(m)
  ) return 'trivial'

  if (
    words > 60 ||
    /analiza|compara|explica a fondo|estrategia|investiga|desarrolla|elabora un plan|paso a paso|en detalle|exhaustiv|profundidad|pros y contras|ventajas y desventajas|razona|justifica|demuestra|optimiza/.test(m)
  ) return 'complex'

  return 'normal'
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASIFICADOR IA — cubre el punto ciego del regex
// El regex es gratis y acierta cuando hay palabras clave. Su punto ciego es el
// mensaje ambiguo ("mira esto y dime qué opinas"), que cae en chat/normal por
// defecto. SOLO en ese caso se pregunta al modelo más barato del catálogo
// (~una fracción de centavo) con timeout de 1.2 s; si tarda o falla, manda el
// regex — la latencia nunca empeora más de 1.2 s y solo en mensajes ambiguos.
// ─────────────────────────────────────────────────────────────────────────────
const VALID_TASKS: TaskType[] = ['fast', 'chat', 'code', 'math', 'reasoning', 'creative', 'document']
const clsCache = new Map<string, { task: TaskType; complexity: Complexity }>()

export async function classifyMessage(message: string): Promise<{ task: TaskType; complexity: Complexity }> {
  const rxTask = detectTaskType(message)
  const rxCx = detectComplexity(message)
  // El regex es fiable cuando encontró señal: trivial, tarea concreta o complejidad clara.
  if (rxCx !== 'normal' || rxTask !== 'chat') return { task: rxTask, complexity: rxCx }

  const key = message.slice(0, 200)
  const hit = clsCache.get(key)
  if (hit) return hit

  try {
    const { default: getClient } = await import('./openrouter')
    const res = await Promise.race([
      getClient().chat.completions.create({
        model: FIXED.classifier,
        messages: [
          { role: 'system', content: 'Clasifica el mensaje del usuario para enrutarlo al modelo de IA adecuado. Responde SOLO este JSON: {"task":"fast|chat|code|math|reasoning|creative|document","complexity":"normal|complex"}. task=lo que el usuario NECESITA (code=programación, math=cálculo, document=generar informe/documento, creative=escritura creativa, reasoning=análisis profundo, fast=dato puntual, chat=conversación). complexity=complex solo si requiere trabajo elaborado.' },
          { role: 'user', content: message.slice(0, 1500) },
        ],
        max_tokens: 40,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 1200)),
    ])
    const parsed = JSON.parse(res?.choices?.[0]?.message?.content || '{}')
    const task: TaskType = VALID_TASKS.includes(parsed?.task) ? parsed.task : rxTask
    const complexity: Complexity = parsed?.complexity === 'complex' ? 'complex' : rxCx
    const out = { task, complexity }
    clsCache.set(key, out)
    if (clsCache.size > 300) clsCache.delete(clsCache.keys().next().value as string)
    return out
  } catch {
    return { task: rxTask, complexity: rxCx }
  }
}

// ¿Nivel EXPERTO? Es el gatillo de "cuándo entra la IA de élite" (Pro). Señales
// fuertes de una tarea de verdad difícil: mensaje muy largo, o marcadores
// explícitos de trabajo serio (arquitectura, producción, refactor, nivel senior…).
export function isExpert(message: string): boolean {
  const words = message.trim().split(/\s+/).length
  if (words > 110) return true
  return /arquitectura|refactoriz|optimiza(r)? a fondo|sistema completo|a nivel de producción|en producción|nivel senior|nivel experto|escalable|de alto rendimiento|thread-safe|concurren|algoritmo complejo|prueba (unitaria|de integración)|diseño de (sistema|base de datos)/i.test(message)
}

// `pre` (opcional): clasificación ya resuelta por classifyMessage — evita
// re-detectar y permite que el clasificador IA mejore el enrutado.
export function selectBestModel(message: string, plan: UserPlan = 'FREE', hasAttachment = false, pre?: { task: TaskType; complexity: Complexity }): string {
  const complexity = pre?.complexity ?? detectComplexity(message)
  const isPaid = plan !== 'FREE'   // Pro escala; FREE nunca

  // Adjunto → visión (Pro + difícil sube al modelo de visión grande)
  if (hasAttachment) {
    const model = isPaid && complexity === 'complex' ? FIXED.visionPro : FIXED.vision
    logger.info(`🧠 DAYA → adjunto | plan: ${plan} | modelo: ${model}`)
    return model
  }

  // Trivial ("hola", "gracias") → lo más barato, no importa el plan
  if (complexity === 'trivial') {
    logger.info(`🧠 DAYA → trivial | modelo: ${FIXED.trivial}`)
    return FIXED.trivial
  }

  const task = pre?.task ?? detectTaskType(message)

  // FREECAP: si es plan Gratis y la tarea tiene un tope, usamos ese en vez de BASE.
  // El techo duro evita que deepseek-r1 ($2.15) o qwen3.7-plus ($1.28) disparen
  // el coste de los mensajes gratis. El free nunca paga más de $0.87/1M out.
  let model
  if (!isPaid && FREECAP[task]) {
    model = task === 'code' ? codeModel('base') : FREECAP[task] as string
  } else {
    model = task === 'code' ? codeModel('base') : BASE[task]
  }

  // El candado + la magia: SOLO los planes de pago escalan, y solo en tareas
  // difíciles. El free se queda siempre en la base (coste ínfimo) o en FREECAP.
  // Tres niveles:
  //   normal          → BASE (barato, alta calidad) o FREECAP (Gratis, aún más barato)
  //   complejo        → la IA fuerte de la tarea (Sonnet / Kimi / Gemini)
  //   complejo+EXPERTO → la IA de ÉLITE (Opus)
  if (isPaid && complexity === 'complex') {
    if (task === 'code') model = codeModel('escalate')
    else if (ESCALATE[task]) model = ESCALATE[task] as string
    if (isExpert(message)) {
      if (task === 'code') model = codeModel('elite')
      else if (ELITE[task]) model = ELITE[task] as string
    }
  }

  logger.info(`🧠 DAYA → tarea: ${task} | complejidad: ${complexity} | plan: ${plan} | modelo: ${model}`)
  return model
}

export function getTaskInfo(message: string): { task: TaskType; emoji: string; label: string } {
  const task = detectTaskType(message)
  const info: Record<TaskType, { emoji: string; label: string }> = {
    fast:      { emoji: '⚡', label: 'Respuesta rápida' },
    chat:      { emoji: '💬', label: 'Conversación' },
    code:      { emoji: '💻', label: 'Código' },
    math:      { emoji: '🔢', label: 'Matemáticas' },
    reasoning: { emoji: '🧠', label: 'Análisis' },
    creative:  { emoji: '✍️', label: 'Escritura creativa' },
    document:  { emoji: '📄', label: 'Documento' },
  }
  return { task, ...info[task] }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODO CADENA — dos modelos colaboran para máxima calidad (SOLO planes de pago)
// Un especialista barato razona → el escritor entrega la respuesta pulida.
// Es parte del candado: el free tiene modelos top, pero la pulida de 2 es de pago.
// ─────────────────────────────────────────────────────────────────────────────
export interface ChainConfig {
  specialist: string
  writer:     string
  instruction: string
}

export function selectChain(message: string, plan: UserPlan): ChainConfig | null {
  if (plan === 'FREE') return null
  const wordCount = message.trim().split(/\s+/).length
  if (wordCount < 30) return null

  const task = detectTaskType(message)
  const complexity = detectComplexity(message)

  // Razonamiento: DeepSeek R1 analiza a fondo → el escritor redacta claro
  if (task === 'reasoning' && (complexity === 'complex' || wordCount > 50)) {
    return {
      specialist:  CHAIN_MODELS.reasoner,
      writer:      CHAIN_MODELS.stylist,
      instruction: 'Un modelo de razonamiento profundo ha analizado esta pregunta. Usa su análisis como base y responde al usuario de forma clara, bien estructurada y directa. Organiza las ideas, añade matices importantes y asegúrate de que sea fácil de entender.',
    }
  }

  // Matemáticas: R1 resuelve → Qwen Max Thinking verifica y entrega los pasos
  if (task === 'math' && complexity === 'complex') {
    return {
      specialist:  CHAIN_MODELS.reasoner,
      writer:      CHAIN_MODELS.mathWriter,
      instruction: 'Otro modelo ya trabajó el problema matemático. Verifica el razonamiento, identifica cualquier error, y entrega la solución final de forma clara con todos los pasos.',
    }
  }

  // Documento: Qwen 3.7 Plus estructura (1M de contexto) → Kimi escribe con estilo
  if (task === 'document' && wordCount > 40) {
    return {
      specialist:  CHAIN_MODELS.docPlanner,
      writer:      CHAIN_MODELS.stylist,
      instruction: 'Un modelo especializado ha estructurado el contenido. Toma esa estructura y conviértela en un documento final de alta calidad: prosa elegante, flujo natural, coherencia perfecta.',
    }
  }

  return null
}

// Exporta el modelo premium actual para otros servicios que lo necesiten
export const getActivePremiumModel = () => getPremiumModel()
