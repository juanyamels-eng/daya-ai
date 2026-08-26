// ============================================================================
// DAYA IA — API compatible con OpenAI  (POST /v1/chat/completions)
//
// Convierte la suscripción de DAYA en un PROVEEDOR para cualquier herramienta
// del ecosistema: OpenCode, Cline, Continue, Zed, Aider, Kilo… Todas hablan el
// mismo dialecto (el de OpenAI), así que con este endpoint el usuario pone su
// token `dy_...` en su editor favorito y trabaja con los modelos de DAYA, su
// cuota y su facturación — sin que nosotros mantengamos ningún cliente.
//
// Por qué esto y no fusionar código ajeno: OpenCode (MIT) son 33 paquetes y
// 417 MB que cambian a diario. Interoperar da todo el valor sin heredar nada:
// aquí no hay una línea suya, así que tampoco hay obligación de licencia.
//
// Decisiones que importan:
//  · Solo planes con nivel PRO, igual que DAYA Code.
//  · La cuota se cobra por COSTE REAL, no por llamada: ver «Medición» abajo.
//    Si la llamada falla, lo reservado se devuelve.
//  · Los modelos se exponen con nombres de DAYA, no con los ids reales: el
//    catálogo interno puede cambiar (y el sanador lo cambia solo) sin romper
//    la configuración de nadie.
//  · Topes de tamaño: un agente puede mandar un repositorio entero, y con los
//    modelos caros eso se paga.
// ============================================================================
import { Router, Request, Response } from 'express'
import { requireApiToken } from '../../middleware/apiTokenAuth'
import { chatBurstLimiter } from '../../middleware/rateLimiter'
import { prisma } from '../../lib/prisma'
import getClient, { MODELS } from '../../services/openrouter'
import { resolveEffectivePlan, resetUsageIfDue } from '../../services/quota'
import { getMatrixLevel, PlanId, PLANS } from '../../config/plans'
import { trackUsage, estimateCost } from '../insights/usageTracker'

const router = Router()

// El middleware de token responde `{ error: "texto" }`, que es lo que espera el
// CLI de DAYA. Pero un cliente de OpenAI lee `error.message`: con una cadena se
// queda en undefined y el usuario ve un fallo genérico justo cuando el problema
// es concreto (token mal pegado o revocado). Aquí se traduce la respuesta del
// middleware al formato de OpenAI sin duplicar la validación del token.
function authOpenAI(req: Request, res: Response, next: () => void) {
  const jsonOriginal = res.json.bind(res)
  res.json = ((body: any) => {
    res.json = jsonOriginal
    if (body && typeof body.error === 'string') {
      return jsonOriginal({
        error: {
          message: body.error,
          type: res.statusCode === 401 ? 'authentication_error' : 'invalid_request_error',
          code: res.statusCode === 401 ? 'invalid_api_key' : 'invalid_request',
        },
      })
    }
    return jsonOriginal(body)
  }) as any
  requireApiToken(req, res, () => { res.json = jsonOriginal; next() })
}
router.use(authOpenAI)

