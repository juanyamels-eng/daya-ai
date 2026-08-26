// ============================================
// DAYA IA — Sandbox routes
// POST /api/sandbox/exec — execute code in isolated sandbox
// GET  /api/sandbox/languages — list supported languages
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { getSandboxProvider } from './registry'

const router = Router()
router.use(requireAuth)

const SUPPORTED_LANGUAGES = [
  { id: 'python', name: 'Python', version: '3.11', extensions: ['.py'] },
  { id: 'javascript', name: 'JavaScript', version: 'Node 20', extensions: ['.js'] },
  { id: 'typescript', name: 'TypeScript', version: '5.x', extensions: ['.ts'] },
  { id: 'bash', name: 'Bash', version: '5.x', extensions: ['.sh'] },
]

router.get('/languages', (_req: Request, res: Response) => {
  res.json({ languages: SUPPORTED_LANGUAGES })
})

router.post('/exec', async (req: Request, res: Response) => {
  const { code, language, timeout_ms } = req.body || {}
  if (!code || !language) return res.status(400).json({ error: 'code and language are required' })

  const supported = ['python', 'javascript', 'typescript', 'bash']
  if (!supported.includes(language)) {
    return res.status(400).json({ error: `Unsupported language. Supported: ${supported.join(', ')}` })
  }

  try {
    const sandbox = getSandboxProvider()
    const result = await sandbox.exec(code, language, timeout_ms || 30_000)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

export default router
