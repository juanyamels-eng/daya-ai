// ============================================
// DAYA IA — Tool Usage Analytics
// Tracks tool execution: success rates, latencies, costs.
// Data stored in memory (rolling window) + optional DB persistence.
// ============================================
import { prisma } from '../lib/prisma'
import { childLogger } from '../services/logger'

const db = prisma
const log = childLogger('analytics')

interface ToolUsageEntry {
  tool: string
  userId: string
  success: boolean
  durationMs: number
  timestamp: number
  mcpServer?: string
  error?: string
}

interface ToolAggregate {
  tool: string
  totalCalls: number
  successCount: number
  failCount: number
  successRate: number
  avgDurationMs: number
  p95DurationMs: number
  lastUsed: number
  uniqueUsers: number
}

// Rolling window in memory (last 1000 entries per tool)
const MAX_ENTRIES = 1000
const entries = new Map<string, ToolUsageEntry[]>()

export function recordToolUsage(entry: ToolUsageEntry): void {
  const key = entry.tool
  if (!entries.has(key)) entries.set(key, [])
  const arr = entries.get(key)!
  arr.push(entry)
  if (arr.length > MAX_ENTRIES) arr.shift()
}

export function getToolAnalytics(tool?: string): ToolAggregate[] {
  const tools = tool ? [tool] : Array.from(entries.keys())
  return tools.map(t => {
    const arr = entries.get(t) || []
    const durations = arr.map(e => e.durationMs).sort((a, b) => a - b)
    const uniqueUsers = new Set(arr.map(e => e.userId)).size

    return {
      tool: t,
      totalCalls: arr.length,
      successCount: arr.filter(e => e.success).length,
      failCount: arr.filter(e => !e.success).length,
      successRate: arr.length ? arr.filter(e => e.success).length / arr.length : 0,
      avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      p95DurationMs: durations.length ? durations[Math.floor(durations.length * 0.95)] : 0,
      lastUsed: arr.length ? arr[arr.length - 1].timestamp : 0,
      uniqueUsers,
    }
  }).sort((a, b) => b.totalCalls - a.totalCalls)
}

// Persist analytics to DB every 5 minutes
let persistTimer: ReturnType<typeof setInterval> | null = null

export function startAnalyticsPersistence(): void {
  persistTimer = setInterval(async () => {
    try {
      const aggregates = getToolAnalytics()
      for (const agg of aggregates) {
        await db.dayaSystemConfig.upsert({
          where: { key: `analytics:${agg.tool}` },
          update: { value: JSON.stringify(agg) },
          create: { key: `analytics:${agg.tool}`, value: JSON.stringify(agg) },
        })
      }
    } catch { /* persistence failure is ok */ }
  }, 5 * 60 * 1000)

  if (persistTimer && typeof persistTimer === 'object' && 'unref' in persistTimer) {
    (persistTimer as { unref: () => void }).unref()
  }
}

export function stopAnalyticsPersistence(): void {
  if (persistTimer) clearInterval(persistTimer)
}

// Load persisted analytics on startup
export async function loadPersistedAnalytics(): Promise<void> {
  try {
    const rows = await db.dayaSystemConfig.findMany({
      where: { key: { startsWith: 'analytics:' } },
    })
    for (const row of rows) {
      const agg: ToolAggregate = JSON.parse(row.value)
      log.debug({ tool: agg.tool, totalCalls: agg.totalCalls }, 'Loaded persisted analytics')
    }
  } catch { /* ok */ }
}