// ── Catálogo público ────────────────────────────────────────────────────────
// El `alias` es la CLAVE de MODELS, no el id del modelo: hay que resolverlo en
// cada petición porque el sanador del catálogo reescribe MODELS en caliente.
// Los CINCO laboratorios chinos, para que nadie quede casado con un solo
// modelo: quien sepa lo que quiere elige por marca, y quien no, elige por lo
// que necesita (rápido / código / razonar). El id es estable; el nombre visible
// se completa en cada petición con el modelo real, así nunca miente aunque el
// sanador del catálogo cambie lo que hay debajo.
const CATALOG: { id: string; alias: keyof typeof MODELS; name: string }[] = [
  // Por lo que necesitas
  { id: 'daya',           alias: 'claude',    name: 'DAYA — equilibrado, 1M de contexto' },
  { id: 'daya-max',       alias: 'codePro',   name: 'DAYA Max — máxima calidad (el más caro)' },
  { id: 'daya-fast',      alias: 'fast',      name: 'DAYA Fast — el más rápido y barato' },
  { id: 'daya-code',      alias: 'code',      name: 'DAYA Code — especialista en código, muy barato' },
  { id: 'daya-code-pro',  alias: 'kimiCode',  name: 'DAYA Code Pro — código difícil, sin pagar el tope' },
  { id: 'daya-vision',    alias: 'gpt4',      name: 'DAYA Vision — entiende imágenes' },
  { id: 'daya-reasoning', alias: 'reasoning', name: 'DAYA Reasoning — razona paso a paso' },
  { id: 'daya-long',      alias: 'gemini25',  name: 'DAYA Long — documentos enormes' },
  // Por laboratorio, para quien prefiere elegir la marca
  { id: 'daya-deepseek',  alias: 'chat',      name: 'DeepSeek — conversación y escritura' },
  { id: 'daya-glm',       alias: 'glm',       name: 'GLM (Z.ai) — sólido y económico' },
  { id: 'daya-minimax',   alias: 'grok',      name: 'MiniMax — 1M de contexto, multimodal' },
  { id: 'daya-qwen',      alias: 'mistral',   name: 'Qwen (Alibaba) — multilingüe, 1M de contexto' },
]
const DEFAULT_ID = 'daya'

function resolveModel(requested: unknown): { id: string; real: string } {
  const asked = String(requested || '').trim().toLowerCase()
  const hit = CATALOG.find(m => m.id === asked)
    // Un id real del catálogo interno también vale, si es uno de los nuestros:
    // así nadie puede colar por aquí un modelo que DAYA no usa.
    || CATALOG.find(m => MODELS[m.alias] === asked)
    || CATALOG.find(m => m.id === DEFAULT_ID)!
  return { id: hit.id, real: MODELS[hit.alias] }
}

// ── Topes ───────────────────────────────────────────────────────────────────
const MAX_MESSAGES = 400
const MAX_CHARS = 600_000     // ~150k tokens de entrada
const MAX_TOOLS = 128
const MAX_OUTPUT = 8_000

function sizeOf(messages: any[]): number {
  let n = 0
  for (const m of messages) {
    if (typeof m?.content === 'string') n += m.content.length
    else if (Array.isArray(m?.content)) {
      for (const p of m.content) n += typeof p?.text === 'string' ? p.text.length : 0
    }
    if (Array.isArray(m?.tool_calls)) n += JSON.stringify(m.tool_calls).length
  }
  return n
}

// Error con la forma que esperan los clientes de OpenAI.
function fail(res: Response, status: number, message: string, code: string) {
  return res.status(status).json({ error: { message, type: 'invalid_request_error', code } })
}

// ── Medición por COSTE REAL, no por llamada ─────────────────────────────────
//
// Cobrar 1 mensaje por llamada trataba igual un «hola» del chat (2k tokens) y
// un paso de agente que manda medio repositorio (30k tokens y diez veces más
// caro). Con eso, los 3.000 mensajes del plan Pro daban para ~$43 de modelo
// contra $13 de ingreso: el techo del plan permitía perder dinero.
//
// Ahora una llamada consume tantos mensajes como CUESTE de verdad, usando la
// misma tabla de precios del panel de Insights. Ventajas: `daya-max` gasta más
// que `daya` solo, y si el sanador del catálogo cambia un modelo la cuenta se
// ajusta sola, sin tocar esto.
//
// MARGEN: cuánto se cobra por encima del coste. El precio del plan cubre
// también chat, imágenes, Studio y documentos, así que la API no puede
// llevarse el ingreso entero. Con 1.5 un Pro puede gastar como mucho ~$8.7 de
// modelo por la API — sostenible dentro de los $13. Subirlo aprieta más.
const MARGEN = 1.5

// Valor en dólares de UN mensaje de cuota, según lo que cuesta el plan.
function dolaresPorMensaje(plan: PlanId): number {
  const cfg = (PLANS as any)[plan] || PLANS.PRO
  const precio = cfg.priceUSD || 13
  const limite = cfg.messageLimit || 3000
  return (precio / limite) / MARGEN
}

