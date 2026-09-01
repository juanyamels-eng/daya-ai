// ============================================
// DAYA IA — GraphRAG routes
// POST /api/graphrag/sync       — sync user's documents/memories to graph
// POST /api/graphrag/query      — query the knowledge graph
// DELETE /api/graphrag          — delete user's graph data
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { syncUserGraph } from './sync'
import { queryGraph, deleteGraphData } from './graph'
import { formatGraphContext } from './query'

const router = Router()
router.use(requireAuth)

// Sync user's documents and memories into the knowledge graph
router.post('/sync', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const result = await syncUserGraph(userId)
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    console.error('[graphrag] sync error:', e instanceof Error ? e.message : String(e))
    res.status(500).json({ error: 'Sync failed' })
  }
})

// Query the knowledge graph
router.post('/query', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { query, topK = 5 } = req.body || {}
  if (!query) return res.status(400).json({ error: 'query is required' })

  try {
    const results = await queryGraph(userId, query, topK)
    const context = formatGraphContext(results)
    res.json({
      results: results.map(r => ({
        entity: r.entity,
        relations: r.relations.length,
        score: r.score,
      })),
      context,
    })
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// Delete user's graph data
router.delete('/', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { sourceId } = req.body || {}
  try {
    await deleteGraphData(userId, sourceId)
    res.json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

export default router
