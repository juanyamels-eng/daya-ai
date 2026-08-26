// ============================================
// DAYA IA — Webhooks Routes
// POST /api/webhooks — register webhook
// GET  /api/webhooks — list webhooks
// DELETE /api/webhooks/:id — remove webhook
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { registerWebhook, listWebhooks, removeWebhook, WebhookEvent } from './service'
import { webhookLimiter } from '../../middleware/rateLimiter'

const router = Router()
router.use(requireAuth)
router.use(webhookLimiter)

const VALID_EVENTS: WebhookEvent[] = [
  'document.indexed', 'document.removed', 'task.completed',
  'orchestrator.done', 'graphrag.synced', 'browser.screenshot',
]

router.get('/', async (req: Request, res: Response) => {
  const userId = req.userId
  const webhooks = await listWebhooks(userId)
  res.json({ webhooks: webhooks.map(w => ({ ...w, secret: undefined })) })
})

router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId
  const { url, events } = req.body || {}
  if (!url || !Array.isArray(events)) {
    return res.status(400).json({ error: 'url and events[] are required' })
  }
  const invalid = events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEvent))
  if (invalid.length) {
    return res.status(400).json({ error: `Invalid events: ${invalid.join(', ')}. Valid: ${VALID_EVENTS.join(', ')}` })
  }
  const webhook = await registerWebhook(userId, url, events)
  res.json({ webhook })
})

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId
  await removeWebhook(userId, req.params.id)
  res.json({ success: true })
})

export default router
