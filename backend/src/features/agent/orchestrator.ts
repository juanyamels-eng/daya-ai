// ============================================
// DAYA IA — Agent Orchestrator v2: Plan-Execute-Evaluate state machine
// with streaming, cost tracking, observability, multi-agent delegation,
// and state persistence (checkpoint/resume).
//
// Features:
//   - SSE streaming: emits events for each step in real-time
//   - Cost tracking: logs every LLM call to the insights system
//   - Trace IDs: structured logging with correlation IDs
//   - Multi-agent: can delegate subtasks to specialized agents
//   - Checkpointing: saves state to DB for resume after interruption
// ============================================
import crypto from 'crypto'
import getClient, { MODELS, ChatMessage, toOpenAIMessages } from '../../services/openrouter'
import { logger } from '../../services/logger'
import { TOOLS_SCHEMAS, runTool, ToolSchema } from './tools'
import { getMcpToolSchemas, runMcpTool } from '../mcp/registry'
import { trackUsage } from '../insights/usageTracker'
import { prisma } from '../../lib/prisma'

const db = prisma

// ── Types ──

export type OrchestratorState = 'plan' | 'execute' | 'evaluate' | 'complete' | 'fail'

export interface OrchestratorStep {
  iteration: number
  tool: string
  input: Record<string, unknown>
  output: string
  mcpServer?: string
  success: boolean
  durationMs: number
}

export interface OrchestratorResult {
  answer: string
  steps: OrchestratorStep[]
  state: 'complete' | 'fail'
  iterations: number
  traceId: string
  totalDurationMs: number
  totalCostUsd: number
}

export interface OrchestratorOptions {
  maxIterations?: number
  plannerModel?: string
  executorModel?: string
  onEvent?: (event: OrchestratorEvent) => void
  resumeFrom?: string // checkpoint ID to resume from
}

export type OrchestratorEvent =
  | { type: 'start'; traceId: string; task: string }
  | { type: 'plan'; iteration: number; model: string }
  | { type: 'tool_start'; iteration: number; tool: string; args: Record<string, unknown> }
  | { type: 'tool_end'; iteration: number; tool: string; success: boolean; durationMs: number }
  | { type: 'evaluate'; iteration: number; verdict: 'continue' | 'done' }
  | { type: 'answer'; content: string }
  | { type: 'error'; message: string }
  | { type: 'checkpoint'; checkpointId: string; state: OrchestratorState; iteration: number }
  | { type: 'done'; traceId: string; totalDurationMs: number; totalCostUsd: number }

// ── Sub-agent definitions for multi-agent delegation ──

interface SubAgent {
  name: string
  trigger: (task: string) => boolean
  model: string
  systemPrompt: string
  tools: ToolSchema[]
  maxSteps: number
}

const SUB_AGENTS: SubAgent[] = [
  {
    name: 'researcher',
    trigger: (t) => /investiga|research|busca information|find out|análisis profundo|deep dive/i.test(t),
    model: MODELS.gemini25,
    systemPrompt: `Eres un agente de investigación. Tu trabajo es encontrar información precisa y relevante.
Usa herramientas de búsqueda web y lectura de URLs. Cita siempre las fuentes.
Entrega un informe estructurado con hallazgos clave.`,
    tools: TOOLS_SCHEMAS.filter(t => ['buscar_web', 'leer_url', 'buscar_en_documentos'].includes(t.function?.name)),
    maxSteps: 6,
  },
  {
    name: 'coder',
    trigger: (t) => /código|code|programa|implementa|escribe un|build|compila|test/i.test(t),
    model: MODELS.code,
    systemPrompt: `Eres un agente de código. Escribe código limpio, completo y funcional.
Usa el sandbox para ejecutar y verificar. Incluye dependencias y cómo ejecutarlo.`,
    tools: TOOLS_SCHEMAS.filter(t => ['sandbox_execute', 'calcular', 'crear_documento'].includes(t.function?.name)),
    maxSteps: 4,
  },
]

// ── Tracing ──

