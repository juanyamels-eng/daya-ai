import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { childLogger } from '../../services/logger'

const db = prisma as any
const log = childLogger('agent-composition')
const router = Router()

// ============================================
// AGENT COMPOSITION — Chain agents into pipelines
// Agent A → Agent B → Agent C → Final Output
// ============================================

// Create a pipeline
router.post('/pipelines', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { name, description, steps } = req.body

  if (!name || !steps || !Array.isArray(steps) || steps.length < 2) {
    return res.status(400).json({ error: 'name y al menos 2 steps requeridos' })
  }

  // Validate each step has an agentId
  for (const step of steps) {
    if (!step.agentId) return res.status(400).json({ error: 'Cada step necesita un agentId' })
  }

  const pipeline = await db.dayaSystemConfig.create({
    data: {
      key: `pipeline:${userId}:${Date.now().toString(36)}`,
      value: { name, description, steps, createdBy: userId, createdAt: new Date().toISOString() },
    },
  })

  res.json({ pipeline: { id: pipeline.key, ...pipeline.value } })
})

// List my pipelines
router.get('/pipelines', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId

  const configs = await db.dayaSystemConfig.findMany({
    where: { key: { startsWith: `pipeline:${userId}:` } },
  })

  const pipelines = configs.map((c: any) => ({
    id: c.key,
    ...c.value,
  }))

  res.json({ pipelines })
})

// Get pipeline details
router.get('/pipelines/:pipelineId', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { pipelineId } = req.params

  const config = await db.dayaSystemConfig.findUnique({ where: { key: pipelineId } })
  if (!config) return res.status(404).json({ error: 'Pipeline no encontrado' })

  const value = config.value as any
  if (value.createdBy !== userId) return res.status(403).json({ error: 'No autorizado' })

  res.json({ pipeline: { id: config.key, ...value } })
})

// Delete pipeline
router.delete('/pipelines/:pipelineId', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { pipelineId } = req.params

  const config = await db.dayaSystemConfig.findUnique({ where: { key: pipelineId } })
  if (!config) return res.status(404).json({ error: 'Pipeline no encontrado' })

  const value = config.value as any
  if (value.createdBy !== userId) return res.status(403).json({ error: 'No autorizado' })

  await db.dayaSystemConfig.delete({ where: { key: pipelineId } })
  res.json({ ok: true })
})

