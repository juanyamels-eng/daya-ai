// ============================================
// DAYA IA — MCP stdio entry point
// Arranca el servidor MCP por stdio para que clientes compatibles
// (Claude Desktop, OpenCode, etc.) usen las tools de DAYA localmente.
//
// Uso:  npm run mcp
// Config de cliente (ej. claude_desktop_config.json):
//   { "mcpServers": { "daya": { "command": "npx", "args": ["ts-node", "src/mcp-stdio.ts"], "cwd": "<ruta>/backend" } } }
// ============================================
import 'dotenv/config'
import { startMcpStdioServer } from './features/mcp/server'

startMcpStdioServer()
