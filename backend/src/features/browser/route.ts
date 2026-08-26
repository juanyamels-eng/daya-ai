// ============================================
// DAYA IA — Browser route: REST API for autonomous web browsing
// POST /api/browser/navigate    — navigate to URL
// GET  /api/browser/screenshot  — capture current page
// POST /api/browser/action      — execute any browser action
// POST /api/browser/browse      — autonomous vision-based browsing
// DELETE /api/browser           — close browser session
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { executeBrowserAction, closeBrowser } from './browser'
import { autonomousBrowse } from './vision'

const router = Router()
router.use(requireAuth)

// Navigate to a URL and return content + screenshot
router.post('/navigate', async (req: Request, res: Response) => {
  const { url } = req.body || {}
  if (!url) return res.status(400).json({ error: 'url is required' })

  try {
    const result = await executeBrowserAction({ type: 'navigate', url })
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// Take a screenshot of the current page
router.get('/screenshot', async (_req: Request, res: Response) => {
  try {
    const result = await executeBrowserAction({ type: 'screenshot' })
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// Execute any browser action
router.post('/action', async (req: Request, res: Response) => {
  const { type, url, selector, value, scrollDirection } = req.body || {}
  if (!type) return res.status(400).json({ error: 'type is required' })

  try {
    const result = await executeBrowserAction({ type, url, selector, value, scrollDirection })
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// Autonomous vision-based browsing
router.post('/browse', async (req: Request, res: Response) => {
  const { task, start_url, max_steps } = req.body || {}
  if (!task || !start_url) return res.status(400).json({ error: 'task and start_url are required' })

  try {
    const result = await autonomousBrowse(task, start_url, max_steps || 8)
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// Close browser session
router.delete('/', async (_req: Request, res: Response) => {
  try {
    await closeBrowser()
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router
