// ============================================
// DAYA IA — Ruta: Hybrid Search (vector + BM25 fusionados con RRF)
//   POST /api/hybridsearch  { query, docs:[{id,text,vector?,meta?}], topK?, weights?, approximate? }
//   POST /api/hybridsearch/rerank { query, items:[{id,text}], topK? }  → solo BM25 (rápido)
// Todo devuelve JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { hybridSearch, HybridDoc } from './hybridSearch'
import { BM25Index } from './bm25'

const router = Router()
router.use(requireAuth)

router.post('/', async (req: Request, res: Response) => {
  const { query, docs, topK, weights, approximate } = req.body || {}
  if (!query || !Array.isArray(docs)) {
    return res.status(400).json({ error: 'Faltan query y docs[].' })
  }
  try {
    const clean: HybridDoc[] = docs
      .filter((d: any) => d && d.id && typeof d.text === 'string')
      .slice(0, 1000)
      .map((d: any) => ({ id: String(d.id), text: d.text, vector: d.vector, meta: d.meta }))
    const hits = await hybridSearch(String(query), clean, {
      topK: Number(topK) || 8,
      weights: Array.isArray(weights) && weights.length === 2 ? [Number(weights[0]), Number(weights[1])] : undefined,
      approximate: !!approximate,
    })
    res.json({ count: hits.length, hits })
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'La búsqueda híbrida falló.' })
  }
})

// Rerank puramente léxico (BM25), sin embeddings: útil y barato para reordenar.
router.post('/rerank', (req: Request, res: Response) => {
  const { query, items, topK } = req.body || {}
  if (!query || !Array.isArray(items)) return res.status(400).json({ error: 'Faltan query e items[].' })
  try {
    const idx = new BM25Index(items.map((i: any) => ({ id: String(i.id), text: String(i.text || '') })))
    const hits = idx.search(String(query), Number(topK) || 10)
    res.json({ count: hits.length, hits })
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'El rerank falló.' })
  }
})

export default router
