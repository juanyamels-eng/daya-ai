import { Router, Request } from 'express'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const db = prisma as any
const router = Router()
router.use(requireAuth)

const uid = (req: Request) => (req as any).userId
const isHex = (s: any): s is string => typeof s === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)

// Sanea el payload: colores hex (máx 8), fuentes (máx 4, strings cortas), logo
// (dataURL/URL acotado).
function clean(body: any) {
  const colors = (Array.isArray(body?.colors) ? body.colors : []).filter(isHex).slice(0, 8)
  const fonts = (Array.isArray(body?.fonts) ? body.fonts : []).filter((f: any) => typeof f === 'string' && f.trim()).map((f: string) => f.trim().slice(0, 60)).slice(0, 4)
  let logoUrl: string | null = typeof body?.logoUrl === 'string' ? body.logoUrl : null
  if (logoUrl && logoUrl.length > 1_500_000) logoUrl = null   // evita filas gigantes
  return { colors, fonts, logoUrl }
}

// GET /api/brandkit — el kit del usuario (o null si no tiene).
router.get('/', async (req, res) => {
  try {
    const kit = await db.brandKit.findUnique({ where: { userId: uid(req) } })
    res.json(kit || null)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// PUT /api/brandkit — crea o actualiza (upsert) el kit del usuario.
router.put('/', async (req, res) => {
  const data = clean(req.body)
  try {
    const kit = await db.brandKit.upsert({
      where: { userId: uid(req) },
      update: data,
      create: { userId: uid(req), ...data },
    })
    res.json(kit)
  } catch (e: any) {
    console.error('[brandkit PUT] error:', e?.message || e)
    res.status(500).json({ error: e.message })
  }
})

export default router
