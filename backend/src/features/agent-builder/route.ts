import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'

const db = prisma as any
const router = Router()

// ============================================
// AI AGENT BUILDER
// No-code builder for custom AI agents
// ============================================

// Create agent
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { name, description, systemPrompt, model, tools, knowledge, settings } = req.body

  if (!name || !systemPrompt) {
    return res.status(400).json({ error: 'name y systemPrompt requeridos' })
  }

  const agent = await db.aiAgent.create({
    data: {
      userId,
      name,
      description: description || '',
      systemPrompt,
      model: model || 'claude-3-5-sonnet',
      tools: tools || [],
      knowledge: knowledge || [],
      settings: settings || {},
    },
  })

  res.json({ agent })
})

// List my agents
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId

  const agents = await db.aiAgent.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })

  res.json({ agents })
})

// Get agent details
router.get('/:agentId', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { agentId } = req.params

  const agent = await db.aiAgent.findFirst({
    where: { id: agentId, userId },
  })

  if (!agent) {
    return res.status(404).json({ error: 'Agent no encontrado' })
  }

  res.json({ agent })
})

// Update agent
router.put('/:agentId', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { agentId } = req.params
  const { name, description, systemPrompt, model, tools, knowledge, settings } = req.body

  const agent = await db.aiAgent.findFirst({
    where: { id: agentId, userId },
  })

  if (!agent) {
    return res.status(404).json({ error: 'Agent no encontrado' })
  }

  const updated = await db.aiAgent.update({
    where: { id: agentId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(model !== undefined && { model }),
      ...(tools !== undefined && { tools }),
      ...(knowledge !== undefined && { knowledge }),
      ...(settings !== undefined && { settings }),
    },
  })

  res.json({ agent: updated })
})

// Delete agent
router.delete('/:agentId', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { agentId } = req.params

  const agent = await db.aiAgent.findFirst({
    where: { id: agentId, userId },
  })

  if (!agent) {
    return res.status(404).json({ error: 'Agent no encontrado' })
  }

  await db.aiAgent.delete({ where: { id: agentId } })
  res.json({ ok: true })
})

// Run agent
router.post('/:agentId/run', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { agentId } = req.params
  const { message } = req.body

  const agent = await db.aiAgent.findFirst({
    where: { id: agentId, userId },
  })

  if (!agent) {
    return res.status(404).json({ error: 'Agent no encontrado' })
  }

  // Build prompt with agent configuration
  const systemMessage = agent.systemPrompt
  const knowledgeContext = (agent.knowledge as string[] || []).join('\n')
  
  // Call LLM
  const { chatSingle } = await import('../../services/openrouter')
  
  const messages = [
    ...(knowledgeContext ? [{ role: 'user' as const, content: `Knowledge:\n${knowledgeContext}` }] : []),
    { role: 'user' as const, content: message },
  ]
  
  const response = await chatSingle(messages, 'claude', systemMessage, agent.model)

  // Log usage
  await db.analyticsEvent.create({
    data: {
      eventType: 'agent_run',
      userId,
      metadata: {
        agentId,
        model: agent.model,
      },
    },
  })

  res.json({
    response,
    model: agent.model,
  })
})

// Test agent (streaming)
router.post('/:agentId/test', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { agentId } = req.params
  const { message } = req.body

  const agent = await db.aiAgent.findFirst({
    where: { id: agentId, userId },
  })

  if (!agent) {
    return res.status(404).json({ error: 'Agent no encontrado' })
  }

  // SSE streaming
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const { chatStream } = await import('../../services/openrouter')
  
  const messages = [{ role: 'user' as const, content: message }]
  const stream = chatStream(messages, 'claude', agent.systemPrompt, agent.model)

  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
  }

  res.write('data: [DONE]\n\n')
  res.end()
})

