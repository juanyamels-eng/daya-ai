// ============================================
// DAYA IA — Ruta: Smart Memory (resolución inteligente)
//   POST /api/smartmemory/remember   { userMessage, aiResponse }  → extrae + resuelve
//   POST /api/smartmemory/resolve    { facts: [{content, category?}] } → resuelve hechos dados
// Todo devuelve JSON con el resumen de operaciones (ADD/UPDATE/DELETE/NONE).
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { smartRemember, resolveFacts } from './smartMemory'

const router = Router()
router.use(requireAuth)

router.post('/remember', async (req: Request, res: Response) => {
  const { userMessage, aiResponse } = req.body || {}
  if (!userMessage) return res.status(400).json({ error: 'Falta userMessage.' })
  try {
    const result = await smartRemember((req as any).userId, String(userMessage), String(aiResponse || ''))
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'La resolución falló.' })
  }
})

router.post('/resolve', async (req: Request, res: Response) => {
  const { facts } = req.body || {}
  if (!Array.isArray(facts)) return res.status(400).json({ error: 'Falta facts[].' })
  try {
    const result = await resolveFacts((req as any).userId, facts)
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'La resolución falló.' })
  }
})

export default router
