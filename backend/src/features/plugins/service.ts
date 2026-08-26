// ============================================
// DAYA IA — Plugin System
// Allows users to define custom tools via JSON configuration.
// Plugins are stored per-user and executed as sandbox code.
// ============================================
import { prisma } from '../../lib/prisma'
import { childLogger } from '../../services/logger'

const db = prisma
const log = childLogger('plugins')

export interface PluginTool {
  id: string
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
  code: string           // JavaScript code that receives (args) and returns string
  userId: string
  createdAt: number
  lastUsed?: number
  useCount: number
}

// ── CRUD ──

export async function createPlugin(userId: string, plugin: Omit<PluginTool, 'id' | 'userId' | 'createdAt' | 'useCount'>): Promise<PluginTool> {
  const full: PluginTool = {
    ...plugin,
    id: `plugin_${Date.now().toString(36)}`,
    userId,
    createdAt: Date.now(),
    useCount: 0,
  }

  const row = await db.dayaSystemConfig.findUnique({ where: { key: `plugins:${userId}` } }).catch(() => null)
  const plugins: PluginTool[] = row ? JSON.parse(row.value) : []
  plugins.push(full)

  await db.dayaSystemConfig.upsert({
    where: { key: `plugins:${userId}` },
    update: { value: JSON.stringify(plugins) },
    create: { key: `plugins:${userId}`, value: JSON.stringify(plugins) },
  })

  log.info({ pluginId: full.id, name: full.name, userId }, 'Plugin created')
  return full
}

export async function listPlugins(userId: string): Promise<PluginTool[]> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `plugins:${userId}` } }).catch(() => null)
  return row ? JSON.parse(row.value) : []
}

export async function removePlugin(userId: string, pluginId: string): Promise<boolean> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `plugins:${userId}` } }).catch(() => null)
  if (!row) return false
  const plugins: PluginTool[] = JSON.parse(row.value)
  const filtered = plugins.filter(p => p.id !== pluginId)
  await db.dayaSystemConfig.upsert({
    where: { key: `plugins:${userId}` },
    update: { value: JSON.stringify(filtered) },
    create: { key: `plugins:${userId}`, value: JSON.stringify(filtered) },
  })
  return true
}

// ── Execute plugin ──

export async function executePlugin(userId: string, pluginId: string, args: Record<string, unknown>): Promise<string> {
  const plugins = await listPlugins(userId)
  const plugin = plugins.find(p => p.id === pluginId)
  if (!plugin) return 'ERROR: Plugin not found'

  // Sandboxed execution via Function constructor (no access to Node APIs)
  try {
    const fn = new Function('args', plugin.code)
    const result = fn(args)

    // Update usage stats
    plugin.useCount++
    plugin.lastUsed = Date.now()
    const row = await db.dayaSystemConfig.findUnique({ where: { key: `plugins:${userId}` } }).catch(() => null)
    if (row) {
      const all: PluginTool[] = JSON.parse(row.value)
      const idx = all.findIndex(p => p.id === pluginId)
      if (idx >= 0) all[idx] = plugin
      await db.dayaSystemConfig.upsert({
        where: { key: `plugins:${userId}` },
        update: { value: JSON.stringify(all) },
        create: { key: `plugins:${userId}`, value: JSON.stringify(all) },
      })
    }

    return typeof result === 'string' ? result : JSON.stringify(result)
  } catch (e) {
    return `ERROR: Plugin execution failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

// ── Convert plugin to DayaTool ──

export function pluginToTool(plugin: PluginTool) {
  return {
    name: `plugin__${plugin.id}`,
    description: `[Plugin] ${plugin.description}`,
    parameters: plugin.parameters,
    safeForAct: false,
    run: async (_userId: string, args: any) => executePlugin(plugin.userId, plugin.id, args),
  }
}
