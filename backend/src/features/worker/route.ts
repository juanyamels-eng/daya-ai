// ============================================
// DAYA IA — Ruta: Background Worker
//   GET    /api/worker/jobs                 → lista de jobs del usuario
//   POST   /api/worker/jobs                 { kind, intervalMin, config?, label? }
//   PATCH  /api/worker/jobs/:id             { enabled }
//   DELETE /api/worker/jobs/:id
//   GET    /api/worker/notifications        → notificaciones acumuladas
//   POST   /api/worker/notifications/:id/read
//   DELETE /api/worker/notifications        → limpiar todas
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import {
  getJobs, addJob, toggleJob, deleteJob, registerActiveUser,
  getNotifications, markNotificationRead, clearNotifications, JobKind,
} from './backgroundWorker'

const router = Router()
router.use(requireAuth)

const VALID_KINDS: JobKind[] = ['inbox-scan', 'task-due', 'watcher']

router.get('/jobs', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  res.json({ jobs: await getJobs(userId) })
})

router.post('/jobs', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { kind, intervalMin, config, label } = req.body || {}
  if (!VALID_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Tipo de tarea no válido.' })
  }
  // Validación mínima para watcher
  if (kind === 'watcher' && !/^https?:\/\//i.test(config?.url || '')) {
    return res.status(400).json({ error: 'El watcher necesita una URL válida.' })
  }
  try {
    const job = await addJob(userId, kind, Number(intervalMin) || 60, config || {}, label)
    await registerActiveUser(userId)
    res.json({ job })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo crear la tarea.' })
  }
})

router.patch('/jobs/:id', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { enabled } = req.body || {}
  try {
    await toggleJob(userId, req.params.id, enabled !== false)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo actualizar.' })
  }
})

router.delete('/jobs/:id', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    await deleteJob(userId, req.params.id)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo borrar.' })
  }
})

router.get('/notifications', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  res.json({ notifications: await getNotifications(userId) })
})

router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  await markNotificationRead(userId, req.params.id)
  res.json({ ok: true })
})

router.delete('/notifications', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  await clearNotifications(userId)
  res.json({ ok: true })
})

export default router