// Run a pipeline
router.post('/pipelines/:pipelineId/run', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { pipelineId } = req.params
  const { input } = req.body

  if (!input) return res.status(400).json({ error: 'input requerido' })

  const config = await db.dayaSystemConfig.findUnique({ where: { key: pipelineId } })
  if (!config) return res.status(404).json({ error: 'Pipeline no encontrado' })

  const value = config.value as any
  if (value.createdBy !== userId) return res.status(403).json({ error: 'No autorizado' })

  const steps = value.steps as { agentId: string; instruction?: string }[]
  const results: { step: number; agentId: string; output: string; model: string; duration: number }[] = []

  let currentInput = input
  const { chatSingle } = await import('../../services/openrouter')

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const agent = await db.aiAgent.findFirst({ where: { id: step.agentId, userId } })

    if (!agent) {
      return res.status(404).json({ error: `Agent ${step.agentId} no encontrado en step ${i + 1}` })
    }

    const systemMessage = agent.systemPrompt
    const instruction = step.instruction ? `\n\nAdditional instruction: ${step.instruction}` : ''
    const prompt = i === 0
      ? currentInput + instruction
      : `Previous agent output:\n\n${currentInput}\n\nYour task:${instruction}`

    const start = Date.now()
    try {
      const output = await chatSingle(
        [{ role: 'user', content: prompt }],
        'claude',
        systemMessage,
        agent.model
      )
      const duration = Date.now() - start

      results.push({
        step: i + 1,
        agentId: agent.id,
        output: typeof output === 'string' ? output : JSON.stringify(output),
        model: agent.model,
        duration,
      })

      currentInput = typeof output === 'string' ? output : JSON.stringify(output)
    } catch (err: unknown) {
      log.error({ err: err instanceof Error ? err.message : String(err), step: i + 1, agentId: agent.id }, 'Pipeline step failed')
      return res.status(500).json({
        error: `Step ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
        completedSteps: results,
        failedAt: i + 1,
      })
    }
  }

  // Track analytics
  await db.analyticsEvent.create({
    data: {
      eventType: 'pipeline_run',
      userId,
      metadata: { pipelineId, steps: steps.length, totalDuration: results.reduce((s, r) => s + r.duration, 0) },
    },
  })

  res.json({
    result: currentInput,
    steps: results,
    totalDuration: results.reduce((s, r) => s + r.duration, 0),
  })
})

// Run pipeline with streaming (SSE)
router.post('/pipelines/:pipelineId/stream', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { pipelineId } = req.params
  const { input } = req.body

  if (!input) return res.status(400).json({ error: 'input requerido' })

  const config = await db.dayaSystemConfig.findUnique({ where: { key: pipelineId } })
  if (!config) return res.status(404).json({ error: 'Pipeline no encontrado' })

  const value = config.value as any
  if (value.createdBy !== userId) return res.status(403).json({ error: 'No autorizado' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const steps = value.steps as { agentId: string; instruction?: string }[]
  let currentInput = input

  const { chatStream } = await import('../../services/openrouter')

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const agent = await db.aiAgent.findFirst({ where: { id: step.agentId, userId } })

    if (!agent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Agent ${step.agentId} not found in step ${i + 1}` })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // Notify step start
    res.write(`data: ${JSON.stringify({ type: 'step_start', step: i + 1, total: steps.length, agentName: agent.name })}\n\n`)

    const systemMessage = agent.systemPrompt
    const instruction = step.instruction ? `\n\nAdditional instruction: ${step.instruction}` : ''
    const prompt = i === 0
      ? currentInput + instruction
      : `Previous agent output:\n\n${currentInput}\n\nYour task:${instruction}`

    const messages = [{ role: 'user' as const, content: prompt }]
    const stream = chatStream(messages, 'claude', systemMessage, agent.model)

    let stepOutput = ''
    for await (const chunk of stream) {
      stepOutput += chunk
      res.write(`data: ${JSON.stringify({ type: 'chunk', step: i + 1, content: chunk })}\n\n`)
    }

    currentInput = stepOutput
    res.write(`data: ${JSON.stringify({ type: 'step_end', step: i + 1, output: stepOutput })}\n\n`)
  }

  res.write(`data: ${JSON.stringify({ type: 'complete', result: currentInput })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
})

// ============================================
// SHARED PIPELINES (Community)
// ============================================

// Publish pipeline to community
router.post('/pipelines/:pipelineId/publish', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { pipelineId } = req.params
  const { name, description, priceCents, tags } = req.body

  const config = await db.dayaSystemConfig.findUnique({ where: { key: pipelineId } })
  if (!config) return res.status(404).json({ error: 'Pipeline no encontrado' })

  const value = config.value as any
  if (value.createdBy !== userId) return res.status(403).json({ error: 'No autorizado' })

  const slug = (name || value.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)

  const item = await db.marketplaceItem.create({
    data: {
      sellerId: userId,
      name: name || value.name,
      slug,
      description: description || value.description || 'Pipeline de agentes',
      longDesc: description || '',
      category: 'automation',
      type: 'FLOW',
      priceCents: priceCents || 0,
      icon: '🔗',
      tags: tags || ['pipeline', 'agents', 'automation'],
      config: { pipelineId, steps: value.steps },
      status: 'PUBLISHED',
    },
  })

  res.json({ item, slug })
})

// Install pipeline from marketplace
router.post('/pipelines/install/:itemId', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { itemId } = req.params

  const marketplaceItem = await db.marketplaceItem.findUnique({ where: { id: itemId } })
  if (!marketplaceItem || marketplaceItem.status !== 'PUBLISHED') {
    return res.status(404).json({ error: 'Item no encontrado' })
  }

  const config = (marketplaceItem.config as any) || {}
  
  // Clone pipeline for user
  const newConfig = await db.dayaSystemConfig.create({
    data: {
      key: `pipeline:${userId}:${Date.now().toString(36)}`,
      value: {
        name: marketplaceItem.name,
        description: marketplaceItem.description,
        steps: config.steps || [],
        createdBy: userId,
        installedFrom: marketplaceItem.id,
        createdAt: new Date().toISOString(),
      },
    },
  })

  // Track install
  await db.marketplaceItem.update({
    where: { id: itemId },
    data: { installCount: { increment: 1 } },
  })

  await db.analyticsEvent.create({
    data: {
      eventType: 'pipeline_install',
      userId,
      metadata: { itemId, pipelineId: newConfig.key },
    },
  })

  res.json({ pipeline: { id: newConfig.key, ...newConfig.value } })
})

export default router
