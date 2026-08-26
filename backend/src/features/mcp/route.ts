// ============================================
// DAYA IA — MCP API routes
// GET    /api/mcp/servers          — list connected servers + tools
// POST   /api/mcp/servers          — add a new MCP server (stdio o HTTP remoto)
// DELETE /api/mcp/servers/:name    — remove an MCP server
// POST   /api/mcp/tools/:fullName  — execute an MCP tool directly
// GET    /api/mcp/presets          — catálogo de servidores hospedados recomendados
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { isPrivateHostUrl } from './client'
import { MCP_PRESETS } from './presets'
import { listMcpServers, addMcpServer, removeMcpServer, runMcpTool } from './registry'

const router = Router()
router.use(requireAuth)

// List all MCP servers and their tools
router.get('/servers', async (_req: Request, res: Response) => {
  try {
    const servers = listMcpServers()
    res.json({ servers })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// Catálogo de presets (solo lectura; las credenciales las pone el usuario)
router.get('/presets', (_req: Request, res: Response) => {
  res.json({ presets: MCP_PRESETS })
})

// Add a new MCP server: stdio { command, args?, env? } o remoto { url, headers? }
router.post('/servers', async (req: Request, res: Response) => {
  const { name, command, args, env, url, headers } = req.body || {}
  if (!name || (!command && !url)) return res.status(400).json({ error: 'name and (command or url) are required' })

  const nameRegex = /^[a-z0-9_.-]{1,40}$/i
  if (!nameRegex.test(name)) return res.status(400).json({ error: 'name must be alphanumeric with dots/dashes/underscores, max 40 chars' })

  if (url) {
    if (isPrivateHostUrl(url)) {
      return res.status(400).json({ error: 'url no permitida: solo endpoints públicos https/http (protección SSRF)' })
    }
    // Solo pares string→string; nunca se loguean.
    const cleanHeaders = Object.fromEntries(
      Object.entries(headers || {}).filter(([, v]) => typeof v === 'string' && v.length > 0)
    ) as Record<string, string>
    try {
      const result = await addMcpServer(name, { url, headers: cleanHeaders })
      if (!result.ok) return res.status(502).json({ error: result.error })
      return res.json({ success: true, tools: result.tools })
    } catch (e) {
      return res.status(502).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  try {
    const result = await addMcpServer(name, { command, args, env })
    if (!result.ok) return res.status(500).json({ error: result.error })
    res.json({ success: true, tools: result.tools })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// Remove an MCP server
router.delete('/servers/:name', async (req: Request, res: Response) => {
  const removed = await removeMcpServer(req.params.name)
  res.json({ success: removed })
})

// Execute an MCP tool directly
router.post('/tools/:fullName', async (req: Request, res: Response) => {
  const { fullName } = req.params
  const args = req.body?.args || {}

  try {
    const result = await runMcpTool(fullName, args)
    res.json({ result })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

export default router
