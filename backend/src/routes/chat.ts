import { Router, Request, Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth'
import { heavyLimiter, chatBurstLimiter } from '../middleware/rateLimiter'
import { sendMessage, getConversations, getConversation, deleteConversation, renameConversation, saveDocNote } from '../controllers/chatController'
import { transcribeAudio, isTranscriptionConfigured } from '../services/transcription'
import { runDeepResearch, isWebSearchConfigured } from '../services/deepResearch'
import { buildProfessionalHTML } from '../services/documents/pdfGenerator'
import { htmlToPDF } from '../services/documents/pdfRenderer'
import { prisma } from '../lib/prisma'
import { saveToLibrary } from '../services/documents/documentService'

const router = Router()

// Multer en memoria para recibir el audio (máx 25MB)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

router.use(requireAuth)

router.post('/send', chatBurstLimiter, sendMessage)
router.get('/conversations', getConversations)
router.get('/conversations/:id', getConversation)
router.delete('/conversations/:id', deleteConversation)
router.patch('/conversations/:id', renameConversation)
// Persiste documentos generados (y su petición) en el historial del chat
router.post('/note', saveDocNote)

// ── Compartir una conversación por enlace público ───────────────────────────
// Crea (o devuelve) el slug. Es idempotente: pulsar "Compartir" dos veces da el
// mismo enlace, para no dejar enlaces huérfanos circulando por ahí.
router.post('/conversations/:id/share', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const conv = await prisma.conversation.findFirst({ where: { id: req.params.id, userId }, select: { id: true } })
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' })
    const db = prisma as any
    const existing = await db.sharedConversation.findUnique({ where: { conversationId: conv.id }, select: { slug: true } })
    if (existing) return res.json({ slug: existing.slug })
    // 8 caracteres alfanuméricos. Con reintento por si colisiona (improbable,
    // pero el slug es único en base de datos y un 500 aquí sería absurdo).
    const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
    const mkSlug = () => Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = mkSlug()
      try {
        await db.sharedConversation.create({ data: { slug, conversationId: conv.id, userId } })
        return res.json({ slug })
      } catch { /* colisión de slug: otro intento */ }
    }
    res.status(500).json({ error: 'No se pudo generar el enlace' })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Dejar de compartir: se borra la fila y el enlace deja de resolver.
router.delete('/conversations/:id/share', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const db = prisma as any
    await db.sharedConversation.deleteMany({ where: { conversationId: req.params.id, userId } })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Estado del enlace (para que el menú diga "Compartir" o "Dejar de compartir").
router.get('/conversations/:id/share', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const db = prisma as any
    const row = await db.sharedConversation.findFirst({ where: { conversationId: req.params.id, userId }, select: { slug: true } })
    res.json({ slug: row?.slug || null })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Feedback del usuario sobre una respuesta (pulgar arriba/abajo).
// Alimenta el sistema de auto-mejora (TrainingData).
router.post('/feedback', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { userMessage, aiResponse, rating } = req.body // rating: 1 (👍) o -1 (👎)
  if (![1, -1].includes(rating)) return res.status(400).json({ error: 'rating debe ser 1 o -1' })
  try {
    await prisma.trainingData.create({
      data: {
        userId,
        userMessage: (userMessage || '').slice(0, 4000),
        aiResponse: (aiResponse || '').slice(0, 8000),
        userFeedback: rating,
        quality: rating === 1 ? 0.9 : 0.2,
        source: 'feedback',
      },
    })
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Exportar una conversación como PDF con el diseño de DAYA
router.get('/conversations/:id/pdf', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' })

    // Construir markdown legible del intercambio
    const md = conv.messages.map((m: any) => {
      const who = m.role === 'user' ? '**Tú**' : '**DAYA**'
      return `${who}\n\n${m.content}`
    }).join('\n\n---\n\n')

    const html = buildProfessionalHTML(conv.title, md, [])
    const pdf = await htmlToPDF(html)
    const safe = (conv.title || 'conversacion').replace(/[^a-z0-9áéíóúñ ]/gi, '').trim() || 'conversacion'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`)
    res.send(pdf)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error generando el PDF' })
  }
})

// Transcripción de voz (Whisper vía Groq/OpenAI)
router.post('/transcribe', audioUpload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió audio' })
  if (!isTranscriptionConfigured()) {
    return res.status(503).json({ error: 'La transcripción de voz no está disponible.' })
  }
  const result = await transcribeAudio(req.file.buffer, req.file.originalname || 'audio.webm')
  if (!result.success) return res.status(500).json({ error: result.error })
  res.json({ text: result.text })
})

// Investigación Profunda (Deep Research) — búsqueda web + mega-informe + PDF
router.post('/deep-research', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { topic } = req.body
  if (!topic || !topic.trim()) return res.status(400).json({ error: 'Falta el tema de investigación' })
  if (!isWebSearchConfigured()) {
    return res.status(503).json({ error: 'La investigación profunda no está disponible. Falta configurar TAVILY_API_KEY.' })
  }

  // SSE para reportar progreso
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    send({ status: 'Analizando fuentes globales...' })
    const result = await runDeepResearch(topic.trim())

    send({ status: 'Generando informe y documento...' })
    // Maquetar el informe en HTML profesional y renderizarlo a PDF REAL
    const html = buildProfessionalHTML(result.title, result.markdown, [])
    const pdfBuffer = await htmlToPDF(html)

    // Guardar en la biblioteca del usuario como PDF binario real (base64)
    let docId: string | null = null
    try {
      const stored = `__B64__:application/pdf:${pdfBuffer.toString('base64')}`
      const pdfName = /\.pdf$/i.test(result.title) ? result.title : `${result.title}.pdf`
      docId = await saveToLibrary(userId, pdfName, 'pdf', stored, pdfBuffer.length)
    } catch {}

    send({
      done: true,
      title: result.title,
      markdown: result.markdown,
      sources: result.sources,
      docId,
    })
    res.end()
  } catch (err: any) {
    send({ error: err.message || 'Error en la investigación' })
    res.end()
  }
})

export default router
