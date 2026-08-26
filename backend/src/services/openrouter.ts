import OpenAI from 'openai'
import { registerHealable, reasoningFieldFor } from './modelCatalog'

// ── Cliente OpenRouter ────────────────────────────────────────────────────────
// Lazy singleton — el cliente se crea en el primer uso.
// Si falta la API key, lanzamos un error detallado en lugar de seguir con
// un valor que silenciaría el problema hasta la primera llamada real.
let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENROUTER_API_KEY
    const hasKey = !!apiKey
    // Modo local (desarrollo): sin key de OpenRouter pero con un endpoint compatible
    // con la API de OpenAI (p.ej. Ollama en LOCAL_LLM_BASE_URL=http://localhost:11434/v1).
    // Permite pulir en local sin gastar créditos. En producción SIEMPRE hay key → esta
    // rama se ignora y el comportamiento es idéntico al de siempre.
    const localBase = process.env.LOCAL_LLM_BASE_URL
    if (!hasKey && localBase) {
      _client = new OpenAI({ baseURL: localBase, apiKey: 'local', timeout: 120_000, maxRetries: 0 })
      return _client
    }
    if (!hasKey) {
      // En producción esto mata el proceso antes de responder al usuario.
      // En desarrollo da un mensaje claro en vez de un 401 confuso.
      throw new Error('[OpenRouter] OPENROUTER_API_KEY no está configurada. Agrégala al .env (o define LOCAL_LLM_BASE_URL para usar Ollama en local).')
    }
    _client = new OpenAI({
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
        'X-Title': 'DAYA AI',
      },
      timeout: 90_000,  // 90 s máximo por petición
      maxRetries: 0,    // los retries los manejamos nosotros (backoff personalizado)
    })
  }
  return _client
}

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO ABIERTO (jul 2026)
//
// Daya es open-source y funciona con CUALQUIER modelo de OpenRouter: Anthropic,
// OpenAI, Google, DeepSeek, Qwen, GLM, Kimi, Meta, Mistral, xAI y todos los
// demás. El catálogo se refresca a diario y el sanador mantiene los IDs vivos.
//
// Las CLAVES de este objeto son alias históricos (`claude`, `gpt4`, `gemini25`…)
// que se usan en decenas de sitios del código: se conservan a propósito para no
// tocar cada llamada. AHORA SÍ significan la marca que nombran.
//
// IDs verificados contra https://openrouter.ai/api/v1/models. Un ID muerto
// devuelve 404 y cae al fallback SIN avisar, así que al cambiar uno hay que
// comprobarlo antes contra el catálogo vivo.
// ─────────────────────────────────────────────────────────────────────────────
export const MODELS = {
  // ── Buque insignia (alias ~latest = OpenRouter auto-resuelve al último) ──
  claude:       '~anthropic/claude-sonnet-latest', // Sonnet más reciente (hoy sonnet-5)
  opus:        '~anthropic/claude-opus-latest',   // Opus más reciente (hoy opus-4.8)
  // ── Contexto largo / documentos ───────────────────────────────────────────
  gemini25:    '~google/gemini-pro-latest', // Gemini Pro más reciente, 1M ctx
  flash:       '~google/gemini-flash-latest', // Gemini Flash más reciente
  fast:        'deepseek/deepseek-v4-flash',         // ultra rápido para trivial, 1M ctx, $0.28
  // ── DeepSeek ──────────────────────────────────────────────────────────────
  reasoning:   'deepseek/deepseek-r1-0528',          // Razonamiento paso a paso (CoT)
  deepseekv3:  'deepseek/deepseek-v3.2',             // general, rápido, muy capaz
  // ── Chat general ──────────────────────────────────────────────────────────
  chat:        '~openai/gpt-latest',                 // GPT más reciente (hoy gpt-5.6-terra)
  // ── Matemáticas y visión ──────────────────────────────────────────────────
  math:        'qwen/qwen3-max-thinking',            // lógica formal con razonamiento
  gpt4:        '~openai/gpt-latest',                 // GPT más reciente (visión + general)
  // ── Código ────────────────────────────────────────────────────────────────
  // OJO, dos consumidores distintos:
  //  · El CLI DAYA Code (features/codeagent) usa codePro + glmPro + glm para
  //    mantener compatibilidad con sus propios flujos.
  //  · El chat, cuando detecta tarea de código, va por CODE_TIERS de
  //    modelSelector; `code` y `kimiCode` los expone además la API /v1.
  code:        '~anthropic/claude-sonnet-latest',    // Sonnet más reciente: lo mejor para código
  kimiCode:    'moonshotai/kimi-k2.7-code',          // Kimi especializado en código
  codePro:     '~anthropic/claude-sonnet-latest',    // DAYA Code: planificar y pasos difíciles
  glmPro:      'z-ai/glm-5.2',                       // GLM-5.2: pasos rutinarios de DAYA Code
  glm:         'z-ai/glm-4.7',                       // GLM-4.7: respaldo final de DAYA Code, $1.75
  glmair:      'z-ai/glm-4.7-flash',                 // GLM-4.7 Flash: más rápido/barato, $0.40
  // ── Otros ─────────────────────────────────────────────────────────────────
  writer:      'moonshotai/kimi-k2.6',               // el chino que mejor escribe: presentaciones y prosa
  grok:        '~x-ai/grok-latest',                  // Grok más reciente (hoy grok-4.20)
  mistral:     'mistralai/mistral-large',          // Mistral Large: multilingüe, 128k ctx
  fallback:    'meta-llama/llama-4-scout', // Llama 4 Scout: respaldo open-source gratuito
} as const
// Modo local (desarrollo): si no hay key de OpenRouter y se define LOCAL_LLM_MODEL,
// todos los alias apuntan a ese modelo local (p.ej. 'qwen2.5-coder:7b' de Ollama).
// Inerte en producción (siempre hay key de OpenRouter → no se toca nada).
if (!process.env.OPENROUTER_API_KEY && process.env.LOCAL_LLM_MODEL) {
  for (const k of Object.keys(MODELS)) (MODELS as Record<string, string>)[k] = process.env.LOCAL_LLM_MODEL
}
// Auto-sanado: el refresco diario del catálogo MANTIENE esta tabla al día — si
// un id desaparece de OpenRouter lo sustituye por el equivalente vivo, y si sale
// una versión superior de la misma línea la adopta (con guardarraíles de precio
// y capacidades; ver modelCatalog.ts). Como la tabla se muta en sitio, cualquier
// `MODELS.x` leído en tiempo de llamada ya viene corregido.
registerHealable('openrouter.MODELS', MODELS as unknown as Record<string, string>)

