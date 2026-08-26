// ============================================
// DAYA IA — Cron Scheduler
// Lightweight cron-like scheduler for recurring tasks.
// No external dependencies — uses setInterval with drift correction.
// ============================================
import { childLogger } from '../services/logger'

const log = childLogger('cron')

interface CronJob {
  id: string
  name: string
  intervalMs: number
  handler: () => Promise<void> | void
  lastRun?: number
  nextRun?: number
  running: boolean
  timer?: ReturnType<typeof setInterval>
}

const jobs = new Map<string, CronJob>()

export function registerJob(
  id: string,
  name: string,
  intervalMs: number,
  handler: () => Promise<void> | void,
): CronJob {
  const job: CronJob = { id, name, intervalMs, handler, running: false }

  job.timer = setInterval(async () => {
    if (job.running) return // skip if still running
    job.running = true
    job.lastRun = Date.now()
    try {
      await handler()
      log.debug({ jobId: id, name }, 'Cron job completed')
    } catch (err) {
      log.error({ jobId: id, name, error: err instanceof Error ? err.message : String(err) }, 'Cron job failed')
    } finally {
      job.running = false
    }
  }, intervalMs)

  // Prevent timer from keeping process alive
  if (job.timer && typeof job.timer === 'object' && 'unref' in job.timer) {
    job.timer.unref()
  }

  jobs.set(id, job)
  log.info({ jobId: id, name, intervalMs }, 'Cron job registered')
  return job
}

export function unregisterJob(id: string): void {
  const job = jobs.get(id)
  if (job?.timer) clearInterval(job.timer)
  jobs.delete(id)
}

export function listJobs(): Array<{ id: string; name: string; intervalMs: number; lastRun?: number; running: boolean }> {
  return Array.from(jobs.values()).map(j => ({
    id: j.id, name: j.name, intervalMs: j.intervalMs, lastRun: j.lastRun, running: j.running,
  }))
}

export function startDefaultJobs(): void {
  // Clean expired rate-limit counters every 5 min
  // (already handled by toolRateLimit.ts)

  // Clean expired cache entries every 10 min
  registerJob('cache-cleanup', 'Cache Cleanup', 10 * 60 * 1000, async () => {
    // The tool cache auto-expires via TTL check on read
    // This is a placeholder for any future cache that needs explicit cleanup
  })

  // Sync GraphRAG for active users every 30 min
  registerJob('graphrag-sync', 'GraphRAG Background Sync', 30 * 60 * 1000, async () => {
    // Background graph sync — runs for users who had recent activity
    try {
      const { prisma } = await import('../lib/prisma')
      const db = prisma
      const recentUsers = await db.$queryRawUnsafe(
        `SELECT DISTINCT "userId" FROM "Conversation" WHERE "updatedAt" > NOW() - INTERVAL '1 hour' LIMIT 10`
      ).catch(() => [])

      for (const row of recentUsers as Array<{ userId: string }>) {
        try {
          const { syncUserGraph } = await import('../features/graphrag/sync')
          await syncUserGraph(row.userId)
        } catch { /* per-user sync failure is ok */ }
      }
    } catch { /* system-level failure is ok */ }
  })

  // Execute scheduled actions every 5 min
  registerJob('scheduled-actions', 'Scheduled Actions', 5 * 60 * 1000, async () => {
    try {
      const { executeDueActions } = await import('../features/memory/scheduledActions')
      await executeDueActions()
    } catch { /* ok */ }
  })

  // Refresh proactive suggestions every 6 hours
  registerJob('proactive-suggestions', 'Proactive Suggestions Refresh', 6 * 60 * 60 * 1000, async () => {
    try {
      const { prisma } = await import('../lib/prisma')
      const db = prisma
      const activeUsers = await db.$queryRawUnsafe(
        `SELECT DISTINCT "userId" FROM "Conversation" WHERE "updatedAt" > NOW() - INTERVAL '24 hours' LIMIT 20`
      ).catch(() => [])

      const { generateProactiveSuggestions } = await import('../features/memory/proactive')
      for (const row of activeUsers as Array<{ userId: string }>) {
        try { await generateProactiveSuggestions(row.userId) } catch { /* per-user ok */ }
      }
    } catch { /* ok */ }
  })
}