// Get available tools for agents
router.get('/meta/tools', requireAuth, async (_req: Request, res: Response) => {
  const tools = [
    { id: 'web-search', name: 'Web Search', description: 'Buscar en internet', category: 'search' },
    { id: 'read-url', name: 'Read URL', description: 'Leer contenido de una web', category: 'search' },
    { id: 'calculator', name: 'Calculator', description: 'Realizar cálculos matemáticos', category: 'utility' },
    { id: 'code-executor', name: 'Code Executor', description: 'Ejecutar código Python/JS', category: 'code' },
    { id: 'email-sender', name: 'Email Sender', description: 'Enviar emails', category: 'communication' },
    { id: 'slack-post', name: 'Slack Post', description: 'Publicar en Slack', category: 'communication' },
    { id: 'notion-create', name: 'Notion Create', description: 'Crear páginas en Notion', category: 'productivity' },
    { id: 'calendar-event', name: 'Calendar Event', description: 'Crear eventos en calendario', category: 'productivity' },
    { id: 'github-issue', name: 'GitHub Issue', description: 'Crear issues en GitHub', category: 'development' },
    { id: 'database-query', name: 'Database Query', description: 'Consultar base de datos', category: 'data' },
    { id: 'image-gen', name: 'Image Generation', description: 'Generar imágenes con IA', category: 'creative' },
    { id: 'transcription', name: 'Transcription', description: 'Transcribir audio', category: 'media' },
  ]

  res.json({ tools })
})

// Get agent templates
router.get('/meta/templates', requireAuth, async (_req: Request, res: Response) => {
  const templates = [
    {
      id: 'customer-support',
      name: 'Customer Support Agent',
      description: 'Agente de soporte al cliente con acceso a base de conocimiento',
      systemPrompt: 'Eres un agente de soporte al cliente. Resuelve dudas de forma amable y profesional. Usa la base de conocimiento para dar respuestas precisas.',
      tools: ['web-search', 'database-query'],
      model: 'claude-3-5-sonnet',
    },
    {
      id: 'code-assistant',
      name: 'Code Assistant',
      description: 'Asistente de programación con ejecución de código',
      systemPrompt: 'Eres un experto programador. Ayuda a escribir, depurar y explicar código. Siempre incluye ejemplos y mejores prácticas.',
      tools: ['code-executor', 'github-issue'],
      model: 'claude-3-5-sonnet',
    },
    {
      id: 'research-assistant',
      name: 'Research Assistant',
      description: 'Asistente de investigación con acceso a web',
      systemPrompt: 'Eres un investigador experto. Busca información en internet, analiza fuentes y genera reportes detallados con citaciones.',
      tools: ['web-search', 'read-url'],
      model: 'claude-3-5-sonnet',
    },
    {
      id: 'sales-agent',
      name: 'Sales Agent',
      description: 'Agente de ventas con seguimiento de leads',
      systemPrompt: 'Eres un experto en ventas. Califica leads, programa demos y sigue el pipeline de ventas. Sé consultivo, no agresivo.',
      tools: ['email-sender', 'calendar-event', 'slack-post'],
      model: 'claude-3-5-sonnet',
    },
  ]

  res.json({ templates })
})

// Publish agent to marketplace
router.post('/:agentId/publish', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { agentId } = req.params
  const { priceCents, category, tags, longDesc } = req.body

  const agent = await db.aiAgent.findFirst({ where: { id: agentId, userId } })
  if (!agent) return res.status(404).json({ error: 'Agent no encontrado' })

  // Create marketplace item from agent
  const slug = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
  
  const item = await db.marketplaceItem.create({
    data: {
      sellerId: userId,
      name: agent.name,
      slug,
      description: agent.description || `Agent: ${agent.name}`,
      longDesc: longDesc || agent.description || '',
      category: category || 'ai',
      type: 'AGENT',
      priceCents: priceCents || 0,
      icon: '🤖',
      tags: tags || ['agent', agent.model],
      config: {
        agentId: agent.id,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        tools: agent.tools,
        knowledge: agent.knowledge,
        settings: agent.settings,
      },
      status: 'PUBLISHED',
    },
  })

  // Mark agent as published
  await db.aiAgent.update({ where: { id: agentId }, data: { isPublished: true } })

  res.json({ item, slug })
})