// Parámetros óptimos por familia de modelo — sacar el máximo de cada uno.
// Los reasoning models (DeepSeek R1, o4-mini) REQUIEREN temperature=1 y más tokens.
// Qwen Coder necesita temperatura muy baja para código determinístico y correcto.
// Gemini Flash Lite: rápido con ventana moderada.
const MODEL_PARAMS: Record<string, { temperature: number; maxTokens: number }> = {
  // Reasoning models: temperature=1 REQUERIDO, tokens altos para razonar
  'deepseek/deepseek-r1':                      { temperature: 1,    maxTokens: 8000 },
  'deepseek/deepseek-r1-0528':                 { temperature: 1,    maxTokens: 8000 },
  'qwen/qwen3-max-thinking':                   { temperature: 1,    maxTokens: 8000 },
  // Anthropic Claude
  '~anthropic/claude-sonnet-latest':           { temperature: 0.7,  maxTokens: 5000 },
  '~anthropic/claude-opus-latest':             { temperature: 0.7,  maxTokens: 6000 },
  'anthropic/claude-sonnet-4':                 { temperature: 0.7,  maxTokens: 5000 },
  'anthropic/claude-sonnet-4.5':               { temperature: 0.7,  maxTokens: 5000 },
  'anthropic/claude-sonnet-5':                 { temperature: 0.7,  maxTokens: 6000 },
  'anthropic/claude-opus-4':                   { temperature: 0.7,  maxTokens: 6000 },
  'anthropic/claude-opus-4.1':                 { temperature: 0.7,  maxTokens: 6000 },
  'anthropic/claude-opus-4.5':                 { temperature: 0.7,  maxTokens: 6000 },
  'anthropic/claude-opus-4.6':                 { temperature: 0.7,  maxTokens: 6000 },
  'anthropic/claude-opus-4.7':                 { temperature: 0.7,  maxTokens: 6000 },
  'anthropic/claude-opus-4.8':                 { temperature: 0.7,  maxTokens: 6000 },
  // OpenAI GPT
  '~openai/gpt-latest':                        { temperature: 0.7,  maxTokens: 5000 },
  'openai/gpt-4o-2024-11-20':                  { temperature: 0.7,  maxTokens: 4000 },
  'openai/gpt-5':                              { temperature: 0.7,  maxTokens: 5000 },
  'openai/gpt-5.1':                            { temperature: 0.7,  maxTokens: 5000 },
  'openai/gpt-5.4':                            { temperature: 0.7,  maxTokens: 5000 },
  'openai/gpt-5.5':                            { temperature: 0.7,  maxTokens: 5000 },
  // Google Gemini
  '~google/gemini-pro-latest':         { temperature: 0.6,  maxTokens: 5000 },
  '~google/gemini-flash-latest':       { temperature: 0.5,  maxTokens: 4000 },
  'google/gemini-2.5-pro':                     { temperature: 0.6,  maxTokens: 5000 },
  'google/gemini-2.5-flash':                   { temperature: 0.5,  maxTokens: 4000 },
  'google/gemini-2.5-flash-lite':              { temperature: 0.4,  maxTokens: 3000 },
  // Código: temperatura baja = determinístico y correcto
  'qwen/qwen-2.5-coder-32b-instruct':          { temperature: 0.05, maxTokens: 6000 },
  'qwen/qwen3-coder':                          { temperature: 0.2,  maxTokens: 6000 },
  'qwen/qwen3-coder-next':                     { temperature: 0.2,  maxTokens: 6000 },
  'qwen/qwen3-coder-plus':                     { temperature: 0.2,  maxTokens: 8000 },
  'moonshotai/kimi-k2.7-code':                 { temperature: 0.2,  maxTokens: 8000 },
  // Kimi (Moonshot): escritura con estilo y buque insignia
  'moonshotai/kimi-k3':                        { temperature: 0.7,  maxTokens: 5000 },
  'moonshotai/kimi-k2.6':                      { temperature: 0.75, maxTokens: 4000 },
  // Qwen (Alibaba): contexto largo y visión
  'qwen/qwen3.7-max':                          { temperature: 0.6,  maxTokens: 5000 },
  'qwen/qwen3.7-plus':                         { temperature: 0.6,  maxTokens: 4000 },
  'qwen/qwen3-max':                            { temperature: 0.7,  maxTokens: 4000 },
  'qwen/qwen3.5-plus-02-15':                   { temperature: 0.6,  maxTokens: 3500 },
  'qwen/qwen3-vl-235b-a22b-instruct':          { temperature: 0.6,  maxTokens: 4000 },
  'qwen/qwen3-vl-32b-instruct':                { temperature: 0.5,  maxTokens: 2500 },
  // DeepSeek (no reasoning: chat rápido y capaz)
  'deepseek/deepseek-chat':                     { temperature: 0.6,  maxTokens: 4000 },
  'deepseek/deepseek-v3.2':                     { temperature: 0.6,  maxTokens: 4000 },
  'deepseek/deepseek-v4-pro':                   { temperature: 0.65, maxTokens: 4000 },
  'deepseek/deepseek-v4-flash':                 { temperature: 0.5,  maxTokens: 2200 },
  // GLM (Z.ai): cerebro PRO del selector
  'z-ai/glm-5.2':                              { temperature: 0.7,  maxTokens: 4000 },
  'z-ai/glm-5.1':                              { temperature: 0.7,  maxTokens: 4000 },
  'z-ai/glm-4.7':                              { temperature: 0.65, maxTokens: 3500 },
  'z-ai/glm-4.6':                              { temperature: 0.65, maxTokens: 3500 },
  'z-ai/glm-4.7-flash':                        { temperature: 0.6,  maxTokens: 3000 },
  'z-ai/glm-4.5-air':                          { temperature: 0.6,  maxTokens: 3000 },
  // MiniMax: análisis, contexto larguísimo
  'minimax/minimax-m3':                        { temperature: 0.65, maxTokens: 3500 },
  // Meta Llama
  'meta-llama/llama-4-scout': { temperature: 0.5,  maxTokens: 4000 },
  // Mistral
  'mistralai/mistral-large':                { temperature: 0.65, maxTokens: 4000 },
  // xAI Grok
  '~x-ai/grok-latest':                           { temperature: 0.65, maxTokens: 3500 },
  'x-ai/grok-4.20':                              { temperature: 0.65, maxTokens: 3500 },
}