function genTraceId(): string {
  return `orch_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

function log(traceId: string, level: 'info' | 'warn' | 'error', msg: string, data?: Record<string, unknown>) {
  const prefix = `[orchestrator:${traceId.slice(-8)}]`
  const extra = data ? ' ' + JSON.stringify(data) : ''
  if (level === 'error') console.error(`${prefix} ${msg}${extra}`)
  else if (level === 'warn') console.warn(`${prefix} ${msg}${extra}`)
  else logger.info(`${prefix} ${msg}${extra}`)
}

// ── Cost tracking ──

async function trackLlmCall(userId: string, model: string, usage: Record<string, unknown> | undefined, feature: string): Promise<number> {
  try {
    return await trackUsage({
      userId,
      model,
      inputTokens: (usage as any)?.prompt_tokens,
      outputTokens: (usage as any)?.completion_tokens,
      feature,
    })
  } catch { return 0 }
}

// ── Checkpoint persistence ──

async function saveCheckpoint(userId: string, traceId: string, state: OrchestratorState, iteration: number, messages: ChatMessage[], steps: OrchestratorStep[]): Promise<string> {
  const id = `${traceId}_cp${iteration}`
  try {
    await db.dayaSystemConfig.upsert({
      where: { key: `orch_cp:${id}` },
      update: { value: JSON.stringify({ state, iteration, messages: messages.slice(-20), steps, userId, traceId, ts: Date.now() }) },
      create: { key: `orch_cp:${id}`, value: JSON.stringify({ state, iteration, messages: messages.slice(-20), steps, userId, traceId, ts: Date.now() }) },
    })
  } catch { /* best effort */ }
  return id
}

async function loadCheckpoint(checkpointId: string): Promise<{ state: OrchestratorState; iteration: number; messages: ChatMessage[]; steps: OrchestratorStep[] } | null> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: `orch_cp:${checkpointId}` } })
    if (!row) return null
    const data = JSON.parse(row.value)
    // Clean up old checkpoint
    db.dayaSystemConfig.delete({ where: { key: `orch_cp:${checkpointId}` } }).catch(() => {})
    return data
  } catch { return null }
}

// ── Sub-agent delegation ──

async function tryDelegate(userId: string, task: string, traceId: string): Promise<OrchestratorResult | null> {
  for (const agent of SUB_AGENTS) {
    if (!agent.trigger(task)) continue

    log(traceId, 'info', `Delegating to sub-agent: ${agent.name}`)
    const messages: ChatMessage[] = [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: task },
    ]
    const steps: OrchestratorStep[] = []

    for (let i = 0; i < agent.maxSteps; i++) {
      const res = await getClient().chat.completions.create({
        model: agent.model,
        messages: toOpenAIMessages(messages),
        tools: agent.tools,
        tool_choice: 'auto',
        max_tokens: 700,
        temperature: 0.3,
      })
      const msg = res.choices?.[0]?.message
      if (!msg) break

      await trackLlmCall(userId, agent.model, res.usage as unknown as Record<string, unknown>, `orchestrator:${agent.name}`)

      if (!msg.tool_calls?.length) {
        return {
          answer: msg.content || 'Sub-agent completed.',
          steps,
          state: 'complete',
          iterations: i + 1,
          traceId,
          totalDurationMs: 0,
          totalCostUsd: 0,
        }
      }

      // Convert OpenAI message to our ChatMessage format
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content || ''
      })
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
        const start = Date.now()
        const output = await runTool(userId, tc.function?.name, args)
        steps.push({
          iteration: i + 1, tool: tc.function?.name, input: args,
          output: output.slice(0, 800), success: !output.startsWith('ERROR'),
          durationMs: Date.now() - start,
        })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: output })
      }
    }

    // Sub-agent exhausted — return what it found
    if (steps.length) {
      return {
        answer: steps.map(s => `${s.tool}: ${s.output.slice(0, 200)}`).join('\n\n'),
        steps, state: 'complete', iterations: steps.length,
        traceId, totalDurationMs: 0, totalCostUsd: 0,
      }
    }
  }
  return null
}

// ── Main orchestrator ──

const DEFAULT_MAX_ITERATIONS = 8
const PLANNER_SYSTEM = `Eres el orquestador de DAYA, un sistema agente que planifica y ejecuta tareas complejas.

Tu proceso:
1. Analiza la tarea del usuario y determina qué herramientas necesitas.
2. Usa herramientas cuando hagan falta (varias y encadenadas si es necesario).
3. Después de cada ejecución, evalúa si la tarea está resuelta.
4. Si algo falla, ajusta tu plan y reintenta con un enfoque diferente.
5. Cuando tengas suficiente información, entrega la respuesta final.

Reglas:
- Usa SIEMPRE las herramientas disponibles en vez de inventar datos.
- Cita fuentes (URLs) cuando uses información de la web.
- Para operaciones numéricas, usa la herramienta calcular.
- Si generas contenido visual, inclúyelo en tu respuesta.
- Sé directo y eficiente: no uses más herramientas de las necesarias.
- Si una herramienta falla, analiza el error y adapta tu plan.`

export async function runOrchestrator(
  userId: string,
  task: string,
  history: ChatMessage[] = [],
  options: OrchestratorOptions = {},
): Promise<OrchestratorResult> {
  const startTime = Date.now()
  const traceId = genTraceId()
  const emit = options.onEvent || (() => {})
  let totalCostUsd = 0

  const {
    maxIterations = DEFAULT_MAX_ITERATIONS,
    plannerModel = MODELS.flash,
    executorModel = MODELS.claude,
  } = options

  emit({ type: 'start', traceId, task })
  log(traceId, 'info', `Starting orchestration`, { task: task.slice(0, 100) })

  // Try multi-agent delegation first
  const delegated = await tryDelegate(userId, task, traceId)
  if (delegated) {
    delegated.traceId = traceId
    delegated.totalDurationMs = Date.now() - startTime
    emit({ type: 'answer', content: delegated.answer })
    emit({ type: 'done', traceId, totalDurationMs: delegated.totalDurationMs, totalCostUsd: 0 })
    return delegated
  }

  // Resume from checkpoint if provided
  let messages: ChatMessage[]
  let steps: OrchestratorStep[]
  let currentState: OrchestratorState
  let iteration: number

  if (options.resumeFrom) {
    const checkpoint = await loadCheckpoint(options.resumeFrom)
    if (checkpoint) {
      messages = checkpoint.messages
      steps = checkpoint.steps
      currentState = checkpoint.state
      iteration = checkpoint.iteration
      log(traceId, 'info', `Resumed from checkpoint`, { checkpointId: options.resumeFrom, iteration })
    } else {
      messages = [{ role: 'system', content: PLANNER_SYSTEM }, ...history.slice(-6), { role: 'user', content: task }]
      steps = []
      currentState = 'plan'
      iteration = 0
    }
  } else {
    messages = [{ role: 'system', content: PLANNER_SYSTEM }, ...history.slice(-6), { role: 'user', content: task }]
steps = []
  currentState = 'plan'
  iteration = 0
}

  const allToolSchemas = [...TOOLS_SCHEMAS, ...getMcpToolSchemas()]

  while (currentState !== 'fail' && iteration < maxIterations) {
    iteration++

    switch (currentState) {
      case 'plan': {
        emit({ type: 'plan', iteration, model: plannerModel })
        log(traceId, 'info', `Plan phase`, { iteration, model: plannerModel })

        const planRes = await getClient().chat.completions.create({
          model: plannerModel,
          messages: toOpenAIMessages(messages),
          tools: allToolSchemas,
          tool_choice: 'auto',
          max_tokens: 700,
          temperature: 0.3,
        })

        totalCostUsd += await trackLlmCall(userId, plannerModel, planRes.usage as unknown as Record<string, unknown>, 'orchestrator:plan')

        const msg = planRes.choices?.[0]?.message
        if (!msg) { currentState = 'fail'; break }

        if (!msg.tool_calls?.length) {
          emit({ type: 'answer', content: msg.content || '' })
          const result: OrchestratorResult = {
            answer: msg.content || 'No pude generar una respuesta.',
            steps, state: 'complete', iterations: iteration,
            traceId, totalDurationMs: Date.now() - startTime, totalCostUsd,
          }
          emit({ type: 'done', traceId, totalDurationMs: result.totalDurationMs, totalCostUsd })
          return result
        }

        messages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content || ''
        })
        currentState = 'execute'
        break
      }

      case 'execute': {
        const lastMsg = messages[messages.length - 1]
        const toolCalls = lastMsg?.tool_calls
        if (!toolCalls?.length) { currentState = 'evaluate'; break }

        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
          const name = tc.function?.name

          emit({ type: 'tool_start', iteration, tool: name, args })
          log(traceId, 'info', `Tool: ${name}`, { iteration })

          const toolStart = Date.now()
          let output: string
          let mcpServer: string | undefined
          let success = true

          try {
            if (name?.startsWith('mcp__')) {
              mcpServer = name.split('__')[1]
              output = await runMcpTool(name, args)
            } else {
              output = await runTool(userId, name, args)
            }
          } catch (e: unknown) {
            const err = e as Error
            output = `ERROR: ${err.message}`
            success = false
          }

          if (output.startsWith('ERROR') || output.startsWith('La herramienta')) success = false
          const durationMs = Date.now() - toolStart

          steps.push({ iteration, tool: name, input: args, output: output.slice(0, 800), mcpServer, success, durationMs })
          emit({ type: 'tool_end', iteration, tool: name, success, durationMs })
messages.push({ role: 'assistant', content: output })
        }

        // Checkpoint after each execution step
        const cpId = await saveCheckpoint(userId, traceId, 'evaluate', iteration, messages, steps)
        emit({ type: 'checkpoint', checkpointId: cpId, state: 'evaluate', iteration })

        currentState = 'evaluate'
        break
      }

      case 'evaluate': {
        messages.push({
          role: 'user',
          content: `Iteración ${iteration}/${maxIterations}. Has ejecutado ${steps.length} herramienta(s). Evalúa:
- Si la tarea del usuario está RESUELTA: entrega tu mejor respuesta final AHORA.
- Si necesitas MÁS información o acciones: pide las herramientas que hagan falta.
- Si algo FALLÓ y puedes corregirlo: intenta un enfoque diferente.`,
        })
        const evalRes = await getClient().chat.completions.create({
          model: plannerModel,
          messages: toOpenAIMessages(messages),
          tools: allToolSchemas,
          tool_choice: 'auto',
          max_tokens: 700,
          temperature: 0.3,
        })

        totalCostUsd += await trackLlmCall(userId, plannerModel, evalRes.usage as unknown as Record<string, unknown>, 'orchestrator:evaluate')

        const evalMsg = evalRes.choices?.[0]?.message
        if (!evalMsg) { currentState = 'fail'; break }

        if (!evalMsg.tool_calls?.length) {
          emit({ type: 'evaluate', iteration, verdict: 'done' })
          emit({ type: 'answer', content: evalMsg.content || '' })
          const result: OrchestratorResult = {
            answer: evalMsg.content || 'Tarea completada.',
            steps, state: 'complete', iterations: iteration,
            traceId, totalDurationMs: Date.now() - startTime, totalCostUsd,
          }
          emit({ type: 'done', traceId, totalDurationMs: result.totalDurationMs, totalCostUsd })
          return result
        }

        emit({ type: 'evaluate', iteration, verdict: 'continue' })
        messages.push({
          role: evalMsg.role as 'user' | 'assistant' | 'system',
          content: evalMsg.content || ''
        })
        currentState = 'plan'
        break
      }
    }
  }

  // Exhausted — force final answer
  try {
    const forced = await getClient().chat.completions.create({
      model: executorModel,
      messages: toOpenAIMessages([...messages, { role: 'user', content: 'Da tu mejor respuesta final ahora con toda la información que has recopilado. No pidas más herramientas.' }]),
      max_tokens: 1500,
    })
    totalCostUsd += await trackLlmCall(userId, executorModel, forced.usage as unknown as Record<string, unknown>, 'orchestrator:forced')
    const answer = forced.choices?.[0]?.message?.content || 'No pude completar la tarea tras varios intentos.'
    emit({ type: 'answer', content: answer })
    const result: OrchestratorResult = {
      answer, steps, state: currentState === 'fail' ? 'fail' : 'complete', iterations: iteration,
      traceId, totalDurationMs: Date.now() - startTime, totalCostUsd,
    }
    emit({ type: 'done', traceId, totalDurationMs: result.totalDurationMs, totalCostUsd })
    return result
  } catch {
    emit({ type: 'error', message: 'Failed to generate final answer' })
    const result: OrchestratorResult = {
      answer: 'No pude completar la tarea. El orquestador agotó sus intentos.',
      steps, state: 'fail', iterations: iteration,
      traceId, totalDurationMs: Date.now() - startTime, totalCostUsd,
    }
    emit({ type: 'done', traceId, totalDurationMs: result.totalDurationMs, totalCostUsd })
    return result
  }
}
