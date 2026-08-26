// ============================================
// DAYA IA — DAYA Code: proxy del agente de código (EXCLUSIVO del plan Pro)
// El CLI "DAYA Code" corre en la TERMINAL del usuario (archivos y comandos reales,
// como Claude Code). Este endpoint es solo el CEREBRO: recibe la conversación, llama
// al modelo con los esquemas de herramientas y devuelve el mensaje (texto o
// tool_calls). Las herramientas las EJECUTA el CLI en la máquina del usuario.
// Cerebro HÍBRIDO: Kimi K3 (el buque insignia) para planificar y para los pasos
// difíciles; GLM-5.2 (el GLM más potente) para los pasos rutinarios; GLM-4.7 de
// respaldo final. Máxima calidad donde importa, costo contenido donde no.
// OJO CON EL MARGEN: Kimi K3 cuesta $3 entrada / $15 salida por millón — es el
// modelo más caro del catálogo con diferencia, y en 'balanced' entra en CADA
// turno del usuario. Vigilar el coste por usuario de daya-code en Insights.
// Auth por token de API de DAYA → la clave de OpenRouter nunca sale del servidor.
// ============================================
import { Router, Request, Response } from 'express'
import type OpenAI from 'openai'
import { requireApiToken } from '../../middleware/apiTokenAuth'
import { chatBurstLimiter } from '../../middleware/rateLimiter'
import getClient, { MODELS } from '../../services/openrouter'
import { prisma } from '../../lib/prisma'
import { resolveEffectivePlan, resetUsageIfDue } from '../../services/quota'
import { getMatrixLevel, PlanId } from '../../config/plans'
import { trackUsage } from '../insights/usageTracker'

const router = Router()
router.use(requireApiToken)

// Usuario con campos de uso, tal y como los esperan los servicios de cuota.
interface UsageUser {
  id: string
  plan: PlanId
  planExpiresAt: Date | null
  usageResetAt: Date | null
  messagesUsed: number
  imagesUsed: number
  searchesUsed: number
  studioUsed: number
  documentsUsed: number
}

// Mensaje del CLI (formato OpenAI: role + content string o partes multimodales).
interface CliContentPart {
  type?: string
}
interface CliMessage {
  role?: string
  content?: string | CliContentPart[]
}

// Acceso y cuota en una pasada:
//  - DAYA Code es EXCLUSIVO de los planes con nivel PRO (Pro y Team) → 403 si no.
//  - Cada TAREA consume 1 mensaje de la cuota del plan (la misma del chat): se
//    cobra solo cuando llega una tarea nueva del usuario, no por cada paso
//    interno del agente. Mismo patrón atómico que el chat.
async function checkAccess(userId: string, isNewTask: boolean): Promise<{ ok: boolean; status?: number; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, plan: true, planExpiresAt: true, usageResetAt: true,
      messagesUsed: true, imagesUsed: true, searchesUsed: true, studioUsed: true, documentsUsed: true,
    },
  }) as UsageUser | null
  if (!user) return { ok: false, status: 401, error: 'Usuario no encontrado.' }
  const plan = await resolveEffectivePlan(user)
  if (getMatrixLevel(plan as PlanId) !== 'PRO') {
    return { ok: false, status: 403, error: 'DAYA Code es exclusivo del plan Pro. Mejora tu plan en daya-ai.com → Planes y vuelve a intentarlo.' }
  }
  await resetUsageIfDue(user)
  if (isNewTask) {
    const reserved = await prisma.$executeRaw`
      UPDATE "User" SET "messagesUsed" = "messagesUsed" + 1
      WHERE id = ${userId}::text AND "messagesUsed" < "messagesLimit"`
    if (Number(reserved) === 0) {
      return { ok: false, status: 429, error: 'Alcanzaste el límite de mensajes de tu plan (DAYA Code usa la misma cuota que el chat). Mejora tu plan para continuar.' }
    }
  }
  return { ok: true }
}