function getModelParams(modelId: string): { temperature: number; maxTokens: number } {
  return MODEL_PARAMS[modelId] ?? { temperature: 0.7, maxTokens: 3000 }
}

// Modelos que emiten <think>...</think> con razonamiento interno.
// Ese bloque NO debe llegar al usuario final.
const THINKING_MODELS = new Set([
  'deepseek/deepseek-r1',
  'deepseek/deepseek-r1-0528',
  'deepseek/deepseek-r1-distill-llama-70b',
  'qwen/qwen3-max-thinking',
  'qwen/qwen3-235b-a22b-thinking-2507',
  'moonshotai/kimi-k2-thinking',
  'anthropic/claude-opus-4', 'anthropic/claude-fable-5',
  '~anthropic/claude-opus-latest',
])

// ── Nivel de pensamiento (Rápido / Normal / Profundo) ───────────────────────
// 'normal' = comportamiento de hoy (no se toca nada). 'deep' = la IA piensa más.
export type ThinkLevel = 'fast' | 'normal' | 'deep'

// RESPALDO escrito a mano de quién acepta el parámetro `reasoning` y por qué
// campo ('effort' → reasoning: { effort }, 'tokens' → reasoning: { max_tokens }).
//
// La fuente BUENA es el catálogo vivo (`reasoningFieldFor`, más abajo en
// planThinking): esta tabla está indexada por id y los ids se sustituyen solos
// cuando el sanador cambia un modelo, así que por sí sola envejece en silencio —
// el modelo nuevo no aparece, cae a simular el razonamiento con CoT, y nadie se
// entera: sin error, sin log, solo respuestas peores y más caras.
//
// Se conserva porque el catálogo puede no estar todavía (primer arranque sin
// caché, o refresco fallido), y quedarse sin pensamiento por eso sería peor.
const REASONING_FIELD: Record<string, 'effort' | 'tokens'> = {
  '~anthropic/claude-sonnet-latest':           'effort',
  '~anthropic/claude-opus-latest':             'effort',
  '~openai/gpt-latest':                        'effort',
  '~google/gemini-pro-latest':                 'effort',
  '~google/gemini-flash-latest':               'effort',
  'anthropic/claude-sonnet-4':                 'effort',
  'anthropic/claude-opus-4':                   'effort',
  'openai/gpt-4o-2024-11-20':                  'effort',
  'google/gemini-2.5-pro':                     'effort',
  'google/gemini-2.5-flash':                   'effort',
  'deepseek/deepseek-v4-flash':                'effort',
  'deepseek/deepseek-v4-pro':                  'effort',
  'z-ai/glm-5.2':                              'effort',
  'moonshotai/kimi-k3':                        'effort',
  'deepseek/deepseek-r1-0528':                 'tokens',
  'qwen/qwen3-max-thinking':                   'tokens',
  'moonshotai/kimi-k2.6':                      'tokens',
  'moonshotai/kimi-k2.7-code':                 'tokens',
  'qwen/qwen3.7-max':                          'tokens',
  'qwen/qwen3.7-plus':                         'tokens',
  'qwen/qwen3.5-plus-02-15':                   'tokens',
  'z-ai/glm-5.1':                              'tokens',
  'z-ai/glm-4.7':                              'tokens',
  'z-ai/glm-4.7-flash':                        'tokens',
  'z-ai/glm-4.6':                              'tokens',
  'z-ai/glm-4.5-air':                          'tokens',
  'deepseek/deepseek-v3.2':                    'tokens',
  'minimax/minimax-m3':                        'tokens',
  'x-ai/grok-4.20':                            'tokens',
  'mistralai/mistral-large':                   'tokens',
  'meta-llama/llama-4-scout':                  'tokens',
}

