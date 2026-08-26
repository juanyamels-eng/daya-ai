import { Request, Response } from 'express'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { chatStream, chatSingle, chatChainStream } from '../services/openrouter'
import { buildSystemPrompt } from '../services/memory'
import { selectBestModel, selectChain, classifyMessage } from '../services/modelSelector'
import { getCheapModel } from '../services/modelCatalog'
import type { PlanId } from '../config/plans'
import { detectImageRequest, handleImageFallback } from '../services/chat/imageService'
import { needsWebSearch, executeWebSearch, formatSourcesBlock } from '../services/chat/webSearchService'
import { executeTools, formatToolsLine } from '../services/chat/toolExecutor'
import { checkAndReserveQuota, refundMessageQuota, handleSearchQuota, refundSearchQuota } from '../services/chat/quotaService'
import { getOrCreateConversation, saveUserMessage, handleRegeneration, buildHistoryMessages, updateConversationTitle, touchConversation } from '../services/chat/historyService'
import { setupSSEHeaders, createClientGoneHandler, sendConversationId, sendModelInfo, processStream, saveResponse } from '../services/chat/chatStreamingService'
import { runDeepResearch, isWebSearchConfigured } from '../services/deepResearch'
import { transcribeAudio as transcribeAudioFn, isTranscriptionConfigured } from '../services/transcription'
import { buildProfessionalHTML } from '../services/documents/pdfGenerator'
import { htmlToPDF } from '../services/documents/pdfRenderer'
import { saveToLibrary } from '../services/documents/documentService'

type HistoryItem = { id?: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt?: Date }

// ============================================
// HELPER FUNCTIONS
// ============================================

export function cleanFallbackTitle(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Nueva conversación'
}

