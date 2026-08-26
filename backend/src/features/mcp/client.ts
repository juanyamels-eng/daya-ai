// ============================================
// DAYA IA — MCP Client: transports stdio + Streamable HTTP (JSON-RPC 2.0)
// Connects to external MCP tool servers, discovers their tools, and
// provides a unified interface for the orchestrator.
// - stdio: procesos locales (spawn), para servidores instalados en el host.
// - http:  servidores remotos hospedados (Notion, Linear, Sentry, Zapier…),
//          con sesiones vía header `Mcp-Session-Id` y auth por headers.
// ============================================
import { spawn, ChildProcess } from 'child_process'

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpResponse {
  error?: { message: string }
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
  content?: Array<{ type?: string; text?: string }>
  isError?: boolean
  [key: string]: unknown
}

export interface McpServer {
  name: string
  transport: 'stdio' | 'http'
  proc?: ChildProcess
  url?: string
  headers?: Record<string, string>
  sessionId?: string
  command?: string
  args?: string[]
  tools: McpTool[]
  pending: Map<string, { resolve: (r: McpResponse) => void; timer: ReturnType<typeof setTimeout> }>
  connected: boolean
}

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface McpConfig {
  servers: Record<string, McpServerConfig>
}

const REQUEST_TIMEOUT_MS = 30_000
const PROTOCOL_VERSION_STDIO = '2024-11-05'
const PROTOCOL_VERSION_HTTP = '2025-03-26'
let msgId = 0

// ── Transporte stdio ──
function stdioRequest(server: McpServer, method: string, params: unknown): Promise<McpResponse> {
  return new Promise((resolve) => {
    if (!server.proc?.stdin || !server.connected) {
      resolve({ error: { message: `Server "${server.name}" not connected` } })
      return
    }

    const id = String(++msgId)
    const timer = setTimeout(() => {
      server.pending.delete(id)
      resolve({ error: { message: `Timeout calling ${method} on "${server.name}"` } })
    }, REQUEST_TIMEOUT_MS)

    server.pending.set(id, { resolve, timer })

    const request = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    server.proc.stdin.write(request + '\n')
  })
}

// ── Transporte Streamable HTTP ──
function baseHttpHeaders(server: McpServer): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(server.headers || {}),
  }
  if (server.sessionId) headers['Mcp-Session-Id'] = server.sessionId
  return headers
}

// Extrae la respuesta JSON-RPC correspondiente a `id` de un cuerpo SSE.
export function parseSseResponse(text: string, id: string): McpResponse | undefined {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    try {
      const msg = JSON.parse(trimmed.slice(5).trim())
      if (msg.id === id) return msg.error ? { error: msg.error } : (msg.result || {})
    } catch { /* línea no-JSON dentro del stream */ }
  }
  return undefined
}

async function httpRequest(
  server: McpServer,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ status: number; contentType: string; text: string; sessionId?: string; abortMsg?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(server.url!, {
      method: 'POST',
      headers: baseHttpHeaders(server),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const sessionId = res.headers.get('mcp-session-id') || undefined
    const text = res.status === 202 ? '' : await res.text()
    return { status: res.status, contentType: res.headers.get('content-type') || '', text, sessionId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { status: 0, contentType: '', text: '', abortMsg: /abort/i.test(msg) ? 'timeout' : msg }
  } finally {
    clearTimeout(timer)
  }
}

async function httpSend(server: McpServer, method: string, params: unknown): Promise<McpResponse> {
  const id = String(++msgId)
  const out = await httpRequest(server, { jsonrpc: '2.0', id, method, params }, REQUEST_TIMEOUT_MS)
  if (out.abortMsg) {
    return { error: { message: out.abortMsg === 'timeout' ? `Timeout calling ${method} on "${server.name}"` : out.abortMsg } }
  }
  if (out.sessionId) server.sessionId = out.sessionId
  if (out.status === 202) return {}
  if (out.status < 200 || out.status >= 300) {
    return { error: { message: `HTTP ${out.status} from "${server.name}"` } }
  }
  if ((out.contentType || '').includes('text/event-stream')) {
    return parseSseResponse(out.text, id) || { error: { message: `No JSON-RPC response in SSE stream from "${server.name}"` } }
  }
  try {
    const msg = JSON.parse(out.text)
    return msg.error ? { error: msg.error } : (msg.result || {})
  } catch {
    return { error: { message: `Invalid JSON response from "${server.name}"` } }
  }
}

// Notificación (sin id): el servidor remoto responde 202 Accepted y punto.
async function httpNotify(server: McpServer, method: string): Promise<void> {
  await httpRequest(server, { jsonrpc: '2.0', method }, 5_000)
}

function sendRequest(server: McpServer, method: string, params: unknown): Promise<McpResponse> {
  return server.transport === 'http' ? httpSend(server, method, params) : stdioRequest(server, method, params)
}

// ── Conexión ──

async function initializeAndDiscover(
  server: McpServer,
  protocolVersion: string,
  notifyInitialized: () => Promise<void>
): Promise<McpTool[]> {
  const initResult = await sendRequest(server, 'initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'daya-ai-backend', version: '1.0.0' },
  })

  if (initResult?.error) {
    throw new Error(`MCP init failed for "${server.name}": ${initResult.error.message}`)
  }

  await notifyInitialized()

  const toolsResult = await sendRequest(server, 'tools/list', {})
  return (toolsResult?.tools || []).map(t => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
  }))
}

