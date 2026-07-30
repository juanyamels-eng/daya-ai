// ============================================
// DAYA IA — Route: Projects (AI-powered project management)
//   Projects:
//     GET    /api/projects                       → list
//     POST   /api/projects        { name, description? }
//     GET    /api/projects/:id                   → detail + progress
//     DELETE /api/projects/:id
//   Issues:
//     POST   /api/projects/:id/issues   { title, state?, priority?, ... }
//     PATCH  /api/projects/:id/issues/:issueId
//     DELETE /api/projects/:id/issues/:issueId
//   Cycles:
//     POST   /api/projects/:id/cycles   { name, startDate?, endDate?, goal? }
//   AI:
//     POST   /api/projects/:id/import   { text }       → text → issues
//     POST   /api/projects/extract      { text }       → extract only (without saving)
//     GET    /api/projects/:id/suggest-priorities
//     GET    /api/projects/:id/summary
//     GET    /api/projects/:id/blockers
// All return JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import {
  listProjects, getProject, createProject, deleteProject,
  addIssue, updateIssue, deleteIssue, addCycle, computeProgress,
} from './projectStore'
import {
  extractIssuesFromText, importIssuesIntoProject, suggestPriorities, statusSummary, detectBlockers,
} from './projectAI'

const router = Router()
router.use(requireAuth)

// ── Projects ──
router.get('/', async (req: Request, res: Response) => {
  res.json({ projects: await listProjects((req as any).userId) })
})

router.post('/', async (req: Request, res: Response) => {
  const { name, description } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Name is required.' })
  res.json({ project: await createProject((req as any).userId, String(name), description) })
})

router.get('/:id', async (req: Request, res: Response) => {
  const p = await getProject((req as any).userId, req.params.id)
  if (!p) return res.status(404).json({ error: 'Project not found.' })
  res.json({ project: p, progress: computeProgress(p) })
})

router.delete('/:id', async (req: Request, res: Response) => {
  res.json({ deleted: await deleteProject((req as any).userId, req.params.id) })
})

// ── Issues ──
router.post('/:id/issues', async (req: Request, res: Response) => {
  const { title } = req.body || {}
  if (!title) return res.status(400).json({ error: 'Title is required.' })
  const issue = await addIssue((req as any).userId, req.params.id, req.body)
  if (!issue) return res.status(404).json({ error: 'Proyecto no encontrado.' })
  res.json({ issue })
})

router.patch('/:id/issues/:issueId', async (req: Request, res: Response) => {
  const issue = await updateIssue((req as any).userId, req.params.id, req.params.issueId, req.body || {})
  if (!issue) return res.status(404).json({ error: 'Issue not found.' })
  res.json({ issue })
})

router.delete('/:id/issues/:issueId', async (req: Request, res: Response) => {
  res.json({ deleted: await deleteIssue((req as any).userId, req.params.id, req.params.issueId) })
})

// ── Cycles ──
router.post('/:id/cycles', async (req: Request, res: Response) => {
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Cycle name is required.' })
  const cycle = await addCycle((req as any).userId, req.params.id, req.body)
  if (!cycle) return res.status(404).json({ error: 'Proyecto no encontrado.' })
  res.json({ cycle })
})

// ── AI ──
router.post('/extract', async (req: Request, res: Response) => {
  const { text } = req.body || {}
  if (!text) return res.status(400).json({ error: 'Text is required.' })
  res.json({ issues: await extractIssuesFromText(String(text)) })
})

router.post('/:id/import', async (req: Request, res: Response) => {
  const { text } = req.body || {}
  if (!text) return res.status(400).json({ error: 'Text is required.' })
  const result = await importIssuesIntoProject((req as any).userId, req.params.id, String(text))
  res.json(result)
})

router.get('/:id/suggest-priorities', async (req: Request, res: Response) => {
  const p = await getProject((req as any).userId, req.params.id)
  if (!p) return res.status(404).json({ error: 'Project not found.' })
  res.json({ suggestions: await suggestPriorities(p) })
})

router.get('/:id/summary', async (req: Request, res: Response) => {
  const p = await getProject((req as any).userId, req.params.id)
  if (!p) return res.status(404).json({ error: 'Project not found.' })
  res.json({ summary: await statusSummary(p) })
})

router.get('/:id/blockers', async (req: Request, res: Response) => {
  const p = await getProject((req as any).userId, req.params.id)
  if (!p) return res.status(404).json({ error: 'Project not found.' })
  res.json(detectBlockers(p))
})

export default router