export async function generateSmartTitle(userMessage: string, assistantReply: string): Promise<string> {
  try {
    const sys = `Actúa como un sintetizador de intenciones de usuario. Analiza el intercambio y genera un título limpio, conciso y profesional para la conversación. Restricciones: máximo de 3 a 5 palabras, usa el mismo idioma del usuario, NO uses comillas, NO agregues punto final, NO uses texto introductorio ni la palabra "título". Devuelve ÚNICAMENTE el título.`
    const ask = `Mensaje del usuario: "${userMessage.slice(0, 500)}"
Respuesta del asistente: "${assistantReply.slice(0, 500)}"

Devuelve únicamente el título.`
    const raw = await chatSingle([{ role: 'user', content: ask }], 'claude', sys, getCheapModel())
    const title = (raw || '')
      .replace(/^\s*t[ií]tulo\s*:?\s*/i, '')
      .replace(/^["'`#\s-]+|["'`\s.]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!title) return cleanFallbackTitle(userMessage)
    const capped = title.charAt(0).toUpperCase() + title.slice(1)
    return capped.slice(0, 60)
  } catch {
    return cleanFallbackTitle(userMessage)
  }
}

// Añade al system prompt instrucciones específicas para sacar el máximo de cada modelo.
function injectModelInstructions(basePrompt: string, modelId: string, taskType?: string): string {
  if (taskType === 'code') {
    return basePrompt + `
<model_guidance>
Estás generando CÓDIGO. Tu objetivo es entregar código que la persona pueda usar y ejecutar de inmediato, al nivel de los mejores asistentes.

COMPLETO Y FUNCIONAL:
- Entrega el código COMPLETO que corra de principio a fin. NUNCA dejes huecos tipo "// completa tú el resto", "// implementación aquí" o funciones a medias.
- Incluye TODO lo necesario para ejecutar: imports, dependencias y, si aplica, cómo instalarlas (ej. el comando npm/pip) y cómo correrlo.
- Si faltara un dato no esencial, asume el valor por defecto más razonable y sigue — no te detengas a preguntar.

BIEN ESTRUCTURADO:
- Nombres claros y descriptivos; separa la lógica en funciones/componentes con una sola responsabilidad.
- Sigue las buenas prácticas e idioms del lenguaje/framework (manejo de errores donde importe, tipos si el lenguaje los usa).
- Comentarios SOLO donde aporten (el porqué de algo no obvio), no explicando lo evidente.

PRESENTACIÓN:
- Explica MUY POCO antes del código (1-2 frases máximo) y deja que el código sea el protagonista.
- Pon el código en bloques markdown con el lenguaje correcto (\`\`\`python, \`\`\`tsx, …). Si son varios archivos, un bloque por archivo con su ruta/nombre como encabezado.
- Tras el código, a lo sumo una nota brevísima de uso si de verdad hace falta.

CAMBIOS:
- Si la persona pide ajustes sobre código que ya diste, MODIFICA ese código existente y entrega la versión actualizada completa. No empieces de cero ni cambies cosas que no pidió.
</model_guidance>`
  }

  if (modelId.includes('deepseek-r1')) {
    return basePrompt + `
<model_guidance>
Antes de responder, razona internamente paso a paso (no lo muestres al usuario).
- Analiza el problema desde múltiples ángulos antes de comprometerte con una respuesta
- Verifica tu razonamiento: ¿hay suposiciones implícitas? ¿casos borde?
- Si es un problema con una respuesta correcta definida, calcúlala con precisión
- Si es subjetivo, distingue claramente lo que es hecho de lo que es opinión
Tu respuesta al usuario debe ser clara, directa y bien fundamentada.
</model_guidance>`
  }

  if (modelId.includes('o4-mini') || modelId.includes('o3-mini') || modelId.includes('gpt-5-mini')) {
    return basePrompt + `
<model_guidance>
Razona con rigor matemático y lógico:
- Descompón el problema en pasos verificables
- Muestra el trabajo cuando sea útil para el usuario (no solo el resultado final)
- Verifica unidades, dimensiones y orden de magnitud
- Si hay ambigüedad en la pregunta, resuélvela con la interpretación más razonable
</model_guidance>`
  }

  if (modelId.includes('claude')) {
    const complexTasks = ['reasoning', 'document', 'creative']
    const isComplex = taskType && complexTasks.includes(taskType)
    if (isComplex) {
      return basePrompt + `
<model_guidance>
Para esta tarea, antes de escribir la respuesta:
1. Identifica exactamente qué necesita el usuario (no solo lo que dice literalmente)
2. Considera si hay matices o implicaciones importantes que no mencionó
3. Estructura la respuesta para que sea fácil de usar, no solo de leer
Sé exhaustivo donde importe y conciso donde no.
</model_guidance>`
    }
  }

  if (modelId.includes('gemini')) {
    return basePrompt + '\n\nResponde de forma directa y concisa. Usa listas solo cuando haya 3+ items claramente diferenciados.'
  }

  return basePrompt
}

export const sendMessage = async (req: Request, res: Response) => {
  const userId = req.userId
  const { message, conversationId, imageData, regenerate, webMode, thinkLevel } = req.body
  const think: 'fast' | 'normal' | 'deep' = (thinkLevel === 'fast' || thinkLevel === 'deep') ? thinkLevel : 'normal'

  if (!message?.trim()) return res.status(400).json({ error: 'Mensaje requerido' })
  if (message.length > 8000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 8000 caracteres).' })

  try {
    // === IMAGE FALLBACK (Capa 2) ===
    if (!imageData && !regenerate) {
      const imgPrompt = detectImageRequest(message)
      if (imgPrompt) return handleImageFallback(imgPrompt, res)
    }

    // === QUOTA CHECK & RESERVATION ===
    const quotaResult = await checkAndReserveQuota(userId)
    if (!quotaResult.ok) return res.status(quotaResult.status || 429).json({ error: quotaResult.error })

    const { periodTxt, planCfg, effectivePlan } = quotaResult

    // === CONVERSATION ===
    const { conversation, isFirstExchange } = await getOrCreateConversation(userId, conversationId)

    // Save user message (unless regenerating)
    let history: HistoryItem[]
    let regenOldAssistantId: string | null = null

    if (regenerate) {
      const result = await handleRegeneration(conversation.id)
      history = result.history
      regenOldAssistantId = result.regenOldAssistantId
    } else {
      await saveUserMessage(conversation.id, message)
      history = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 20,
        select: { id: true, role: true, content: true, createdAt: true },
      })
    }

    // === SYSTEM PROMPT & MODEL SELECTION ===
    let systemPrompt = await buildSystemPrompt(userId, message)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const userPlan = (user?.plan as PlanId) || 'FREE'
    const cls = await classifyMessage(message)
    const bestModel = selectBestModel(message, userPlan, !!imageData, cls)
    const taskType = cls.task

    systemPrompt = injectModelInstructions(systemPrompt, bestModel, taskType)

    // === WEB SEARCH ===
    const webSearchResult = await executeWebSearch(message, webMode, systemPrompt, userId, res, { current: false })
    systemPrompt = webSearchResult.context

    // === SSE HEADERS ===
    setupSSEHeaders(res)
    const clientGoneRef = createClientGoneHandler(req)
    sendConversationId(res, conversation.id)

    // === TOOLS ===
    const toolHistory = history.slice(-4).filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 2000) }))
    const toolResult = await executeTools(userId, message, toolHistory, res, clientGoneRef)
    if (toolResult.context) systemPrompt += toolResult.context

    // === HISTORY MESSAGES ===
    const historyMessages = await buildHistoryMessages(history, regenerate, message)

    // === STREAMING ===
    const streamingResult = await processStream(
      {
        historyMessages,
        systemPrompt,
        bestModel,
        userPlan,
        imageData,
        thinkLevel,
        message,
        userId,
        conversationId: conversation.id,
        isFirstExchange,
        regenOldAssistantId,
      },
      res,
      clientGoneRef,
      toolResult.toolsUsed,
      webSearchResult.sources,
      webSearchResult.succeeded,
      webSearchResult.quotaExhausted
    )

    // === SAVE RESPONSE ===
    if (!streamingResult.streamFailed) {
      await saveResponse(streamingResult, bestModel)
    }

  } catch (error) {
    const msg = error instanceof Error ? error.message : undefined
    console.error('Chat error:', msg)
    if (!res.headersSent) {
      const isDev = process.env.NODE_ENV !== 'production'
      res.status(500).json({ error: 'Error procesando mensaje', ...(isDev && msg ? { details: msg } : {}) })
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
      res.end()
    }
  }
}