// Instrucción CoT para modelos SIN razonamiento nativo: razona dentro de <think>
// (que ya filtramos) y entrega solo la respuesta final. No ensucia la salida.
const COT_INSTRUCTION = '\n\n[MODO PENSAMIENTO PROFUNDO] Antes de responder, razona el problema paso a paso DENTRO de un bloque <think>...</think> (analiza, considera alternativas y verifica). Después de cerrar </think>, escribe SOLO la respuesta final para el usuario, sin mencionar tu razonamiento ni el bloque.'

// Construye el plan de pensamiento para un modelo y nivel dados:
//  - reasoning: objeto a pasar a la API (o undefined)
//  - cot:       true si hay que inyectar la instrucción CoT + filtrar <think>
//  - extraTokens: presupuesto extra de tokens (para que el razonamiento no se
//                 coma la respuesta visible).
// Parámetro `reasoning` de OpenRouter (no estándar de OpenAI)
interface ReasoningConfig {
  effort?: 'high' | 'low'
  max_tokens?: number
  exclude?: boolean
}

function planThinking(modelId: string, level: ThinkLevel): { reasoning?: ReasoningConfig; cot: boolean; extraTokens: number } {
  if (level === 'normal') return { cot: false, extraTokens: 0 }   // ← sin cambios
  // Primero el catálogo vivo, que se actualiza solo con los modelos; la tabla de
  // arriba solo cubre el rato en que el catálogo aún no está.
  const field = reasoningFieldFor(modelId) || REASONING_FIELD[modelId]
  if (level === 'deep') {
    // exclude: false → OpenRouter transmite los tokens de razonamiento (delta.reasoning),
    // que mostramos en un bloque plegable en el chat.
    if (field === 'effort') return { reasoning: { effort: 'high', exclude: false }, cot: false, extraTokens: 4000 }
    if (field === 'tokens') return { reasoning: { max_tokens: 4000, exclude: false }, cot: false, extraTokens: 4000 }
    return { cot: true, extraTokens: 1500 }   // modelo sin razonamiento → CoT (<think>)
  }
  // fast: reduce el pensamiento donde se pueda; los no-reasoning ya son rápidos.
  if (field === 'effort') return { reasoning: { effort: 'low', exclude: true }, cot: false, extraTokens: 0 }
  if (field === 'tokens') return { reasoning: { max_tokens: 1024, exclude: true }, cot: false, extraTokens: 0 }
  return { cot: false, extraTokens: 0 }
}

