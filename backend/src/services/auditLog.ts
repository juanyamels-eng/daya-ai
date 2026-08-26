// ============================================
// DAYA IA — Audit Log
// Records all sensitive actions with who/what/when.
// Stored in DayaSystemConfig (no new tables needed).
// ============================================
import { prisma } from '../lib/prisma'
import { childLogger } from './logger'

const db = prisma
const log = childLogger('audit')

export type AuditAction =
  | 'auth.login'
  | 'auth.register'
  | 'auth.logout'
  | 'auth.password_change'
  | 'auth.password_reset'
  | 'api_key.create'
  | 'api_key.revoke'
  | 'document.upload'
  | 'document.delete'
  | 'webhook.create'
  | 'webhook.delete'
  | 'mcp_server.add'
  | 'mcp_server.remove'
  | 'orchestrator.run'
  | 'agent.run'
  | 'settings.change'
  | 'admin.action'

interface AuditEntry {
  timestamp: number
  userId: string
  action: AuditAction
  ip?: string
  details?: Record<string, unknown>
  success: boolean
}

export async function auditLog(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
  const full: AuditEntry = { ...entry, timestamp: Date.now() }
  const key = `audit:${entry.userId}:${full.timestamp}`

  // Store in DB (best-effort, non-blocking)
  db.dayaSystemConfig.upsert({
    where: { key },
    update: { value: JSON.stringify(full) },
    create: { key, value: JSON.stringify(full) },
  }).catch(() => {})

  // Also log to structured logger
  const level = entry.success ? 'info' : 'warn'
  log[level]({ userId: entry.userId, action: entry.action, ip: entry.ip, success: entry.success }, `AUDIT: ${entry.action}`)
}

export async function getAuditLog(userId: string, limit = 50): Promise<AuditEntry[]> {
  try {
    const rows = await db.dayaSystemConfig.findMany({
      where: { key: { startsWith: `audit:${userId}:` } },
      orderBy: { key: 'desc' },
      take: limit,
    })
    return rows.map((r) => JSON.parse(r.value))
  } catch {
    return []
  }
}