// ============================================
// CONVERSATION CRUD
// ============================================

export const getConversations = async (req: Request, res: Response) => {
  const userId = req.userId
  const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 50)
  const cursor = req.query.cursor as string | undefined
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    const hasMore = conversations.length > limit
    const page = hasMore ? conversations.slice(0, limit) : conversations
    const nextCursor = hasMore ? page[page.length - 1].id : null
    if (!cursor && !req.query.limit) return res.json(page)
    res.json({ conversations: page, nextCursor, hasMore })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}

export const renameConversation = async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params
  const { title, pinned } = req.body

  const data: Prisma.ConversationUncheckedUpdateInput = {}
  if (typeof title === 'string' && title.trim()) data.title = title.trim().slice(0, 100)
  if (typeof pinned === 'boolean') data.pinned = pinned
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada que actualizar' })

  try {
    const result = await prisma.conversation.updateMany({ where: { id, userId }, data })
    if (result.count === 0) return res.status(404).json({ error: 'Conversación no encontrada' })
    res.json({ success: true, ...data })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}

export const getConversation = async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' })
    res.json(conversation)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}

export const deleteConversation = async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params
  try {
    await prisma.conversation.deleteMany({ where: { id, userId } })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}

// ============================================
// SHARE CONVERSATION
// ============================================

export const shareConversation = async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params
  try {
    const conv = await prisma.conversation.findFirst({ where: { id, userId }, select: { id: true } })
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' })
    const existing = await prisma.sharedConversation.findUnique({ where: { conversationId: conv.id }, select: { slug: true } })
    if (existing) return res.json({ slug: existing.slug })
    const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
    const mkSlug = () => Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = mkSlug()
      try {
        await prisma.sharedConversation.create({ data: { slug, conversationId: conv.id, userId } })
        return res.json({ slug })
      } catch { /* colisión */ }
    }
    res.status(500).json({ error: 'No se pudo generar el enlace' })
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
}

export const unshareConversation = async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params
  try {
    await prisma.sharedConversation.deleteMany({ where: { conversationId: id, userId } })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
}

export const getShareStatus = async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params
  try {
    const row = await prisma.sharedConversation.findFirst({ where: { conversationId: id, userId }, select: { slug: true } })
    res.json({ slug: row?.slug || null })
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
}

// ============================================
// FEEDBACK
// ============================================

export const sendFeedback = async (req: Request, res: Response) => {
  const userId = req.userId
  const { userMessage, aiResponse, rating, conversationId } = req.body
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
    import('../features/memory/learning').then(m =>
      m.recordFeedback(userId, {
        type: rating === 1 ? 'thumbs_up' : 'thumbs_down',
        conversationId: conversationId || 'unknown',
        content: userMessage,
        timestamp: Date.now(),
      })
    ).catch(() => {})
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}