// Install agent from marketplace (clones to user's agents)
router.post('/install/:itemId', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { itemId } = req.params

  const marketplaceItem = await db.marketplaceItem.findUnique({ where: { id: itemId } })
  if (!marketplaceItem || marketplaceItem.status !== 'PUBLISHED') {
    return res.status(404).json({ error: 'Item no encontrado' })
  }

  // Check if already installed
  const existing = await db.aiAgent.findFirst({
    where: { userId, name: marketplaceItem.name },
  })
  if (existing) return res.status(409).json({ error: 'Ya tienes este agente instalado', agentId: existing.id })

  const config = (marketplaceItem.config as any) || {}

  // Clone agent for user
  const agent = await db.aiAgent.create({
    data: {
      userId,
      name: marketplaceItem.name,
      description: marketplaceItem.description,
      systemPrompt: config.systemPrompt || '',
      model: config.model || 'claude-3-5-sonnet',
      tools: config.tools || [],
      knowledge: config.knowledge || [],
      settings: config.settings || {},
      isPublished: false,
    },
  })

  // Record purchase (free) and increment installs
  await db.marketplacePurchase.create({
    data: {
      itemId,
      userId,
      amountCents: marketplaceItem.priceCents,
      currency: marketplaceItem.currency,
      status: 'COMPLETED',
    },
  })

  await db.marketplaceItem.update({
    where: { id: itemId },
    data: { installCount: { increment: 1 } },
  })

  // Track analytics
  await db.analyticsEvent.create({
    data: {
      eventType: 'agent_install',
      userId,
      metadata: { itemId, agentId: agent.id, sellerId: marketplaceItem.sellerId },
    },
  })

  res.json({ agent, message: 'Agente instalado correctamente' })
})

// Get agents installed from marketplace
router.get('/installed', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId

  const purchases = await db.marketplacePurchase.findMany({
    where: { userId, item: { type: 'AGENT', status: 'PUBLISHED' } },
    include: { item: { select: { id: true, name: true, slug: true, description: true, icon: true, rating: true, installCount: true, sellerId: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const agents = purchases.map((p: any) => ({
    ...p.item,
    purchaseDate: p.createdAt,
    installCount: p.item.installCount,
  }))

  res.json({ agents })
})

// Seller analytics
router.get('/seller/analytics', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId

  const items = await db.marketplaceItem.findMany({
    where: { sellerId: userId },
    select: { id: true, name: true, installCount: true, rating: true, ratingCount: true, priceCents: true, createdAt: true },
  })

  const totalInstalls = items.reduce((sum: number, i: any) => sum + i.installCount, 0)
  const totalRevenue = items.reduce((sum: number, i: any) => sum + (i.installCount * i.priceCents), 0)
  const avgRating = items.length > 0 ? items.reduce((sum: number, i: any) => sum + i.rating, 0) / items.length : 0

  // Recent purchases of my items
  const recentPurchases = await db.marketplacePurchase.findMany({
    where: { item: { sellerId: userId } },
    include: { item: { select: { name: true } }, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  // Recent reviews
  const recentReviews = await db.marketplaceReview.findMany({
    where: { item: { sellerId: userId } },
    include: { item: { select: { name: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  res.json({
    stats: { totalItems: items.length, totalInstalls, totalRevenue, avgRating },
    items,
    recentPurchases,
    recentReviews,
  })
})

// Trending agents (public)
router.get('/trending', async (req: Request, res: Response) => {
  const { limit = '10' } = req.query
  const take = Math.min(50, parseInt(limit as string))

  // Trending = most installs in last 30 days, weighted by rating

  const items = await db.marketplaceItem.findMany({
    where: { status: 'PUBLISHED', type: 'AGENT' },
    orderBy: [
      { installCount: 'desc' },
      { rating: 'desc' },
    ],
    take,
    select: {
      id: true, name: true, slug: true, description: true, icon: true,
      rating: true, ratingCount: true, installCount: true, priceCents: true,
      tags: true, version: true, createdAt: true,
      seller: { select: { id: true, name: true } },
    },
  })

  res.json({ items })
})

export default router
