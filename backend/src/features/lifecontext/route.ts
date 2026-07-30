// ============================================
// DAYA IA — Ruta: Life Context
//   GET    /api/lifecontext            → contexto vivo actual
//   POST   /api/lifecontext/location   { city?, region?, country?, lat?, lon?, timezone? }
//   POST   /api/lifecontext/fact       { key, value }
//   DELETE /api/lifecontext/fact/:key
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { getLifeContext, setUserLocation, setUserFact, deleteUserFact } from './lifeContextAgent'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const ctx = await getLifeContext(userId)
    res.json(ctx)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo cargar el contexto.' })
  }
})

router.post('/location', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { city, region, country, lat, lon, timezone } = req.body || {}
  try {
    const ctx = await setUserLocation(userId, { city, region, country, lat, lon, timezone })
    res.json(ctx)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo guardar la ubicación.' })
  }
})

router.post('/fact', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { key, value } = req.body || {}
  if (!key || !value) return res.status(400).json({ error: 'Faltan key y value.' })
  try {
    await setUserFact(userId, String(key).slice(0, 60), String(value).slice(0, 280))
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo guardar el dato.' })
  }
})

router.delete('/fact/:key', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    await deleteUserFact(userId, req.params.key)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo borrar el dato.' })
  }
})

export default router
