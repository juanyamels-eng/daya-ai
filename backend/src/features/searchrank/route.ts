// ============================================
// DAYA IA — Ruta: búsqueda con re-ranking
// POST /api/searchrank   { query, maxResults?, withBreakdown? }
// Devuelve los resultados de búsqueda ya reordenados por relevancia.
// Útil para el front (panel de fuentes) y para probar el ranker.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { searchAndRank } from './ranking'

const router = Router()
router.use(requireAuth)

router.post('/', async (req: Request, res: Response) => {
  const { query, maxResults, withBreakdown } = req.body as {
    query?: string
    maxResults?: number
    withBreakdown?: boolean
  }
  if (!query || !String(query).trim()) {
    return res.status(400).json({ error: 'Falta la consulta (query).' })
  }
  try {
    const n = Math.max(1, Math.min(Number(maxResults) || 5, 15))
    const results = await searchAndRank(String(query).trim(), n, { withBreakdown: !!withBreakdown })
    res.json({ query, count: results.length, results })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'La búsqueda falló.' })
  }
})

export default router
