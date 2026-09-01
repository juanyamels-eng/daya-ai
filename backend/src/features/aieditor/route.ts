// ============================================
// DAYA IA — Route: AI Editor (autocomplete + slash commands)
//   GET   /api/aieditor/commands             → list available commands
//   POST  /api/aieditor/autocomplete  (SSE)  → continues text at cursor
//   POST  /api/aieditor/command       (SSE)  → executes /improve, /summarize, etc.
//
// Complements the existing features/editor (assist/generate/diagram/save/export);
// here is what was missing: Notion-like inline streaming.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { streamAutocomplete, streamCommand, isValidCommand, listCommands } from './aiEditor'

const router = Router()
router.use(requireAuth)

// Lists commands to render the "/" menu in the frontend.
router.get('/commands', (_req: Request, res: Response) => {
  res.json({ commands: listCommands() })
})

// Prepares the response as Server-Sent Events.
function openSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
}

// Inline autocomplete (ghost text). Emits { delta } chunks and closes with { done }.
router.post('/autocomplete', async (req: Request, res: Response) => {
  const { before, after } = req.body as { before?: string; after?: string }
  if (!before || !String(before).trim()) {
    return res.status(400).json({ error: 'Missing preceding text (before).' })
  }
  openSSE(res)
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  let cancelled = false
  req.on('close', () => { cancelled = true })

  try {
    for await (const delta of streamAutocomplete(String(before), String(after || ''))) {
      if (cancelled) break
      send({ delta })
    }
    if (!cancelled) send({ done: true })
  } catch (e: unknown) {
    send({ error: (e instanceof Error && e.message) || 'Autocomplete failed.' })
  }
  res.end()
})

// Slash command on text or selection. Emits { delta } and closes with { done }.
router.post('/command', async (req: Request, res: Response) => {
  const { command, text, param } = req.body as { command?: string; text?: string; param?: string }
  if (!command || !isValidCommand(command)) {
    return res.status(400).json({ error: 'Invalid command.' })
  }
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Missing text.' })
  }
  openSSE(res)
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  let cancelled = false
  req.on('close', () => { cancelled = true })

  try {
    let full = ''
    for await (const delta of streamCommand(command, String(text), param ? String(param) : undefined)) {
      if (cancelled) break
      full += delta
      send({ delta })
    }
    if (!cancelled) send({ done: true, full })
  } catch (e: unknown) {
    send({ error: (e instanceof Error && e.message) || 'Command failed.' })
  }
  res.end()
})

// SVG logo generation
router.post('/generate-logo', async (req: Request, res: Response) => {
  const { name, tagline, style, industry, primary, secondary, bg } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Missing brand name.' })
  openSSE(res)
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  let cancelled = false
  req.on('close', () => { cancelled = true })
  try {
    const { chatStream } = await import('../../services/openrouter')
    const system = `You are a professional logo designer who writes clean SVG code. You create minimal, professional logos using SVG. RULES: 1) Return ONLY the SVG code, no explanations, no markdown fences. 2) Start directly with <svg and end with </svg>. 3) Use viewBox="0 0 400 400". 4) Make it look professional and balanced. 5) No external fonts or images. 6) Use only the colors provided.`
    const styleDescriptions: Record<string, string> = {
      minimal: 'ultra clean, typographic, whitespace-focused, elegant simplicity',
      bold: 'strong, impactful, heavy typography, geometric shapes, powerful presence',
      retro: 'vintage badge style, classic serif fonts, circular or shield layout, nostalgic',
      playful: 'fun, colorful, rounded shapes, friendly, creative',
      corporate: 'serious, trustworthy, clean lines, professional, institutional',
      tech: 'futuristic, digital, geometric, innovative, circuit-like elements',
    }
    const styleDesc = styleDescriptions[style] || 'professional and clean'
    const prompt = `Create a professional ${styleDesc} SVG logo for a ${industry || 'business'} brand called "${name}"${tagline ? ` with tagline "${tagline}"` : ''}. Primary color: ${primary || '#0f172a'}. Secondary color: ${secondary || '#6366f1'}. Background: ${bg || '#ffffff'}. Make it 400x400, balanced, and professional. Return ONLY the SVG code.`

    for await (const delta of chatStream([{ role: 'user', content: prompt }], 'claude', system)) {
      if (cancelled) break
      send({ delta })
    }
    if (!cancelled) send({ done: true })
  } catch (e: unknown) {
    send({ error: (e instanceof Error && e.message) || 'Error generating logo.' })
  }
  res.end()
})

export default router