// Cuántos mensajes de cuota vale esta llamada (mínimo 1, tope de seguridad).
function mensajesQueCuesta(plan: PlanId, model: string, inTok: number, outTok: number): number {
  const coste = estimateCost(model, inTok || 0, outTok || 0)
  const unidad = dolaresPorMensaje(plan)
  if (!unidad || !isFinite(unidad)) return 1
  return Math.max(1, Math.min(200, Math.ceil(coste / unidad)))
}

// Cobra los mensajes ADICIONALES una vez conocido el consumo real (ya se
// reservó 1 al empezar). Se permite pasarse del límite en la última llamada:
// cortar a mitad de una respuesta ya entregada sería peor experiencia, y la
// siguiente petición ya encuentra la cuota agotada.
async function cobrarExtra(userId: string, extra: number): Promise<void> {
  if (extra <= 0) return
  try {
    await prisma.$executeRaw`
      UPDATE "User" SET "messagesUsed" = "messagesUsed" + ${extra}
      WHERE id = ${userId}::text`
  } catch { /* nunca romper la respuesta por esto */ }
}

// ── Acceso: plan PRO + 1 mensaje de cuota por petición ───────────────────────
async function checkAccess(userId: string): Promise<{ ok: boolean; status?: number; error?: string; code?: string; plan?: PlanId }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, plan: true, planExpiresAt: true, usageResetAt: true, messagesUsed: true },
  }) as any
  if (!user) return { ok: false, status: 401, error: 'Usuario no encontrado.', code: 'invalid_api_key' }

  const plan = await resolveEffectivePlan(user)
  if (getMatrixLevel(plan as PlanId) !== 'PRO') {
    return { ok: false, status: 403, code: 'plan_required', error: 'La API de DAYA es exclusiva del plan Pro. Mejora tu plan en daya-ai.com → Planes.' }
  }
  await resetUsageIfDue(user)

  // Reserva atómica: el mismo patrón que el chat, para que dos peticiones
  // simultáneas no se cuelen por encima del límite.
  const reserved = await prisma.$executeRaw`
    UPDATE "User" SET "messagesUsed" = "messagesUsed" + 1
    WHERE id = ${userId}::text AND "messagesUsed" < "messagesLimit"`
  if (Number(reserved) === 0) {
    return { ok: false, status: 429, code: 'rate_limit_exceeded', error: 'Alcanzaste el límite de mensajes de tu plan. Las llamadas desde tu editor consumen cuota según el tamaño del contexto que envían.' }
  }
  return { ok: true, plan: plan as PlanId }
}

