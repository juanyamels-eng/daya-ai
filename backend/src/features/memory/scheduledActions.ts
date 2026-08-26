// ============================================
// DAYA IA — Scheduled Actions
// Daya can execute actions on a schedule:
//   - Daily morning briefing
//   - Weekly report generation
//   - Periodic document sync
//   - Custom user-defined schedules
// ============================================
import { prisma } from '../../lib/prisma'
import { childLogger } from '../../services/logger'
import { fireWebhooks } from '../webhooks/service'

const db = prisma
const log = childLogger('scheduled')

export interface ScheduledAction {
  id: string
  userId: string
  name: string
  description: string
  cronExpression: string   // simplified: "daily:morning", "weekly:monday", "hourly", or cron
  action: {
    type: 'tool' | 'message' | 'webhook' | 'summary'
    tool?: string
    args?: Record<string, unknown>
    message?: string
    webhookUrl?: string
  }
  enabled: boolean
  lastRun?: number
  nextRun?: number
  createdAt: number
}

// ── Parse simplified cron ──

function parseSchedule(cron: string): number | null {
  const now = Date.now()

  if (cron === 'hourly') return now + 60 * 60 * 1000
  if (cron === 'daily:morning') {
    const next = new Date()
    next.setHours(9, 0, 0, 0)
    if (next.getTime() <= now) next.setDate(next.getDate() + 1)
    return next.getTime()
  }
  if (cron === 'daily:evening') {
    const next = new Date()
    next.setHours(18, 0, 0, 0)
    if (next.getTime() <= now) next.setDate(next.getDate() + 1)
    return next.getTime()
  }
  if (cron === 'weekly:monday') {
    const next = new Date()
    const daysUntilMonday = (1 - next.getDay() + 7) % 7 || 7
    next.setDate(next.getDate() + daysUntilMonday)
    next.setHours(9, 0, 0, 0)
    return next.getTime()
  }

  return null
}

// ── CRUD ──

export async function createScheduledAction(userId: string, action: Omit<ScheduledAction, 'id' | 'userId' | 'createdAt' | 'nextRun'>): Promise<ScheduledAction> {
  const full: ScheduledAction = {
    ...action,
    id: `sched_${Date.now().toString(36)}`,
    userId,
    createdAt: Date.now(),
    nextRun: parseSchedule(action.cronExpression) || undefined,
  }

  const row = await db.dayaSystemConfig.findUnique({ where: { key: `scheduled:${userId}` } }).catch(() => null)
  const actions: ScheduledAction[] = row ? JSON.parse(row.value) : []
  actions.push(full)

  await db.dayaSystemConfig.upsert({
    where: { key: `scheduled:${userId}` },
    update: { value: JSON.stringify(actions) },
    create: { key: `scheduled:${userId}`, value: JSON.stringify(actions) },
  })

  log.info({ userId, actionId: full.id, name: full.name }, 'Scheduled action created')
  return full
}

export async function listScheduledActions(userId: string): Promise<ScheduledAction[]> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `scheduled:${userId}` } }).catch(() => null)
  return row ? JSON.parse(row.value) : []
}

export async function removeScheduledAction(userId: string, actionId: string): Promise<void> {
  const actions = await listScheduledActions(userId)
  const filtered = actions.filter(a => a.id !== actionId)
  await db.dayaSystemConfig.upsert({
    where: { key: `scheduled:${userId}` },
    update: { value: JSON.stringify(filtered) },
    create: { key: `scheduled:${userId}`, value: JSON.stringify(filtered) },
  })
}

// ── Execute due actions (called by cron) ──

export async function executeDueActions(): Promise<void> {
  // Get all users with scheduled actions
  const rows = await db.dayaSystemConfig.findMany({
    where: { key: { startsWith: 'scheduled:' } },
  }).catch(() => [])

  const now = Date.now()

  for (const row of rows) {
    const userId = row.key.replace('scheduled:', '')
    const actions: ScheduledAction[] = JSON.parse(row.value)

    for (const action of actions) {
      if (!action.enabled || !action.nextRun || action.nextRun > now) continue

      log.info({ userId, actionId: action.id, name: action.name }, 'Executing scheduled action')

      try {
        if (action.action.type === 'webhook' && action.action.webhookUrl) {
          await fetch(action.action.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action.name, userId, timestamp: now }),
            signal: AbortSignal.timeout(10_000),
          })
        }

        if (action.action.type === 'summary') {
          await fireWebhooks(userId, 'task.completed', { summary: true, actionName: action.name })
        }
      } catch (e) {
        log.error({ userId, actionId: action.id, error: e instanceof Error ? e.message : String(e) }, 'Scheduled action failed')
      }

      // Update last run and next run
      action.lastRun = now
      action.nextRun = parseSchedule(action.cronExpression) || undefined
    }

    await db.dayaSystemConfig.upsert({
      where: { key: row.key },
      update: { value: JSON.stringify(actions) },
      create: { key: row.key, value: JSON.stringify(actions) },
    }).catch(() => {})
  }
}