// Un fragmento del stream: texto visible (string) o razonamiento oculto ({ __reasoning }).
export type StreamPart = string | { __reasoning: string }

// Filtra bloques <think>...</think> del stream en tiempo real (versión string→string,
// usada por chatChainStream, aiEditor y studio: el razonamiento se descarta).
async function* _filterThinking(raw: AsyncIterable<string>): AsyncGenerator<string> {
  const OPEN = '<think>'
  const CLOSE = '</think>'
  let inThink = false
  let pending = ''

  for await (const chunk of raw) {
    pending += chunk
    let out = ''
    while (pending.length > 0) {
      if (!inThink) {
        const idx = pending.indexOf(OPEN)
        if (idx === -1) {
          const safe = pending.length > OPEN.length ? pending.slice(0, pending.length - OPEN.length) : ''
          out += safe
          pending = pending.slice(safe.length)
          break
        }
        out += pending.slice(0, idx)
        pending = pending.slice(idx + OPEN.length)
        inThink = true
      } else {
        const idx = pending.indexOf(CLOSE)
        if (idx === -1) {
          pending = pending.length > CLOSE.length ? pending.slice(pending.length - CLOSE.length) : pending
          break
        }
        pending = pending.slice(idx + CLOSE.length)
        inThink = false
      }
    }
    if (out) yield out
  }
  if (!inThink && pending) yield pending
}

// Variante consciente del razonamiento (para chatStream en modo Profundo). Deja pasar
// los objetos { __reasoning } de la API y, si `emitReasoning`, emite el contenido de
// <think> como razonamiento en vez de descartarlo.
async function* filterThinkingParts(raw: AsyncIterable<StreamPart>, emitReasoning = false): AsyncGenerator<StreamPart> {
  const OPEN = '<think>'
  const CLOSE = '</think>'
  let inThink = false
  let pending = ''

  for await (const chunk of raw) {
    if (typeof chunk !== 'string') { yield chunk; continue }
    pending += chunk
    let out = ''
    let think = ''
    while (pending.length > 0) {
      if (!inThink) {
        const idx = pending.indexOf(OPEN)
        if (idx === -1) {
          const safe = pending.length > OPEN.length ? pending.slice(0, pending.length - OPEN.length) : ''
          out += safe
          pending = pending.slice(safe.length)
          break
        }
        out += pending.slice(0, idx)
        pending = pending.slice(idx + OPEN.length)
        inThink = true
      } else {
        const idx = pending.indexOf(CLOSE)
        if (idx === -1) {
          const safe = pending.length > CLOSE.length ? pending.slice(0, pending.length - CLOSE.length) : ''
          think += safe
          pending = pending.slice(safe.length)
          break
        }
        think += pending.slice(0, idx)
        pending = pending.slice(idx + CLOSE.length)
        inThink = false
      }
    }
    if (out) yield out
    if (think && emitReasoning) yield { __reasoning: think }
  }
  if (!inThink && pending) yield pending
}

export type ModelKey = keyof typeof MODELS
export type ModelId  = string

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls?: any[]
  tool_call_id?: string
}

// Convierte nuestros mensajes internos al formato que espera OpenAI SDK
export function toOpenAIMessages(messages: ChatMessage[]): any[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        content: m.content,
        tool_call_id: m.tool_call_id || 'unknown'
      }
    }
    return {
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls
    }
  })
}

// ── Utilidades de resiliencia ──────────────────────────────────────────────────

// Errores HTTP de la SDK/fetch: status en .status o .statusCode
function errStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown }
  return typeof e?.status === 'number' ? e.status : typeof e?.statusCode === 'number' ? e.statusCode : undefined
}
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Retries con backoff exponencial + jitter. Solo reintenta en errores transitorios.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseMs = 400): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const status = errStatus(err)
      // No reintentar en errores del cliente (4xx salvo 429)
      if (status && status >= 400 && status < 500 && status !== 429) throw err
      if (attempt < maxAttempts - 1) {
        const delay = baseMs * 2 ** attempt + Math.random() * 200
        await new Promise(r => setTimeout(r, delay))
        console.warn(`[OpenRouter] Intento ${attempt + 2}/${maxAttempts} tras error: ${errMsg(err)}`)
      }
    }
  }
  throw lastErr
}

