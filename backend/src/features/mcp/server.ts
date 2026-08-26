// ============================================
// DAYA IA — MCP Server: expose DAYA tools as an MCP-compliant server
// Allows any MCP-compatible client (Claude Desktop, OpenCode, etc.) to use
// DAYA's tools as a local MCP server via stdio transport.
// ============================================
import { ALL_TOOLS } from '../agent/tools/registry'

// Build MCP tools list response
export function getMcpServerTools(): { name: string; description: string; inputSchema: unknown }[] {
  return ALL_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
  }))
}

interface McpRequest {
  method: string
  params: { name: string; arguments: Record<string, unknown> }
}

// Handle MCP server requests over stdin/stdout
export function handleMcpRequest(request: McpRequest): unknown {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'daya-ai', version: '1.0.0' },
      }

    case 'notifications/initialized':
      return null // no response for notifications

    case 'tools/list':
      return { tools: getMcpServerTools() }

    case 'tools/call':
      return handleToolCall(request.params)

    default:
      return { error: { code: -32601, message: `Method not found: ${request.method}` } }
  }
}

async function handleToolCall(params: { name: string; arguments: Record<string, unknown> }): Promise<unknown> {
  const { name, arguments: args } = params

  const tool = ALL_TOOLS.find(t => t.name === name)
  if (!tool) {
    return { error: { code: -32602, message: `Tool not found: ${name}` } }
  }

  try {
    // Use '__mcp__' as userId for server-mode calls
    const result = await tool.run('__mcp__', args || {})
    return {
      content: [{ type: 'text', text: String(result) }],
    }
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
      isError: true,
    }
  }
}

// Start the MCP server on stdio (for CLI usage)
export function startMcpStdioServer(): void {
  let buffer = ''

  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', async (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const request = JSON.parse(line)
        const response = await handleMcpRequest(request)

        if (response !== null) {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: response,
          }) + '\n')
        }
      } catch {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        }) + '\n')
      }
    }
  })

  process.stderr?.write('[DAYA MCP Server] Running on stdio\n')
}