// ── Enrutador híbrido de cerebro ──────────────────────────────────────────────
// La frontera (sonnet-5) entra exactamente donde decide la calidad de la tarea;
// GLM-5.2 lleva los pasos rutinarios (leer resultados, encadenar herramientas).
// Señales, en orden:
//  1. Tarea nueva → el PLAN inicial marca toda la tarea: frontera.
//  2. Error reciente en herramientas → diagnóstico difícil: frontera.
//  3. Tarea larga (≥14 pasos del asistente) → el hilo se complicó: frontera.
//  4. Resto → GLM-5.2 (el GLM más potente).
const TOOL_ERROR_RE = /ERROR:|EXIT [1-9]\d*|Traceback|error TS\d|npm error|SyntaxError|ReferenceError|TypeError|FAILED|no aparece en el archivo|aparece \d+ veces/i

const hasRecentImage = (messages: CliMessage[]) =>
  messages.slice(-10).some((m) => Array.isArray(m?.content) && m.content.some((p) => p?.type === 'image_url'))
const hasRecentError = (messages: CliMessage[]) =>
  messages.slice(-6).some((m) => m?.role === 'tool' && TOOL_ERROR_RE.test(String(m.content || '')))

// mode:
//  - 'balanced' (por defecto): Kimi K3 planifica/errores/tareas largas, GLM-5.2 rutina.
//  - 'glm'  (económico): GLM-5.2 hace TODO; Kimi K3 solo si hay errores o imágenes.
//  - 'max'  (calidad):  Kimi K3 siempre.
function pickBrain(messages: CliMessage[], mode = 'balanced'): string {
  if (mode === 'max') return MODELS.codePro
  // La visión y los errores SIEMPRE justifican el buque insignia (GLM no tiene
  // visión; los errores difíciles los resuelve mejor Kimi), incluso en modo GLM.
  if (hasRecentImage(messages)) return MODELS.codePro
  if (hasRecentError(messages)) return MODELS.codePro
  if (mode === 'glm') return MODELS.glmPro   // GLM-5.2 lleva todo lo demás, incluido el plan
  // balanced:
  const last = messages[messages.length - 1]
  if (last?.role === 'user') return MODELS.codePro
  const assistantSteps = messages.reduce((n, m) => n + (m?.role === 'assistant' ? 1 : 0), 0)
  if (assistantSteps >= 14) return MODELS.codePro
  return MODELS.glmPro
}