// ============================================
// EXPORT CONVERSATION PDF
// ============================================

export const exportConversationPdf = async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params
  try {
    const conv = await prisma.conversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' })

    const { buildProfessionalHTML } = await import('../services/documents/pdfGenerator')
    const { htmlToPDF } = await import('../services/documents/pdfRenderer')

    const md = conv.messages.map((m) => {
      const who = m.role === 'user' ? '**Tú**' : '**DAYA**'
      return `${who}\n\n${m.content}`
    }).join('\n\n---\n\n')

    const html = buildProfessionalHTML(conv.title, md, [])
    const pdf = await htmlToPDF(html)
    const safe = (conv.title || 'conversacion').replace(/[^a-z0-9áéíóúñ ]/gi, '').trim() || 'conversacion'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`)
    res.send(pdf)
  } catch (err) {
    const msg = err instanceof Error ? err.message : undefined
    res.status(500).json({ error: msg || 'Error generando el PDF' })
  }
}

// ============================================
// SAVE DOC NOTE
// ============================================

export const saveDocNote = async (req: Request, res: Response) => {
  const userId = req.userId
  const { conversationId, prompt, marker } = req.body as { conversationId?: string; prompt?: string; marker?: string }

  if (!marker || typeof marker !== 'string') {
    return res.status(400).json({ error: 'Falta el contenido a guardar' })
  }

  try {
    let conversation = conversationId
      ? await prisma.conversation.findFirst({ where: { id: conversationId, userId } })
      : null

    let created = false
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId, title: cleanFallbackTitle(prompt || 'Documento generado'), model: 'auto', mode: 'SINGLE' },
      })
      created = true
    }

    if (prompt && created) {
      await prisma.message.create({
        data: { conversationId: conversation.id, role: 'user', content: prompt.slice(0, 8000) },
      })
    }

    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: marker.slice(0, 8000) },
    })

    await touchConversation(conversation.id)

    res.json({ success: true, conversationId: conversation.id, title: conversation.title })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}

// ============================================
// TRANSCRIBE AUDIO
// ============================================

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

export const transcribeAudioHandler = [
  audioUpload.single('audio'),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió audio' })
    if (!isTranscriptionConfigured()) {
      return res.status(503).json({ error: 'La transcripción de voz no está disponible.' })
    }
    const result = await transcribeAudioFn(req.file.buffer, req.file.originalname || 'audio.webm')
    if (!result.success) return res.status(500).json({ error: result.error })
    res.json({ text: result.text })
  }
]

// ============================================
// DEEP RESEARCH
// ============================================

export const deepResearchHandler = async (req: Request, res: Response) => {
  const userId = req.userId
  const { topic } = req.body
  if (!topic || !topic.trim()) return res.status(400).json({ error: 'Falta el tema de investigación' })
  if (!isWebSearchConfigured()) {
    return res.status(503).json({ error: 'La investigación profunda no está disponible. Falta configurar TAVILY_API_KEY.' })
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    send({ status: 'Analizando fuentes globales...' })
    const result = await runDeepResearch(topic.trim())

    send({ status: 'Generando informe y documento...' })
    const html = buildProfessionalHTML(result.title, result.markdown, [])
    const pdfBuffer = await htmlToPDF(html)

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : undefined
    send({ error: msg || 'Error en la investigación' })
    res.end()
  }
}

// ============================================
// POST-CHAT HOOKS
// ============================================

export async function runPostChatHooks(
  userId: string,
  userMessage: string,
  aiResponse: string,
  model: string
): Promise<void> {
  const hooks = await Promise.allSettled([
    import('../features/smartmemory/smartMemory').then(m => m.smartRemember(userId, userMessage, aiResponse)),
    import('../features/memoryskills/memorySkills').then(m => m.learnSkillFromExchange(userId, userMessage, aiResponse)),
    import('../features/insights/usageTracker').then(m =>
      m.trackUsage({ userId, model, inputText: userMessage, outputText: aiResponse, feature: 'chat' })
    ),
    import('../features/memory/userGraph').then(m => m.extractFactsFromConversation(userId, [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse },
    ])),
  ])
  for (const r of hooks) {
    if (r.status === 'rejected') console.warn('[chat hooks]', r.reason?.message || r.reason)
  }
}