// ============================================
// DAYA IA — selfimprove: API REST
// --------------------------------------------------------------------------
// Bajo /api/system/selfimprove (mismo prefijo secreto que el admin, misma
// llave x-admin-key). Expone estado, issues y los botones de lanzar el loop
// (manual con objetivo o automático con la siguiente issue).
// Inerte por diseño: sin SELFIMPROVE_ENABLED=1 todo responde 403.
// ============================================

import { Router, Request, Response } from 'express'
import { isSelfImproveEnabled, repoPath, runSelfImprove } from './agent'
import { listIssues, updateIssue, ImprovementIssue } from './issues'

const router = Router()

// Misma compuerta que el resto del admin (/api/system): x-admin-key.
function requireSelfImproveAdmin(req: Request, res: Response, next: any) {
  const configured = process.env.ADMIN_SECRET_KEY
  const adminKey = req.headers['x-admin-key']
  if (!configured || !adminKey || adminKey !== configured) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  next()
}

router.use(requireSelfImproveAdmin)

// Estado del sistema y de la configuración actual.
router.get('/status', async (_req, res) => {
  res.json({
    enabled: isSelfImproveEnabled(),
    repoPath: repoPath(),
    running: false,
  })
})

// Lista de issues de mejora (con filtro opcional por estado).
router.get('/issues', async (req, res) => {
  const status = req.query.status as string | undefined
  let issues: ImprovementIssue[] = await listIssues()
  if (status) issues = issues.filter(i => i.status === status)
  res.json({ issues })
})

// Actualiza el estado de una issue (para marcarla como revisada).
router.patch('/issues/:id', async (req, res) => {
  const { status } = req.body || {}
  if (!['open', 'in_progress', 'done', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido.' })
  }
  await updateIssue(req.params.id, { status })
  res.json({ ok: true })
})

// Lanza el loop completo (automático: siguiente issue abierta).
router.post('/run', async (_req, res) => {
  if (!isSelfImproveEnabled()) {
    return res.status(403).json({ error: 'Auto-mejora desactivada. Define SELFIMPROVE_ENABLED=1 y DAYA_REPO_PATH.' })
  }
  const result = await runSelfImprove()
  res.json(result)
})

// Lanza el loop con un objetivo manual (crea una issue de tipo manual).
router.post('/run-manual', async (req, res) => {
  if (!isSelfImproveEnabled()) {
    return res.status(403).json({ error: 'Auto-mejora desactivada. Define SELFIMPROVE_ENABLED=1 y DAYA_REPO_PATH.' })
  }
  const goal = String(req.body?.goal || '').trim()
  if (!goal) return res.status(400).json({ error: 'Falta el objetivo (goal).' })
  const result = await runSelfImprove(goal)
  res.json(result)
})

export default router
