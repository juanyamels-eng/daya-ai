import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'

const db = prisma as any
const router = Router()

// Get or create collaboration session
router.post('/session', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { documentType, documentId } = req.body

  if (!documentType || !documentId) {
    return res.status(400).json({ error: 'documentType y documentId requeridos' })
  }

  let session = await db.collaborationSession.findUnique({
    where: { documentType_documentId: { documentType, documentId } },
    include: { participants: true },
  })

  if (!session) {
    session = await db.collaborationSession.create({
      data: { documentType, documentId, ownerId: userId },
      include: { participants: true },
    })
  }

  // Add user as participant if not already
  const existingParticipant = session.participants.find((p: any) => p.userId === userId)
  if (!existingParticipant) {
    await db.collaborationParticipant.create({
      data: {
        sessionId: session.id,
        userId,
        color: getRandomColor(),
      },
    })
  }

  res.json({ session })
})

// Get active participants
router.get('/session/:sessionType/:documentId/participants', requireAuth, async (req: Request, res: Response) => {
  const { sessionType, documentId } = req.params

  const session = await db.collaborationSession.findUnique({
    where: { documentType_documentId: { documentType: sessionType, documentId } },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
    },
  })

  if (!session) {
    return res.json({ participants: [] })
  }

  res.json({ participants: session.participants })
})

// Update cursor position
router.put('/cursor', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { documentType, documentId, line, ch, selection } = req.body

  const session = await db.collaborationSession.findUnique({
    where: { documentType_documentId: { documentType, documentId } },
  })

  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  await db.collaborationParticipant.updateMany({
    where: { sessionId: session.id, userId },
    data: { cursor: { line, ch, selection } },
  })

  res.json({ ok: true })
})

// Leave session
router.post('/session/:sessionType/:documentId/leave', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { sessionType, documentId } = req.params

  const session = await db.collaborationSession.findUnique({
    where: { documentType_documentId: { documentType: sessionType, documentId } },
  })

  if (!session) return res.json({ ok: true })

  await db.collaborationParticipant.deleteMany({
    where: { sessionId: session.id, userId },
  })

  // If no participants left, mark session as inactive
  const remaining = await db.collaborationParticipant.count({
    where: { sessionId: session.id },
  })

  if (remaining === 0) {
    await db.collaborationSession.update({
      where: { id: session.id },
      data: { isActive: false },
    })
  }

  res.json({ ok: true })
})

const CURSOR_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

function getRandomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]
}

export default router