// Esquemas de las herramientas que el CLI (v2) sabe ejecutar localmente.
export const CODE_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  { type: 'function', function: { name: 'read_file', description: 'Lee un archivo del proyecto. Devuelve líneas numeradas desde offset (0 por defecto), hasta limit líneas (400 por defecto). Úsalo antes de editar.', parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number', description: 'Línea inicial (0-index).' }, limit: { type: 'number', description: 'Máximo de líneas a leer.' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'edit_file', description: 'Edita un archivo EXISTENTE reemplazando old_text (texto EXACTO, único en el archivo) por new_text. Preferido sobre write_file para cambios: no reescribe el archivo entero.', parameters: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' }, all: { type: 'boolean', description: 'true para reemplazar todas las apariciones.' } }, required: ['path', 'old_text', 'new_text'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Crea un archivo nuevo (o sobreescribe uno entero, solo si de verdad hace falta).', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'list_dir', description: 'Lista archivos y carpetas de una ruta del proyecto.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'search_files', description: 'Busca un texto o regex en los archivos del proyecto (ignora node_modules, .git, dist…). Devuelve archivo:línea: contenido. Ideal para localizar código antes de leerlo.', parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string', description: 'Carpeta donde buscar (raíz por defecto).' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'run_command', description: 'Ejecuta un comando de shell en la raíz del proyecto y devuelve stdout+stderr y el código de salida. Úsalo para instalar, compilar, probar y verificar.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'delegar_exploracion', description: 'Delega una exploración de SOLO LECTURA a un subagente barato que busca, lee y resume por ti, y te devuelve un informe con rutas y hallazgos concretos. Úsalo para entender proyectos grandes o localizar dónde vive algo ANTES de actuar — mantiene tu contexto limpio. Puedes lanzar VARIOS en un mismo turno y corren en paralelo.', parameters: { type: 'object', properties: { objetivo: { type: 'string', description: 'Qué debe averiguar el subagente, concreto y verificable. Ej: "encuentra dónde se valida el login y qué librería de auth se usa".' } }, required: ['objetivo'] } } },
  { type: 'function', function: { name: 'ver_imagen', description: 'Mira una IMAGEN del proyecto (png, jpg, webp, gif): capturas de pantalla, mockups, diagramas. Úsala cuando el usuario mencione una captura/imagen o cuando entender un archivo de imagen sea necesario para la tarea. La imagen se te adjunta en el siguiente paso.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Ruta de la imagen dentro del proyecto.' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'plan_tareas', description: 'Mantén una lista de tareas VISIBLE para el usuario en trabajos de varios pasos. Al empezar una tarea grande, desglósala aquí. Envía la lista COMPLETA cada vez que algo cambie: marca "en_progreso" lo que estás haciendo y "hecho" lo terminado. Da visibilidad y te ayuda a no perder el hilo.', parameters: { type: 'object', properties: { tareas: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, estado: { type: 'string', enum: ['pendiente', 'en_progreso', 'hecho'] } }, required: ['texto', 'estado'] } } }, required: ['tareas'] } } },
]

// Herramientas del SUBAGENTE explorador: solo lectura, sin escribir ni ejecutar.
const EXPLORER_TOOLS = CODE_TOOLS.filter(t =>
  ['read_file', 'list_dir', 'search_files'].includes(t.function.name)
)

const EXPLORER_SYSTEM = `Eres un subagente explorador de DAYA Code. Tu ÚNICO trabajo: averiguar lo que pide el OBJETIVO dentro del proyecto del usuario, usando solo lectura (search_files para localizar, read_file para confirmar, list_dir para orientarte).
Reglas: ve directo al grano (pocas herramientas, bien elegidas), y termina con un INFORME breve y concreto: rutas exactas archivo:línea, qué hace cada pieza relevante y cualquier dato que el agente principal necesite para actuar. Nada de recomendaciones largas ni relleno. Si no encuentras algo, di exactamente qué buscaste y qué no apareció. Máximo ~6 pasos de herramientas.`

// Revisor cruzado (modo dúo): segundo par de ojos, riguroso y concreto.
const REVIEW_SYSTEM = `Eres un revisor de código senior en DAYA Code. Otro agente acaba de completar una tarea; tienes toda la conversación (los cambios hechos, comandos y resultados). Tu trabajo: revisarlo como un ingeniero exigente.
Busca SOLO problemas reales y accionables: bugs, requisitos del usuario que quedaron sin cumplir, cambios sin verificar (que no se probaron/compilaron), casos borde ignorados, o algo que pueda romper. No inventes problemas ni pidas mejoras cosméticas: si el trabajo cumple la tarea y está verificado, apruébalo. Sé conciso y específico (menciona archivos/funciones). Responde exactamente en el formato JSON que se te pide.`