// Encadena modelos de fallback: intenta primary → si 404/400 → prueba alternativas
async function withModelFallback<T>(
  primaryModel: string,
  fn: (model: string) => Promise<T>,
  fallbacks: string[] = [MODELS.claude, MODELS.fallback]
): Promise<T> {
  const chain = [primaryModel, ...fallbacks.filter(m => m !== primaryModel)]
  let lastErr: unknown
  for (const model of chain) {
    try {
      return await fn(model)
    } catch (err) {
      lastErr = err
      const status = errStatus(err)
      if (status === 404 || status === 400) {
        console.warn(`[OpenRouter] Modelo ${model} no disponible, probando siguiente...`)
        continue
      }
      throw err
    }
  }
  throw lastErr
}

// ── Chat simple ──────────────────────────────────────────────────────────────
export async function chatSingle(
  messages: ChatMessage[],
  model: ModelKey = 'claude',
  systemPrompt?: string,
  modelOverride?: string,
  maxTokens = 2000
): Promise<string> {
  const allMessages: ChatMessage[] = []
  if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt })
  allMessages.push(...messages)

  const primaryModel = modelOverride || MODELS[model] || MODELS.claude

  return withRetry(() =>
    withModelFallback(primaryModel, async (m) => {
      const res = await getClient().chat.completions.create({
        model: m,
        messages: toOpenAIMessages(allMessages),
        max_tokens: maxTokens,
      })
      return res.choices[0]?.message?.content ?? ''
    })
  )
}

// ── Modo Consejo: varios modelos en paralelo ──────────────────────────────────
export async function chatCouncil(
  userMessage: string,
  models: ModelKey[] = ['claude', 'gpt4', 'flash'],
  context?: ChatMessage[]
): Promise<{ model: ModelKey; modelName: string; response: string }[]> {
  return Promise.all(models.map(async (model) => {
    try {
      const messages: ChatMessage[] = [...(context || []), { role: 'user', content: userMessage }]
      const response = await chatSingle(messages, model)
      return { model, modelName: MODELS[model], response }
    } catch {
      return { model, modelName: MODELS[model], response: 'Este modelo no pudo responder.' }
    }
  }))
}

// ── Modo Batalla ──────────────────────────────────────────────────────────────
export async function chatBattle(
  userMessage: string,
  modelA: ModelKey = 'claude',
  modelB: ModelKey = 'gpt4'
): Promise<{ a: { model: ModelKey; response: string }; b: { model: ModelKey; response: string } }> {
  const [responseA, responseB] = await Promise.all([
    chatSingle([{ role: 'user', content: userMessage }], modelA),
    chatSingle([{ role: 'user', content: userMessage }], modelB),
  ])
  return { a: { model: modelA, response: responseA }, b: { model: modelB, response: responseB } }
}

// ── JSON estructurado ─────────────────────────────────────────────────────────
// Estrategia de parsing robusta:
//   1. Intenta con response_format json_object (nativo, el mejor)
// Resultado JSON "suelto": permite lectura de propiedades sin cast en los ~50
// puntos de llamada, manteniendo la seguridad de unknown (nada implícito-any).
export type JSONResult = Record<string, unknown>

