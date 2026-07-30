// ============================================
// DAYA IA — Feature: Plantillas de prompt ("presets")
// Prompts reutilizables que el usuario guarda y reusa. Todo interno (Prisma).
// NOTA: requiere `npx prisma generate && npx prisma db push` (crea PromptPreset).
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const db = prisma as any
const router = Router()
router.use(requireAuth)
const uid = (req: Request) => (req as any).userId

router.get('/', async (req, res) => {
  try {
    const presets = await db.promptPreset.findMany({ where: { userId: uid(req) }, orderBy: { updatedAt: 'desc' } })
    res.json(presets)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  const { title, content } = req.body
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Faltan título o contenido.' })
  try {
    const preset = await db.promptPreset.create({ data: { userId: uid(req), title: title.trim().slice(0, 80), content: content.trim() } })
    res.status(201).json(preset)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.patch('/:id', async (req, res) => {
  const { title, content } = req.body
  try {
    const r = await db.promptPreset.updateMany({
      where: { id: req.params.id, userId: uid(req) },
      data: { ...(title !== undefined ? { title } : {}), ...(content !== undefined ? { content } : {}) },
    })
    res.json({ success: r.count > 0 })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    await db.promptPreset.deleteMany({ where: { id: req.params.id, userId: uid(req) } })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