const SYSTEM = `Eres DAYA Code, un agente de programación senior que trabaja en la TERMINAL del usuario, dentro de su proyecto real. Tus herramientas leen, buscan, editan y escriben archivos y ejecutan comandos en su máquina.

El primer mensaje incluye un [Contexto del proyecto] generado por el CLI: sistema operativo, estructura, package.json, git y reglas del repo (DAYA.md/CLAUDE.md). ÚSALO: adapta los comandos al SO del usuario (en Windows: PowerShell/cmd, rutas con \\; en macOS/Linux: sh) y respeta las reglas del repo si las hay.

Método de trabajo:
0. Para tareas de VARIOS pasos, empieza con plan_tareas para desglosar el trabajo, y ve actualizándolo (en_progreso / hecho) a medida que avanzas: da visibilidad al usuario y te mantiene enfocado.
1. EXPLORA primero: search_files para localizar código, list_dir para orientarte, read_file antes de tocar cualquier archivo. Nunca edites a ciegas. En proyectos grandes o preguntas amplias, DELEGA con delegar_exploracion (lanza varios en paralelo si hay frentes distintos) y actúa sobre sus informes: mantiene tu contexto limpio.
2. CAMBIOS QUIRÚRGICOS: usa edit_file con el texto exacto que leíste; write_file solo para archivos nuevos. No reformatees ni cambies lo que no se pidió.
3. VERIFICA: tras cambiar, ejecuta el build, los tests o el programa con run_command y corrige si algo falla. No des nada por hecho sin comprobarlo.
4. Si un comando falla, lee el error completo, diagnostica y arregla la causa raíz — no lo reintentes igual.

INSTALAR dependencias: usa run_command con el gestor del proyecto (npm/pnpm/yarn install, pip install -r requirements.txt, etc.). Comprueba en el contexto qué herramientas hay disponibles; si falta una (p. ej. python o gh), dilo claramente en vez de asumir.

SUBIR A GITHUB (importante — los comandos NO son interactivos, así que la autenticación debe estar ya resuelta):
- Mira el [Contexto del proyecto]: te dice si es un repo, si hay remoto, y si el gh CLI está autenticado.
- Repo nuevo → git init, añade un .gitignore adecuado, git add -A, git commit -m "…". Configura user.name/email con git config si faltan (el contexto lo avisa).
- Crear el repo en GitHub y subirlo de una: si gh está AUTENTICADO, usa \`gh repo create <nombre> --source=. --push --public\` (o --private). Es la vía más fiable.
- Si NO hay gh autenticado ni remoto: haz todo el trabajo local (init, commit) y explícale al usuario el ÚNICO paso que le toca a él (correr \`gh auth login\`, o crear el repo y darte la URL del remoto). git push por HTTPS sin credenciales cacheadas FALLA (no puede pedir usuario/clave). Nunca escribas tokens ni contraseñas en comandos ni archivos.

CREAR JUEGOS y apps: eres plenamente capaz. Elige la tecnología adecuada (juego web → HTML5 canvas o un framework como Phaser en un index.html autocontenido; juego de terminal/lógica → Node o Python; pygame si está instalado). Escribe el código completo y VERIFICA que corre (node/python para la lógica; para un juego web, comprueba que no hay errores y dile al usuario cómo abrirlo). Si el usuario comparte una captura de cómo debe verse, usa ver_imagen.

Sé prudente: nada de comandos destructivos (rm -rf, git reset --hard, push --force, drop) salvo que el usuario lo pida explícitamente. Nunca expongas secretos ni los escribas en el código.
Al terminar, resume en español y en pocas líneas qué hiciste y cómo lo verificaste. Nunca inventes rutas ni resultados: usa las herramientas para saber la verdad.`

