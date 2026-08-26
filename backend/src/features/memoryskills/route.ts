// ============================================
// DAYA IA — Ruta: memoria avanzada (consolidación + skills)
//   POST   /api/memoryskills/audit       → consolida la memoria del usuario
//   GET    /api/memoryskills/skills      → lista las skills aprendidas
//   DELETE /api/memoryskills/skills/:id  → borra una skill
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { auditMemories, getSkills, deleteSkill, setSkillEnabled } from './memorySkills'

const router = Router()
router.use(requireAuth)

// Consolida/limpia la memoria (fusiona casi-duplicados, corrige contradicciones).
router.post('/audit', async (req: Request, res: Response) => {
  const userId = req.userId
  try {
    const result = await auditMemories(userId)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'La auditoría falló.' })
  }
})

// Lista las skills aprendidas del usuario.
router.get('/skills', async (req: Request, res: Response) => {
  const userId = req.userId
  try {
    const skills = await getSkills(userId)
    res.json({ skills })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'No se pudieron cargar las skills.' })
  }
})

// Activa/desactiva una skill (sin borrarla).
router.patch('/skills/:id', async (req: Request, res: Response) => {
  const userId = req.userId
  try {
    const enabled = !!req.body?.enabled
    const ok = await setSkillEnabled(userId, req.params.id, enabled)
    res.json({ updated: ok, enabled })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'No se pudo actualizar la skill.' })
  }
})

// Borra una skill por id.
router.delete('/skills/:id', async (req: Request, res: Response) => {
  const userId = req.userId
  try {
    const ok = await deleteSkill(userId, req.params.id)
    res.json({ deleted: ok })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'No se pudo borrar la skill.' })
  }
})

export default router
