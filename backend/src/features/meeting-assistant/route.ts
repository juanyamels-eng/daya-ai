import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'

const db = prisma
const router = Router()

// ============================================
// MEETING ASSISTANT
// Real-time meeting notes, transcription, and action items
// ============================================

// Create meeting session
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { title, platform, participants } = req.body

  const meeting = await db.meeting.create({
    data: {
      userId,
      title: title || 'Reunión sin título',
      platform: platform || 'manual',
      participants: participants || [],
      status: 'active',
    },
  })

  res.json({ meeting })
})

// List meetings
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { status } = req.query

  const meetings = await db.meeting.findMany({
    where: {
      userId,
      ...(status && { status: status as string }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  res.json({ meetings })
})

// Get meeting details
router.get('/:meetingId', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId } = req.params

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
    include: {
      transcripts: { orderBy: { timestamp: 'asc' } },
      actionItems: true,
    },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  res.json({ meeting })
})

// Update meeting
router.put('/:meetingId', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId } = req.params
  const { title, status, summary, decisions } = req.body

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  const updated = await db.meeting.update({
    where: { id: meetingId },
    data: {
      ...(title !== undefined && { title }),
      ...(status !== undefined && { status }),
      ...(summary !== undefined && { summary }),
      ...(decisions !== undefined && { decisions }),
    },
  })

  res.json({ meeting: updated })
})

// Add transcript segment
router.post('/:meetingId/transcript', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId } = req.params
  const { speaker, text, timestamp, confidence } = req.body

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  const segment = await db.meetingTranscript.create({
    data: {
      meetingId,
      speaker: speaker || 'Unknown',
      text,
      timestamp: timestamp || 0,
      confidence: confidence || 1,
    },
  })

  res.json({ segment })
})

// Get full transcript
router.get('/:meetingId/transcript', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId } = req.params

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  const transcripts = await db.meetingTranscript.findMany({
    where: { meetingId },
    orderBy: { timestamp: 'asc' },
  })

  res.json({ transcripts })
})

// Generate AI summary
router.post('/:meetingId/summarize', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId } = req.params

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
    include: { transcripts: true },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  const fullTranscript = meeting.transcripts
    .map(t => `[${t.speaker}]: ${t.text}`)
    .join('\n')

  if (!fullTranscript) {
    return res.status(400).json({ error: 'No hay transcripción para resumir' })
  }

  const { chatSingle } = await import('../../services/openrouter')

  const response = await chatSingle(
    [{ role: 'user', content: `Transcripción de la reunión "${meeting.title}":\n\n${fullTranscript}` }],
    'claude',
    `Eres un asistente de reuniones experto. Analiza la siguiente transcripción y genera:
1. RESUMEN: Un resumen ejecutivo de 3-5 oraciones
2. PUNTOS CLAVE: Lista de los puntos más importantes discutidos
3. DECISIONES: Lista de decisiones tomadas
4. ACCIONES: Lista de tareas/aciones con asignación sugerida si es posible
5. PREGUNTAS ABIERTAS: Preguntas que quedaron sin resolver

Responde en español con formato markdown.`
  )

  const aiSummary = response

  // Extract action items from AI response
  const actionItemRegex = /\- \[(?:\[?\])?\s*(.*?)\]/g
  const actionItems: string[] = []
  let match
  while ((match = actionItemRegex.exec(aiSummary)) !== null) {
    actionItems.push(match[1])
  }

  // Save action items
  for (const item of actionItems) {
    await db.meetingActionItem.create({
      data: {
        meetingId,
        title: item,
        status: 'pending',
      },
    })
  }

  // Update meeting with summary
  await db.meeting.update({
    where: { id: meetingId },
    data: { summary: aiSummary },
  })

  res.json({ summary: aiSummary, actionItems })
})

// Get action items
router.get('/:meetingId/actions', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId } = req.params

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  const actions = await db.meetingActionItem.findMany({
    where: { meetingId },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ actions })
})

// Update action item status
router.put('/:meetingId/actions/:actionId', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId, actionId } = req.params
  const { status, assignee } = req.body

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  const action = await db.meetingActionItem.update({
    where: { id: actionId },
    data: {
      ...(status !== undefined && { status }),
      ...(assignee !== undefined && { assignee }),
    },
  })

  res.json({ action })
})

// Delete meeting
router.delete('/:meetingId', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId } = req.params

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  await db.meeting.delete({ where: { id: meetingId } })
  res.json({ ok: true })
})

// Export meeting as markdown
router.get('/:meetingId/export', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { meetingId } = req.params

  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
    include: {
      transcripts: { orderBy: { timestamp: 'asc' } },
      actionItems: true,
    },
  })

  if (!meeting) {
    return res.status(404).json({ error: 'Reunión no encontrada' })
  }

  const markdown = `# ${meeting.title}

**Fecha:** ${meeting.createdAt.toLocaleDateString('es-ES')}
**Plataforma:** ${meeting.platform}
**Estado:** ${meeting.status}
**Participantes:** ${(meeting.participants as string[]).join(', ') || 'N/A'}

## Resumen

${meeting.summary || 'No hay resumen disponible'}

## Transcripción

${meeting.transcripts.map(t => `**[${t.speaker}]** ${t.text}`).join('\n\n')}

## Acciones

${meeting.actionItems.map(a => `- [${a.status === 'completed' ? 'x' : ' '}] ${a.title}${a.assignee ? ` (${a.assignee})` : ''}`).join('\n')}

---
*Generado por DAYA Meeting Assistant*
`

  res.setHeader('Content-Type', 'text/markdown')
  res.setHeader('Content-Disposition', `attachment; filename="meeting-${meetingId}.md"`)
  res.send(markdown)
})

export default router
