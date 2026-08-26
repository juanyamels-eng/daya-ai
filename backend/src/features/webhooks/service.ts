// ============================================
// DAYA IA — Webhooks System
// Register webhook URLs and get notified on events.
// Supports: document.indexed, task.completed, orchestrator.done, etc.
// ============================================
import { prisma } from '../../lib/prisma'
import crypto from 'crypto'
import { childLogger } from '../../services/logger'

const db = prisma
const log = childLogger('webhooks')

export type WebhookEvent =
  | 'document.indexed'
  | 'document.removed'
  | 'task.completed'
  | 'orchestrator.done'
  | 'graphrag.synced'
  | 'browser.screenshot'

export interface WebhookConfig {
  id: string
  userId: string
  url: string
  events: WebhookEvent[]
  secret: string
  active: boolean
  createdAt: number
}

// ── CRUD ──

export async function registerWebhook(userId: string, url: string, events: WebhookEvent[]): Promise<WebhookConfig> {
  const id = `wh_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
  const secret = crypto.randomBytes(32).toString('hex')
  const config: WebhookConfig = { id, userId, url, events, secret, active: true, createdAt: Date.now() }

  await db.dayaSystemConfig.upsert({
    where: { key: `webhook:${id}` },
    update: { value: JSON.stringify(config) },
    create: { key: `webhook:${id}`, value: JSON.stringify(config) },
  })

  // Add to user's webhook index
  const indexKey = `webhooks:${userId}`
  const row = await db.dayaSystemConfig.findUnique({ where: { key: indexKey } })
  const ids: string[] = row?.value ? JSON.parse(row.value) : []
  if (!ids.includes(id)) {
    ids.push(id)
    await db.dayaSystemConfig.upsert({
      where: { key: indexKey },
      update: { value: JSON.stringify(ids) },
      create: { key: indexKey, value: JSON.stringify(ids) },
    })
  }

  log.info({ webhookId: id, userId, url, events }, 'Webhook registered')
  return config
}

export async function listWebhooks(userId: string): Promise<WebhookConfig[]> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `webhooks:${userId}` } })
  const ids: string[] = row?.value ? JSON.parse(row.value) : []
  const webhooks: WebhookConfig[] = []
  for (const id of ids) {
    const wh = await db.dayaSystemConfig.findUnique({ where: { key: `webhook:${id}` } })
    if (wh) webhooks.push(JSON.parse(wh.value))
  }
  return webhooks
}

export async function removeWebhook(userId: string, webhookId: string): Promise<boolean> {
  await db.dayaSystemConfig.delete({ where: { key: `webhook:${webhookId}` } }).catch(() => {})
  const indexKey = `webhooks:${userId}`
  const row = await db.dayaSystemConfig.findUnique({ where: { key: indexKey } })
  if (row) {
    const ids: string[] = JSON.parse(row.value)
    await db.dayaSystemConfig.upsert({
      where: { key: indexKey },
      update: { value: JSON.stringify(ids.filter(id => id !== webhookId)) },
      create: { key: indexKey, value: JSON.stringify([]) },
    })
  }
  log.info({ webhookId, userId }, 'Webhook removed')
  return true
}

// ── Fire webhooks ──

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function fireWebhooks(userId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  const webhooks = await listWebhooks(userId)
  const matching = webhooks.filter(w => w.active && w.events.includes(event))
  if (!matching.length) return

  const payload = JSON.stringify({ event, data, timestamp: Date.now() })

  for (const webhook of matching) {
    const signature = signPayload(payload, webhook.secret)
    fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DAYA-Event': event,
        'X-DAYA-Signature': signature,
        'X-DAYA-Webhook-Id': webhook.id,
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    }).then(res => {
      log.info({ webhookId: webhook.id, event, status: res.status }, 'Webhook fired')
    }).catch(err => {
      log.warn({ webhookId: webhook.id, event, error: err.message }, 'Webhook delivery failed')
    })
  }
}
