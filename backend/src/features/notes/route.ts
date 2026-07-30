// ============================================
// DAYA IA — Feature: Notas y Tareas
// Notas rápidas + lista de tareas con prioridad y fecha opcional.
// Todo interno (Prisma + DB), sin servicios externos.
//
// NOTA: el cliente Prisma se regenera con los modelos nuevos al correr en tu
// entorno `npx prisma generate && npx prisma db push`. Mientras tanto accedemos
// a los modelos vía `db` (cast) para no depender de la generación local.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const db = prisma as any
const router = Router()
router.use(requireAuth)

const uid = (req: Request) => (req as any).userId

// ───────────── NOTAS ─────────────
router.get('/notes', async (req, res) => {
  try {
    const notes = await db.note.findMany({
      where: { userId: uid(req) },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    })
    res.json(notes)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.post('/notes', async (req, res) => {
  const { title, content, color } = req.body
  try {
    const note = await db.note.create({
      data: { userId: uid(req), title: title || '', content: content || '', color: color || 'default' },
    })
    res.status(201).json(note)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.patch('/notes/:id', async (req, res) => {
  const { title, content, color, pinned } = req.body
  try {
    const r = await db.note.updateMany({
      where: { id: req.params.id, userId: uid(req) },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(pinned !== undefined ? { pinned } : {}),
      },
    })
    res.json({ success: r.count > 0 })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.delete('/notes/:id', async (req, res) => {
  try {
    await db.note.deleteMany({ where: { id: req.params.id, userId: uid(req) } })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ───────────── TAREAS ─────────────
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await db.task.findMany({
      where: { userId: uid(req) },
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    })
    res.json(tasks)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.post('/tasks', async (req, res) => {
  const { title, priority, dueDate } = req.body
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'La tarea necesita un título.' })
  try {
    const task = await db.task.create({
      data: {
        userId: uid(req),
        title: String(title).trim(),
        priority: priority || 'normal',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    })
    res.status(201).json(task)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.patch('/tasks/:id', async (req, res) => {
  const { done, title, priority, dueDate } = req.body
  try {
    const r = await db.task.updateMany({
      where: { id: req.params.id, userId: uid(req) },
      data: {
        ...(done !== undefined ? { done } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      },
    })
    res.json({ success: r.count > 0 })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.delete('/tasks/:id', async (req, res) => {
  try {
    await db.task.deleteMany({ where: { id: req.params.id, userId: uid(req) } })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
