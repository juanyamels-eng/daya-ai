// ============================================
// DAYA IA — Analytics Routes
// GET /api/analytics/tools — tool usage aggregates
// GET /api/analytics/costs — cost breakdown by day
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { getToolAnalytics } from '../../services/analytics'
import { getToolCacheStats } from '../../services/toolCache'

const router = Router()
router.use(requireAuth)

router.get('/tools', (_req: Request, res: Response) => {
  const tool = _req.query.tool as string | undefined
  const analytics = getToolAnalytics(tool)
  res.json({ analytics })
})

router.get('/cache', (_req: Request, res: Response) => {
  const stats = getToolCacheStats()
  res.json({ cache: stats })
})

export default router
