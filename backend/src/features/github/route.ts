// ============================================
// DAYA IA — Ruta: GitHub Tools (guardian · scout · doc-agent)
// Todas devuelven JSON.
//
//   Guardian (repo local; requiere git + filesystem):
//     GET  /api/github/status?path=...
//     POST /api/github/scan          { path }
//     POST /api/github/commit        { path, message?, push?, remote?, dryRun? }
//
//   Scout (API de GitHub):
//     POST /api/github/search        { query, lang?, limit? }
//     POST /api/github/files         { fullName, maxFiles? }
//     POST /api/github/file          { fullName, filePath, branch? }
//     POST /api/github/adapt         { code, license?, intent? }
//
//   Doc Agent (repo local):
//     POST /api/github/readme        { path, write?, fileName?, projectName? }
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import * as guardian from './githubGuardian'
import * as scout from './githubScout'
import { generateReadme } from './githubDocAgent'

const router = Router()
router.use(requireAuth)

// ── Guardian ──
router.get('/status', async (req: Request, res: Response) => {
  const p = String(req.query.path || '')
  res.json(await guardian.status(p))
})

router.post('/scan', async (req: Request, res: Response) => {
  const { path } = req.body || {}
  res.json(await guardian.scanChanges(String(path || '')))
})

router.post('/commit', async (req: Request, res: Response) => {
  const { path, message, push, remote, dryRun } = req.body || {}
  res.json(await guardian.guardedCommit(String(path || ''), { message, push: !!push, remote, dryRun: !!dryRun }))
})

// ── Scout ──
router.post('/search', async (req: Request, res: Response) => {
  const { query, lang, limit } = req.body || {}
  res.json(await scout.searchRepos(String(query || ''), lang || '', Number(limit) || 8))
})

router.post('/files', async (req: Request, res: Response) => {
  const { fullName, maxFiles } = req.body || {}
  if (!fullName) return res.status(400).json({ ok: false, error: 'Falta fullName (owner/repo).' })
  res.json(await scout.listFiles(String(fullName), Number(maxFiles) || 60))
})

router.post('/file', async (req: Request, res: Response) => {
  const { fullName, filePath, branch } = req.body || {}
  if (!fullName || !filePath) return res.status(400).json({ ok: false, error: 'Faltan fullName y filePath.' })
  res.json(await scout.getFile(String(fullName), String(filePath), branch || ''))
})

router.post('/adapt', async (req: Request, res: Response) => {
  const { code, license, intent } = req.body || {}
  res.json(await scout.adaptSnippet(String(code || ''), license || null, intent || ''))
})

// ── Doc Agent ──
router.post('/readme', async (req: Request, res: Response) => {
  const { path, write, fileName, projectName } = req.body || {}
  res.json(await generateReadme(String(path || ''), { write: !!write, fileName, projectName }))
})

export default router
