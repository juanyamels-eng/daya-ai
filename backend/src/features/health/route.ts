// ============================================
// DAYA IA — Health Check Route
// GET /api/health — comprehensive health status
// GET /api/health/deep — DB, MCP, sandbox, browser status
// ============================================
import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { getToolCacheStats } from '../../services/toolCache'
import { listMcpServers } from '../mcp/registry'
import { getSandboxProvider } from '../sandbox/registry'

const router = Router()

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'DAYA AI',
    version: process.env.npm_package_version || '2.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
  })
})

router.get('/deep', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; latencyMs?: number; details?: any }> = {}

  // DB check
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart }
  } catch (e: unknown) {
    checks.database = { status: 'error', details: e instanceof Error ? e.message : String(e) }
  }

  // MCP servers
  try {
    const servers = listMcpServers()
    checks.mcp = { status: 'ok', details: { servers: servers.length, names: servers.map(s => s.name) } }
  } catch (e: unknown) {
    checks.mcp = { status: 'error', details: e instanceof Error ? e.message : String(e) }
  }

  // Sandbox
  try {
    const sandbox = getSandboxProvider()
    checks.sandbox = { status: 'ok', details: { type: sandbox.constructor.name } }
  } catch (e: unknown) {
    checks.sandbox = { status: 'error', details: e instanceof Error ? e.message : String(e) }
  }

  // Tool cache
  try {
    const stats = getToolCacheStats()
    checks.cache = { status: 'ok', details: stats }
  } catch (e: unknown) {
    checks.cache = { status: 'error', details: e instanceof Error ? e.message : String(e) }
  }

  // Memory
  const mem = process.memoryUsage()
  checks.memory = {
    status: mem.heapUsed < 500 * 1024 * 1024 ? 'ok' : 'warning',
    details: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
    },
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok')

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
  })
})

export default router