//   2. Si el modelo no lo soporta → fallback sin format flag + repair manual
//   3. El repair es mínimo (solo lo imprescindible para no inventar datos)
export async function chatJSON(
  prompt: string,
  systemPrompt?: string,
  modelOverride?: string,
  maxTokens = 4000,
  temperature?: number
): Promise<JSONResult> {
  const messages: ChatMessage[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const model = modelOverride || MODELS.claude

  const extractJSON = (text: string): JSONResult => {
    // Limpia fences de markdown
    let c = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    // Busca el JSON entre el primer { y el último }
    const s = c.indexOf('{'), e = c.lastIndexOf('}')
    if (s !== -1 && e > s) c = c.slice(s, e + 1)

    // Intento directo
    try { return JSON.parse(c) as JSONResult } catch {}

    // Limpia caracteres de control dentro de strings
    let out = '', inStr = false, esc = false
    for (let i = 0; i < c.length; i++) {
      const ch = c[i], code = c.charCodeAt(i)
      if (esc) { out += ch; esc = false; continue }
      if (ch === '\\') { out += ch; esc = true; continue }
      if (ch === '"') { inStr = !inStr; out += ch; continue }
      if (inStr && code < 0x20) {
        if (ch === '\n') out += '\\n'
        else if (ch === '\r') out += '\\r'
        else if (ch === '\t') out += '\\t'
        else out += ' '
        continue
      }
      if (!inStr && (ch === '}' || ch === ']')) {
        const j = out.trimEnd()
        if (j.endsWith(',')) out = j.slice(0, -1)
      }
      out += ch
    }
    // Cierra estructuras abiertas
    let inStr2 = false, esc2 = false
    const stack: string[] = []
    for (const ch of out) {
      if (esc2) { esc2 = false; continue }
      if (ch === '\\') { esc2 = true; continue }
      if (ch === '"') inStr2 = !inStr2
      if (inStr2) continue
      if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') stack.pop()
    }
    if (inStr2) out += '"'
    out = out.replace(/,\s*$/, '')
    while (stack.length) out += stack.pop()

    return JSON.parse(out) as JSONResult
  }

  return withRetry(async () => {
    // Intento 1: con json_object nativo
    try {
      const res = await getClient().chat.completions.create({
        model, messages: toOpenAIMessages(messages), max_tokens: maxTokens,
        ...(temperature != null ? { temperature } : {}),
        response_format: { type: 'json_object' as const },
      })
      return extractJSON(res.choices[0]?.message?.content ?? '{}')
    } catch (err) {
      // Si el modelo no soporta json_object o hay error de parseo, fallback
      if (errStatus(err) === 400 || err instanceof SyntaxError) {
        const res = await getClient().chat.completions.create({
          model: MODELS.claude, messages: toOpenAIMessages(messages), max_tokens: maxTokens,
          ...(temperature != null ? { temperature } : {}),
        })
        return extractJSON(res.choices[0]?.message?.content ?? '{}')
      }
      throw err
    }
  })
}

// ── Streaming ─────────────────────────────────────────────────────────────────
// Modelos con soporte visual real en OpenRouter
const VISION_MODELS = new Set([
  'qwen/qwen3-vl-32b-instruct', 'qwen/qwen3-vl-235b-a22b-instruct',
  'qwen/qwen3.7-plus', 'qwen/qwen3.5-plus-02-15',
  'moonshotai/kimi-k3', 'moonshotai/kimi-k2.6', 'moonshotai/kimi-k2.7-code',
  'minimax/minimax-m3', 'z-ai/glm-4.6v',
  'anthropic/claude-sonnet-4', 'anthropic/claude-sonnet-5', 'anthropic/claude-opus-4', 'anthropic/claude-fable-5',
  'openai/gpt-4o-2024-11-20', 'openai/gpt-5', 'openai/gpt-5.1',
  'google/gemini-2.5-pro', 'google/gemini-2.5-flash',
  '~anthropic/claude-sonnet-latest', '~anthropic/claude-opus-latest',
  '~openai/gpt-latest',
  '~google/gemini-pro-latest', '~google/gemini-flash-latest',
  '~x-ai/grok-latest',
])

export async function* chatStream(
  messages: ChatMessage[],
  model: ModelKey = 'claude',
  systemPrompt?: string,
  modelOverride?: string,
  imageData?: string,
  thinkLevel: ThinkLevel = 'normal'
): AsyncGenerator<StreamPart> {
  let selectedModel = modelOverride || MODELS[model] || MODELS.claude

  // Plan de pensamiento según el modelo elegido y el nivel. 'normal' → sin cambios.
  const think = planThinking(selectedModel, thinkLevel)
  const showReasoning = thinkLevel === 'deep'   // en Profundo mostramos el razonamiento

  // Mensajes con contenido multimodal (texto + imagen) para la SDK
  type MultimodalMessage = {
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[]
  }
  const allMessages: MultimodalMessage[] = []
  // Si el modelo NO tiene razonamiento nativo y se pidió Profundo, inyectamos CoT
  // en el system prompt (la razona dentro de <think> y la filtramos después).
  const sys = think.cot ? `${systemPrompt || ''}${COT_INSTRUCTION}` : systemPrompt
  if (sys) allMessages.push({ role: 'system', content: sys })
  allMessages.push(...messages)

  // Imagen: si el modelo actual soporta visión → lo usamos. Si no → gpt-4o.
  if (imageData) {
    if (!VISION_MODELS.has(selectedModel)) selectedModel = MODELS.gpt4
    let lastIdx = -1
    for (let li = allMessages.length - 1; li >= 0; li--) { if (allMessages[li]?.role === 'user') { lastIdx = li; break } }
    if (lastIdx >= 0) {
      const last = allMessages[lastIdx]
      allMessages[lastIdx] = {
        role: 'user',
        content: [
          { type: 'text', text: typeof last.content === 'string' ? last.content : 'Analiza esta imagen.' },
          { type: 'image_url', image_url: { url: imageData } },
        ],
      }
    }
  }

  // Parámetros óptimos según el modelo (temperatura, tokens)
  const { temperature: modelTemp, maxTokens: modelMaxTokens } = getModelParams(selectedModel)
  // En Profundo damos tokens extra para que el razonamiento no se coma la respuesta.
  const maxTokens = imageData ? 2000 : modelMaxTokens + think.extraTokens

  // Intentar con el modelo seleccionado, luego encadenar fallbacks
  const modelsToTry = [selectedModel, MODELS.claude, MODELS.fallback].filter(
    (m, i, arr) => arr.indexOf(m) === i
  )

  // Chunk crudo del stream: delta con texto y/o razonamiento nativo de OpenRouter
  interface StreamDelta {
    content?: string | null
    reasoning?: string | null
  }
  interface RawStreamChunk {
    choices?: { delta?: StreamDelta }[]
  }
  // Parámetros que acepta OpenRouter: los de OpenAI + `reasoning` (extensión propia)
  interface OpenRouterStreamParams {
    model: string
    messages: MultimodalMessage[]
    max_tokens: number
    temperature: number
    stream: true
    reasoning?: ReasoningConfig
  }

  for (const m of modelsToTry) {
    try {
      // reasoning solo para el modelo concreto que soporta el parámetro (evita
      // errores en modelos que no lo entienden, cuyo manejo no está documentado).
      const reasoning = !imageData ? planThinking(m, thinkLevel).reasoning : undefined
      const params: OpenRouterStreamParams = {
        model: m,
        messages: allMessages,
        max_tokens: maxTokens,
        temperature: modelTemp,
        stream: true,
        ...(reasoning ? { reasoning } : {}),
      }
      const createParams = params as unknown as Parameters<
        ReturnType<typeof getClient>['chat']['completions']['create']
      >[0]

      async function* fromRaw(): AsyncGenerator<StreamPart> {
        const rawStream = await getClient().chat.completions.create(createParams)
        for await (const chunk of rawStream as unknown as AsyncIterable<RawStreamChunk>) {
          const delta = chunk.choices?.[0]?.delta
          // Razonamiento nativo (Claude/Gemini/o-series con exclude:false): campo aparte.
          const r = delta?.reasoning
          if (r && showReasoning) yield { __reasoning: r }
          const text = delta?.content
          if (text) yield text
        }
      }

      // Filtra <think> de los modelos que lo emiten nativamente Y del CoT inyectado.
      const outputStream = (THINKING_MODELS.has(m) || think.cot) ? filterThinkingParts(fromRaw(), showReasoning) : fromRaw()
      for await (const part of outputStream) yield part
      return
    } catch (err) {
      const status = errStatus(err)
      if (status === 404 || status === 400) {
        console.warn(`[OpenRouter] ${m} falló (${status}), intentando siguiente modelo...`)
        continue
      }
      throw err
    }
  }
  throw new Error('[OpenRouter] Todos los modelos fallaron.')
}

// ── Modo Cadena (Chain): dos modelos colaboran ────────────────────────────────
// El modelo especialista analiza el problema en profundidad (sin streaming).
// El escritor recibe ese análisis como contexto enriquecido y entrega la
// respuesta final al usuario (con streaming). El resultado es notoriamente
// mejor que usar un solo modelo.
//
// Uso típico:
//   - reasoning: DeepSeek R1 razona → Kimi escribe la respuesta
//   - document:  Gemini 2.5 Pro estructura → Claude pule la prosa
export async function* chatChainStream(
  messages: ChatMessage[],
  specialistModelId: string,
  writerModelId: string,
  systemPrompt: string,
  chainInstruction: string
): AsyncGenerator<StreamPart> {
  // Fase 1: el especialista analiza (no streaming, puede tomar 5-20s)
  let specialistOutput = ''
  try {
    const { temperature, maxTokens } = getModelParams(specialistModelId)
    const msgs: ChatMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages

    const res = await withRetry(() =>
      withModelFallback(specialistModelId, async (m) =>
        getClient().chat.completions.create({
          model: m, messages: toOpenAIMessages(msgs),
          max_tokens: Math.min(maxTokens, 4000),
          temperature,
        })
      )
    )
    specialistOutput = res.choices[0]?.message?.content ?? ''
    // Eliminar bloques <think> de modelos de razonamiento
    specialistOutput = specialistOutput.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  } catch (err) {
    console.warn('[Chain] Especialista falló, usando modo simple:', errMsg(err))
    yield* chatStream(messages, 'claude', systemPrompt, writerModelId)
    return
  }

  if (!specialistOutput) {
    yield* chatStream(messages, 'claude', systemPrompt, writerModelId)
    return
  }

  // Fase 2: Claude escribe la respuesta final enriquecida con el análisis
  const enrichedSystem = systemPrompt + `\n\n${chainInstruction}

[Análisis previo del modelo especialista — úsalo como base para tu respuesta:]
${specialistOutput.slice(0, 3000)}
[Fin del análisis]`

  yield* chatStream(messages, 'claude', enrichedSystem, writerModelId)
}

export default getClient