// POST /api/codeagent/step  { messages: [...] }  (sin el system; lo pone el servidor)
router.post('/step', chatBurstLimiter, async (req: Request, res: Response) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null
  if (!messages) return res.status(400).json({ error: 'Falta el array messages.' })
  if (messages.length > 200) return res.status(400).json({ error: 'Conversación demasiado larga.' })
  const userId = req.userId

  // Subagente explorador (CLI v2.3+): modelo barato, solo herramientas de
  // lectura, sin cobrar cuota (sus pasos son parte de la tarea ya cobrada).
  const isExplorer = req.body?.agent === 'explorer'

  // Gating Pro en TODOS los pasos; la cuota se cobra solo en tarea nueva
  // (último mensaje del usuario). Los pasos intermedios y los subagentes no cobran.
  const last = messages[messages.length - 1]
  const access = await checkAccess(userId, !isExplorer && last?.role === 'user')
  if (!access.ok) return res.status(access.status || 403).json({ error: access.error })

  if (isExplorer) {
    try {
      const completion = await getClient().chat.completions.create({
        model: MODELS.glm,
        messages: [{ role: 'system', content: EXPLORER_SYSTEM }, ...messages] as OpenAI.Chat.ChatCompletionMessageParam[],
        tools: EXPLORER_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 2000,
      })
      const message = completion.choices?.[0]?.message
      trackUsage({
        userId, model: MODELS.glm,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        outputText: message?.content || '',
        feature: 'daya-code',
      }).catch(() => {})
      return res.json({ message })
    } catch (e) {
      console.error('[codeagent] error (explorer):', e instanceof Error ? e.message : e)
      return res.status(502).json({ error: 'El subagente no respondió. Intenta de nuevo.' })
    }
  }

  // Revisión cruzada (modo dúo): el OTRO modelo revisa el trabajo ya hecho como
  // crítico senior. Ve toda la conversación (herramientas y resultados incluidos)
  // y devuelve { ok, feedback }. No cobra cuota (es parte de la tarea).
  if (req.body?.review === true) {
    const reviewer = req.body?.reviewer === 'glm' ? MODELS.glmPro : MODELS.codePro
    try {
      const completion = await getClient().chat.completions.create({
        model: reviewer,
        messages: [
          { role: 'system', content: REVIEW_SYSTEM },
          ...messages,
          { role: 'user', content: 'REVISA el trabajo anterior. Responde SOLO este JSON: {"ok": true|false, "feedback": "si ok=false, la lista concreta de problemas a corregir; si ok=true, cadena vacía"}.' },
        ] as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      })
      let verdict: { ok?: boolean; feedback?: string } = { ok: true, feedback: '' }
      try { verdict = JSON.parse(completion.choices?.[0]?.message?.content || '{}') } catch {}
      trackUsage({ userId, model: reviewer, inputTokens: completion.usage?.prompt_tokens, outputTokens: completion.usage?.completion_tokens, feature: 'daya-code' }).catch(() => {})
      return res.json({ review: { ok: verdict.ok !== false, feedback: String(verdict.feedback || '').slice(0, 4000) } })
    } catch (e) {
      console.error('[codeagent] error (review):', e instanceof Error ? e.message : e)
      // Si el revisor falla, no bloqueamos la tarea: se aprueba por defecto.
      return res.json({ review: { ok: true, feedback: '' } })
    }
  }

  // Enrutado híbrido + respaldo por disponibilidad (404/400 → siguiente).
  const mode = ['balanced', 'glm', 'max'].includes(req.body?.mode) ? req.body.mode : 'balanced'
  const picked = pickBrain(messages, mode)
  const BRAIN_CHAIN = picked === MODELS.codePro
    ? [MODELS.codePro, MODELS.glmPro, MODELS.glm]
    : [picked, MODELS.glm]
  const fullMessages = [{ role: 'system', content: SYSTEM }, ...messages] as OpenAI.Chat.ChatCompletionMessageParam[]

  // Herramientas MCP dinámicas (CLI v3.1+): el CLI descubre tools de servidores
  // MCP externos y las envía como extraTools. Se validan y se añaden a las del
  // modelo. Nombre esperado: mcp__<servidor>__<tool>. Topes anti-abuso.
  const extraTools: OpenAI.Chat.ChatCompletionTool[] = []
  if (Array.isArray(req.body?.extraTools)) {
    for (const t of req.body.extraTools.slice(0, 40)) {
      const name = t?.function?.name
      if (typeof name !== 'string' || !/^mcp__[a-z0-9_.-]{1,40}__[a-z0-9_.-]{1,50}$/i.test(name)) continue
      extraTools.push({
        type: 'function',
        function: {
          name,
          description: String(t.function.description || '').slice(0, 600),
          parameters: (t.function.parameters && typeof t.function.parameters === 'object') ? t.function.parameters : { type: 'object', properties: {} },
        },
      })
    }
  }
  const toolsForModel = extraTools.length ? [...CODE_TOOLS, ...extraTools] : CODE_TOOLS
  // Registro para "Uso e Insights" (no bloquea la respuesta). Si el stream no
  // trae usage, estima la entrada desde los mensajes para no subreportar costo.
  const track = (usedModel: string, outputText: string, usage?: OpenAI.CompletionUsage) => {
    trackUsage({
      userId,
      model: usedModel,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      inputText: usage?.prompt_tokens ? undefined : JSON.stringify(messages).slice(0, 120000),
      outputText,
      feature: 'daya-code',
    }).catch(() => {})
  }

  // ── Modo STREAMING (CLI v2.2+, body.stream === true): SSE con el texto en
  //    vivo. Los tool_calls llegan fragmentados del modelo y se ensamblan aquí;
  //    al final el CLI recibe el mensaje completo, igual que en el modo clásico.
  if (req.body?.stream === true) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    try {
      let lastErr: unknown = null
      for (const model of BRAIN_CHAIN) {
        try {
          const stream = await getClient().chat.completions.create({
            model,
            messages: fullMessages,
            tools: toolsForModel,
            tool_choice: 'auto',
            temperature: 0.3,
            max_tokens: 4000,
            stream: true,
          })
          let content = ''
          const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = []
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta
            if (delta?.content) { content += delta.content; send({ type: 'text', delta: delta.content }) }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0
                if (!toolCalls[idx]) toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } }
                if (tc.id) toolCalls[idx].id = tc.id
                if (tc.function?.name) toolCalls[idx].function.name += tc.function.name
                if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments
              }
            }
          }
          const message: { role: 'assistant'; content: string | null; tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[] } = { role: 'assistant', content: content || null }
          const assembled = toolCalls.filter(Boolean)
          if (assembled.length) message.tool_calls = assembled
          track(model, content)
          send({ type: 'done', message })
          res.end()
          return
        } catch (e) {
          lastErr = e
          const err = e as { status?: number; statusCode?: number }
          const status = err?.status ?? err?.statusCode
          if (status === 404 || status === 400) {
            console.warn(`[codeagent] ${model} no disponible (${status}), probando respaldo...`)
            continue
          }
          throw e
        }
      }
      throw lastErr || new Error('sin modelo disponible')
    } catch (e) {
      console.error('[codeagent] error (stream):', e instanceof Error ? e.message : e)
      send({ type: 'error', error: 'El modelo no respondió. Intenta de nuevo.' })
      res.end()
    }
    return
  }

  // ── Modo clásico (compatibilidad con CLIs anteriores): JSON completo ──
  try {
    let completion: OpenAI.Chat.ChatCompletion | null = null
    let usedModel = BRAIN_CHAIN[0]
    let lastErr: unknown = null
    for (const model of BRAIN_CHAIN) {
      try {
        completion = await getClient().chat.completions.create({
          model,
          messages: fullMessages,
          tools: toolsForModel,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 4000,
        })
        usedModel = model
        break
      } catch (e) {
        lastErr = e
        const err = e as { status?: number; statusCode?: number }
        const status = err?.status ?? err?.statusCode
        if (status === 404 || status === 400) {
          console.warn(`[codeagent] ${model} no disponible (${status}), probando respaldo...`)
          continue
        }
        throw e
      }
    }
    if (!completion) throw lastErr || new Error('sin modelo disponible')

    const message = completion.choices?.[0]?.message
    track(usedModel, message?.content || '', completion.usage)
    res.json({ message })
  } catch (e) {
    console.error('[codeagent] error:', e instanceof Error ? e.message : e)
    res.status(502).json({ error: 'El modelo no respondió. Intenta de nuevo.' })
  }
})

export default router
