// ============================================
// DAYA IA — Ruta: Insights (uso y costo)
//   GET  /api/insights/usage?days=30   → resumen de uso/costo del usuario
//   POST /api/insights/track           { model, inputTokens?, outputTokens?, feature? }
// Todo devuelve JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { getUsageSummary, trackUsage } from './usageTracker'

const router = Router()
router.use(requireAuth)

router.get('/usage', async (req: Request, res: Response) => {
  const days = Math.max(1, Math.min(Number(req.query.days) || 30, 120))
  try {
    res.json(await getUsageSummary((req as any).userId, days))
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo cargar el uso.' })
  }
})

// Registro manual (normalmente se llama desde el backend, pero queda expuesto).
router.post('/track', async (req: Request, res: Response) => {
  const { model, inputTokens, outputTokens, inputText, outputText, feature } = req.body || {}
  if (!model) return res.status(400).json({ error: 'Falta model.' })
  const cost = await trackUsage({
    userId: (req as any).userId, model,
    inputTokens, outputTokens, inputText, outputText, feature,
  })
  res.json({ ok: true, costUsd: cost })
})

export default router
