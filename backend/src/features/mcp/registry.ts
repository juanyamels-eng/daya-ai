// ============================================
// DAYA IA — MCP Registry: bridges external MCP tools into the DayaTool system
// Auto-discovers tools from configured MCP servers and exposes them as
// schemas for the LLM + execution functions for the orchestrator.
// ============================================
import { McpServer, McpServerConfig, connectMcpServer, callMcpTool, disconnectMcpServer } from './client'
import { prisma } from '../../lib/prisma'
import { logger } from '../../services/logger'

const servers = new Map<string, McpServer>()

// ── Config persistence via DayaSystemConfig ──
const MCP_CONFIG_KEY = 'mcp_servers'

async function loadMcpConfig(): Promise<Record<string, McpServerConfig>> {
  try {
    const row = await prisma.dayaSystemConfig.findUnique({ where: { key: MCP_CONFIG_KEY } })
    return row ? JSON.parse(row.value) : {}
  } catch { return {} }
}

async function saveMcpConfig(config: Record<string, McpServerConfig>): Promise<void> {
  try {
    await prisma.dayaSystemConfig.upsert({
      where: { key: MCP_CONFIG_KEY },
      update: { value: JSON.stringify(config) },
      create: { key: MCP_CONFIG_KEY, value: JSON.stringify(config) },
    })
  } catch { /* best effort */ }
}

// ── Connect all configured servers on startup ──
export async function initMcpServers(): Promise<void> {
  const config = await loadMcpConfig()
  for (const [name, cfg] of Object.entries(config)) {
    try {
      const server = await connectMcpServer(name, cfg)
      servers.set(name, server)
      logger.info(`[MCP] ${name}: ${server.tools.length} tool(s) connected`)
    } catch (e) {
      console.warn(`[MCP] ${name} failed to connect:`, e instanceof Error ? e.message : String(e))
    }
  }
}

// ── Add/remove servers at runtime ──
export async function addMcpServer(name: string, config: McpServerConfig): Promise<{ ok: boolean; tools: string[]; error?: string }> {
  // Disconnect existing if any
  const existing = servers.get(name)
  if (existing) disconnectMcpServer(existing)

  try {
    const server = await connectMcpServer(name, config)
    servers.set(name, server)

    // Persist
    const fullConfig = await loadMcpConfig()
    fullConfig[name] = config
    await saveMcpConfig(fullConfig)

    return { ok: true, tools: server.tools.map(t => t.name) }
  } catch (e) {
    return { ok: false, tools: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function removeMcpServer(name: string): Promise<boolean> {
  const server = servers.get(name)
  if (!server) return false
  disconnectMcpServer(server)
  servers.delete(name)

  const config = await loadMcpConfig()
  delete config[name]
  await saveMcpConfig(config)
  return true
}

// ── Tool schemas for the LLM (OpenAI function-calling format) ──
export interface McpToolSchema {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export function getMcpToolSchemas(): McpToolSchema[] {
  const schemas: McpToolSchema[] = []
  for (const [serverName, server] of servers) {
    if (!server.connected) continue
    for (const tool of server.tools) {
      schemas.push({
        type: 'function',
        function: {
          name: `mcp__${serverName}__${tool.name}`.slice(0, 90),
          description: (tool.description || `MCP tool from ${serverName}`).slice(0, 600),
          parameters: tool.inputSchema,
        },
      })
    }
  }
  return schemas
}

// ── Execute an MCP tool by its full name (mcp__<server>__<tool>) ──
export async function runMcpTool(fullName: string, args: Record<string, unknown>): Promise<string> {
  // Parse: mcp__<serverName>__<toolName> (server name may contain underscores)
  const match = /^mcp__([^_]+(?:[_.-][^_]+)*?)__(.+)$/.exec(fullName)
  if (!match) return `ERROR: invalid MCP tool name: ${fullName}`

  const [, serverNameRaw, toolName] = match

  // Find server by trying prefix match
  let server: McpServer | undefined
  for (const [name, srv] of servers) {
    if (`mcp__${name}__` === fullName.slice(0, `mcp__${name}__`.length)) {
      server = srv
      break
    }
  }
  if (!server || !server.connected) return `ERROR: MCP server "${serverNameRaw}" not connected`

  const result = await callMcpTool(server, toolName, args)
  if (result?.error) return `ERROR MCP (${serverNameRaw}/${toolName}): ${result.error.message}`

  // MCP returns { content: [{ type: 'text', text }] }
  const content = result?.content || []
  return content
    .filter((c) => c.type === 'text')
    .map((c) => c.text || '')
    .join('\n') || JSON.stringify(result)
}

// ── List all connected servers and their tools ──
export function listMcpServers(): {
  name: string
  connected: boolean
  transport: 'stdio' | 'http'
  url?: string
  command?: string
  args?: string[]
  tools: { name: string; description: string }[]
}[] {
  return Array.from(servers.entries()).map(([name, server]) => ({
    name,
    connected: server.connected,
    transport: server.transport,
    url: server.url,
    command: server.command,
    args: server.args,
    tools: server.tools.map(t => ({ name: t.name, description: t.description })),
  }))
}

// ── Shutdown all connections ──
export function shutdownMcpServers(): void {
  for (const server of servers.values()) disconnectMcpServer(server)
  servers.clear()
}