// Devuelve el mensaje reservado cuando la llamada al modelo no llegó a hacerse.
async function refund(userId: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "User" SET "messagesUsed" = GREATEST("messagesUsed" - 1, 0)
      WHERE id = ${userId}::text`
  } catch { /* nunca romper la respuesta por esto */ }
}

// ── GET /v1/models ──────────────────────────────────────────────────────────
// OpenCode y compañía exigen que los ids del config existan aquí.
router.get('/models', (_req: Request, res: Response) => {
  res.json({
    object: 'list',
    // El modelo real se añade al nombre EN CADA PETICIÓN, no se escribe fijo:
    // si el sanador del catálogo sustituye uno, el selector del editor enseña
    // la verdad sin que haya que desplegar nada.
    data: CATALOG.map(m => ({
      id: m.id,
      object: 'model',
      created: 0,
      owned_by: 'daya',
      name: `${m.name} · ${MODELS[m.alias]}`,
    })),
  })
})

// ── POST /v1/chat/completions ───────────────────────────────────────────────
router.post('/chat/completions', chatBurstLimiter, async (req: Request, res: Response) => {
  const userId = req.userId as string
  const body = req.body || {}
  const messages = Array.isArray(body.messages) ? body.messages : null

  if (!messages || !messages.length) return fail(res, 400, 'Falta el array messages.', 'invalid_request')
  if (messages.length > MAX_MESSAGES) return fail(res, 400, `Demasiados mensajes (máximo ${MAX_MESSAGES}).`, 'context_length_exceeded')
  const chars = sizeOf(messages)
  if (chars > MAX_CHARS) {
    return fail(res, 413, `La conversación es demasiado grande (${Math.round(chars / 1000)}k caracteres; el máximo es ${MAX_CHARS / 1000}k). Reduce el contexto que manda tu editor.`, 'context_length_exceeded')
  }
  if (Array.isArray(body.tools) && body.tools.length > MAX_TOOLS) {
    return fail(res, 400, `Demasiadas herramientas (máximo ${MAX_TOOLS}).`, 'invalid_request')
  }

  const access = await checkAccess(userId)
  if (!access.ok) return fail(res, access.status || 403, access.error || 'Sin acceso.', access.code || 'forbidden')

  const { id: publicId, real } = resolveModel(body.model)
  const stream = body.stream === true

  // Solo se reenvía lo que entendemos: nada de parámetros sueltos del cliente
  // que puedan cambiar el coste o el comportamiento sin control.
  const params: any = {
    model: real,
    messages,
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
    top_p: typeof body.top_p === 'number' ? body.top_p : undefined,
    max_tokens: Math.min(Number(body.max_tokens) || 4000, MAX_OUTPUT),
    stop: body.stop,
    seed: typeof body.seed === 'number' ? body.seed : undefined,
    response_format: body.response_format,
    tools: Array.isArray(body.tools) && body.tools.length ? body.tools : undefined,
    tool_choice: body.tool_choice,
    parallel_tool_calls: typeof body.parallel_tool_calls === 'boolean' ? body.parallel_tool_calls : undefined,
  }
  for (const k of Object.keys(params)) if (params[k] === undefined) delete params[k]

  try {
    if (!stream) {
      const completion: any = await getClient().chat.completions.create(params)
      const inTok = completion?.usage?.prompt_tokens
      const outTok = completion?.usage?.completion_tokens
      trackUsage({
        userId, model: real, inputTokens: inTok, outputTokens: outTok,
        outputText: completion?.choices?.[0]?.message?.content || '',
        feature: 'api',
      }).catch(() => {})
      const cuesta = mensajesQueCuesta(access.plan!, real, inTok, outTok)
      await cobrarExtra(userId, cuesta - 1)
      res.setHeader('X-Daya-Quota-Cost', String(cuesta))
      // Se devuelve el nombre público, no el id interno.
      return res.json({ ...completion, model: publicId })
    }

    // ── Streaming (SSE) ──────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    ;(res as any).flushHeaders?.()

    const upstream: any = await getClient().chat.completions.create({
      ...params,
      stream: true,
      stream_options: { include_usage: true },
    })

    // Si el editor corta (Ctrl+C), se aborta también contra el proveedor: si no,
    // seguiríamos pagando tokens de una respuesta que ya nadie va a leer.
    let aborted = false
    req.on('close', () => { aborted = true; try { upstream.controller?.abort() } catch {} })

    let usage: any = null
    let outputText = ''
    for await (const chunk of upstream) {
      if (aborted) break
      if (chunk?.usage) usage = chunk.usage
      const delta = chunk?.choices?.[0]?.delta?.content
      if (typeof delta === 'string') outputText += delta
      res.write(`data: ${JSON.stringify({ ...chunk, model: publicId })}\n\n`)
    }
    if (!aborted) res.write('data: [DONE]\n\n')
    res.end()

    trackUsage({
      userId, model: real,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      outputText,
      feature: 'api',
    }).catch(() => {})

    // El consumo real solo se conoce al terminar el stream: se cobra aquí. Si
    // el proveedor no reportó tokens, se estiman por el texto para no regalar
    // las llamadas grandes.
    const inTok = usage?.prompt_tokens ?? Math.ceil(sizeOf(messages) / 4)
    const outTok = usage?.completion_tokens ?? Math.ceil(outputText.length / 4)
    await cobrarExtra(userId, mensajesQueCuesta(access.plan!, real, inTok, outTok) - 1)
  } catch (e) {
    await refund(userId)
    const msg = e instanceof Error ? e.message : 'El modelo no respondió.'
    console.error('[api/v1] error:', msg)
    if (res.headersSent) { try { res.end() } catch {} return }
    return fail(res, 502, `No se pudo completar la petición: ${msg}`, 'upstream_error')
  }
})

export default router