async function connectStdioServer(name: string, config: McpServerConfig): Promise<McpServer> {
  const proc = spawn(config.command!, config.args || [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...config.env } as NodeJS.ProcessEnv,
    shell: process.platform === 'win32',
  })

  const server: McpServer = {
    name,
    transport: 'stdio',
    proc,
    command: config.command,
    args: config.args,
    tools: [],
    pending: new Map(),
    connected: true,
  }

  proc.stdout!.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        if (msg.id && server.pending.has(msg.id)) {
          const p = server.pending.get(msg.id)!
          clearTimeout(p.timer)
          server.pending.delete(msg.id)
          p.resolve(msg.error ? { error: msg.error } : (msg.result || {}))
        }
      } catch { /* ignore non-JSON lines */ }
    }
  })

  proc.on('exit', () => {
    server.connected = false
    for (const { resolve: r, timer: t } of server.pending.values()) {
      clearTimeout(t)
      r({ error: { message: `MCP server "${name}" exited` } })
    }
    server.pending.clear()
  })

  proc.on('error', (err) => {
    server.connected = false
    console.warn(`[MCP] Server "${name}" process error:`, err.message)
  })

  server.tools = await initializeAndDiscover(server, PROTOCOL_VERSION_STDIO, async () => {
    await sendRequest(server, 'notifications/initialized', {})
  })
  return server
}

async function connectHttpServer(name: string, config: McpServerConfig): Promise<McpServer> {
  const server: McpServer = {
    name,
    transport: 'http',
    url: config.url!,
    headers: config.headers,
    tools: [],
    pending: new Map(),
    connected: true,
  }

  server.tools = await initializeAndDiscover(server, PROTOCOL_VERSION_HTTP, () =>
    httpNotify(server, 'notifications/initialized')
  )
  return server
}

export async function connectMcpServer(name: string, config: McpServerConfig): Promise<McpServer> {
  if (config.url) return connectHttpServer(name, config)
  if (config.command) return connectStdioServer(name, config)
  throw new Error(`MCP server "${name}" necesita "url" (HTTP remoto) o "command" (stdio local)`)
}

export async function callMcpTool(server: McpServer, toolName: string, args: Record<string, unknown>): Promise<McpResponse> {
  return sendRequest(server, 'tools/call', { name: toolName, arguments: args })
}

export function disconnectMcpServer(server: McpServer) {
  server.connected = false
  if (server.transport === 'http') {
    // Best-effort: cierra la sesión según el spec (el servidor puede ignorarlo).
    if (server.sessionId) {
      fetch(server.url!, {
        method: 'DELETE',
        headers: { 'Mcp-Session-Id': server.sessionId, ...(server.headers || {}) },
      }).catch(() => { /* best effort */ })
    }
  } else {
    try { server.proc?.kill() } catch { /* best effort */ }
  }
  for (const { resolve: r, timer: t } of server.pending.values()) {
    clearTimeout(t)
    r({ error: { message: `Server "${server.name}" disconnected` } })
  }
  server.pending.clear()
}

// ── Validación anti-SSRF para URLs registradas por usuarios ──
// En multi-tenant, un usuario NO debe poder apuntar DAYA a servicios internos
// (metadata de la nube, Postgres del host, panel del router…).
export function isPrivateHostUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return true
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return true
  const h = parsed.hostname.toLowerCase()
  if (h === 'localhost' || h === '::1' || h === '[::1]' || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return false
}
