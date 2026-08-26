// ============================================
// DAYA IA — Orchestrator route v2: POST /api/orchestrator/run
// Runs the Plan-Execute-Evaluate state machine on a task.
// Supports SSE streaming (?stream=true) and checkpoint resume.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { heavyLimiter } from '../../middleware/rateLimiter'
import { prisma } from '../../lib/prisma'
import { runOrchestrator, OrchestratorStep, OrchestratorEvent } from './orchestrator'
import { ChatMessage } from '../../services/openrouter'

const router = Router()
router.use(requireAuth)

const devolverMensaje = (userId: string) =>
  prisma.$executeRaw`
    UPDATE "User" SET "messagesUsed" = GREATEST("messagesUsed" - 1, 0)
    WHERE id = ${userId}::"text"
  `.catch(() => {})

router.post('/run', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const task = String(req.body?.task || req.body?.message || '').trim()
  const stream = req.body?.stream === true || req.query?.stream === 'true'
  const resumeFrom = String(req.body?.resumeFrom || req.query?.resumeFrom || '').trim() || undefined
  const history: ChatMessage[] = Array.isArray(req.body?.history)
    ? req.body.history
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-6)
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 4000) }))
    : []

  if (!task) return res.status(400).json({ error: 'task is required' })

  // Reserve message
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, messagesUsed: true, messagesLimit: true },
  })
  if (!user) return res.status(401).json({ error: 'Sesión no válida.' })

  const reserved = await prisma.$executeRaw`
    UPDATE "User" SET "messagesUsed" = "messagesUsed" + 1
    WHERE id = ${userId}::"text" AND "messagesUsed" < "messagesLimit"
  `
  if ((reserved as number) === 0) {
    return res.status(429).json({ error: 'Límite de mensajes alcanzado.' })
  }

  // ── Streaming mode (SSE) ──
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform, no-store')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.flushHeaders?.()
    const socket = (req as any).socket
    if (socket) socket.setNoDelay(true)

    let clientGone = false
    req.on('close', () => { clientGone = true })

    const send = (data: Record<string, unknown>) => {
      if (clientGone || res.writableEnded) return
      res.write(`data: ${JSON.stringify(data)}\n\n`)
      if (typeof (res as any).flush === 'function') (res as any).flush()
    }

    // Heartbeat every 15s to keep connection alive during long orchestration
    const heartbeat = setInterval(() => {
      if (!clientGone && !res.writableEnded) res.write(': heartbeat\n\n')
    }, 15000)

    try {
      const result = await runOrchestrator(userId, task, history, {
        resumeFrom,
        onEvent: (event: OrchestratorEvent) => {
          if (clientGone) return
          send({ event: event.type, ...event })
        },
      })

      if (!result.answer.trim()) {
        await devolverMensaje(userId)
        send({ event: 'error', message: 'Orchestrator produced no answer.' })
      } else {
        send({
          event: 'done',
          traceId: result.traceId,
          state: result.state,
          iterations: result.iterations,
          totalDurationMs: result.totalDurationMs,
          totalCostUsd: result.totalCostUsd,
          steps: result.steps.map((s: OrchestratorStep) => ({
            tool: s.tool, iteration: s.iteration, success: s.success, durationMs: s.durationMs,
          })),
        })
      }
    } catch {
      await devolverMensaje(userId)
      send({ event: 'error', message: 'Orchestrator failed. Try again.' })
    } finally {
      clearInterval(heartbeat)
      if (!res.writableEnded) res.end()
    }
    return
  }

  // ── Synchronous mode ──
  try {
    const result = await runOrchestrator(userId, task, history, { resumeFrom })

    if (!result.answer.trim()) {
      await devolverMensaje(userId)
      return res.status(502).json({ error: 'Orchestrator produced no answer.' })
    }

    res.json({
      success: true,
      answer: result.answer,
      traceId: result.traceId,
      steps: result.steps.map((s: OrchestratorStep) => ({
        tool: s.tool,
        iteration: s.iteration,
        success: s.success,
        durationMs: s.durationMs,
        output: s.output.slice(0, 400),
      })),
      state: result.state,
      iterations: result.iterations,
      totalDurationMs: result.totalDurationMs,
      totalCostUsd: result.totalCostUsd,
    })
  } catch (e: any) {
    await devolverMensaje(userId)
    console.error('[orchestrator] error:', e.message)
    res.status(500).json({ error: 'Orchestrator failed. Try again.' })
  }
})

export default router
