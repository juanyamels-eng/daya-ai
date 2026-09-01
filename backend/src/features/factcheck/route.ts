// ============================================
// DAYA IA — Ruta: Fact-check (verificación de afirmaciones)
//   POST /api/factcheck   { text, maxClaims? }
// Devuelve veredicto por afirmación + puntaje de fiabilidad. JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { factCheck } from './factCheck'

const router = Router()
router.use(requireAuth)

router.post('/', async (req: Request, res: Response) => {
  const { text, maxClaims } = req.body || {}
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Falta el texto a verificar.' })
  }
  try {
    const n = Math.max(1, Math.min(Number(maxClaims) || 5, 8))
    res.json(await factCheck(String(text), n))
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'La verificación falló.' })
  }
})

export default router
