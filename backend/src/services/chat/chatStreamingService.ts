import { Request, Response } from 'express'
import { chatStream, chatChainStream } from '../../services/openrouter'
import { selectChain } from '../../services/modelSelector'
import { cleanFallbackTitle, generateSmartTitle } from '../../controllers/chatController'
import { refundMessageQuota } from './quotaService'
import { prisma } from '../../lib/prisma'

export interface StreamingConfig {
  historyMessages: { role: 'user' | 'assistant'; content: string }[]
  systemPrompt: string
  bestModel: string
  userPlan: string
  imageData?: string
  thinkLevel: 'fast' | 'normal' | 'deep'
  message: string
  userId: string
  conversationId: string
  isFirstExchange: boolean
  regenOldAssistantId?: string | null
}

export interface StreamingResult {
  fullResponse: string
  streamFailed: boolean
  finalTitle?: string
  clientGone: boolean
  conversationId: string
  regenOldAssistantId?: string | null
  userId: string
  message: string
  isFirstExchange: boolean
}

export function setupSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform, no-store')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.flushHeaders()

  const socket = res.socket
  if (socket) {
    socket.setNoDelay(true)
    socket.setTimeout(0)
  }
}

export function createClientGoneHandler(req: Request): { current: boolean } {
  const clientGone = { current: false }
  req.on('close', () => { clientGone.current = true })
  return clientGone
}

export function sendConversationId(res: Response, conversationId: string): void {
  res.write(`data: ${JSON.stringify({ conversationId })}\n\n`)
}

export function sendModelInfo(res: Response, model: string): void {
  res.write(`data: ${JSON.stringify({ model })}\n\n`)
}

export async function processStream(
  config: StreamingConfig,
  res: Response,
  clientGoneRef: { current: boolean },
  toolsUsed: string[],
  webSources: { title: string; url: string }[],
  webSearchSucceeded: boolean,
  searchQuotaExhausted: boolean
): Promise<StreamingResult> {
  const { historyMessages, systemPrompt, bestModel, userPlan, imageData, thinkLevel, message, userId, conversationId, isFirstExchange, regenOldAssistantId } = config

  const chainConfig = !imageData ? selectChain(message, userPlan as any) : null

  sendModelInfo(res, chainConfig ? chainConfig.writer : bestModel)

  let fullResponse = ''
  let streamFailed = false
  let clientGone = false

  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n')
  }, 15_000)

  try {
    const responseStream = chainConfig
      ? chatChainStream(
          historyMessages,
          chainConfig.specialist,
          chainConfig.writer,
          systemPrompt,
          chainConfig.instruction
        )
      : chatStream(historyMessages, 'claude', systemPrompt, bestModel, imageData, thinkLevel)

    for await (const part of responseStream) {
      if (clientGoneRef.current) { clientGone = true; break }
      if (typeof part === 'string') {
        fullResponse += part
        res.write(`data: ${JSON.stringify({ chunk: part })}\n\n`)
      } else if (typeof part !== 'string' && part.__reasoning) {
        res.write(`data: ${JSON.stringify({ reasoning: part.__reasoning })}\n\n`)
      }
      res.flush?.()
    }
  } catch (streamErr) {
    streamFailed = true
    console.error('Stream error:', streamErr instanceof Error ? streamErr.message : streamErr)
    if (!clientGoneRef.current) res.write(`data: ${JSON.stringify({ error: 'La IA tuvo un problema al responder. Intenta de nuevo.' })}\n\n`)
  } finally {
    clearInterval(keepalive)
  }

  if (!fullResponse.trim()) streamFailed = true

  if (streamFailed) {
    // Devuelve el cupo reservado: el reembolso vive en quotaService (una sola
    // fuente de verdad, no la SQL duplicada que había aquí).
    await refundMessageQuota(userId)
  }

  if (!streamFailed && !clientGoneRef.current && toolsUsed.length) {
    const toolsLine = formatToolsLine(toolsUsed)
    fullResponse += toolsLine
    res.write(`data: ${JSON.stringify({ chunk: toolsLine })}\n\n`)
    res.flush?.()
  }

  if (!streamFailed && !clientGoneRef.current && webSources.length && webSearchSucceeded) {
    const sourcesBlock = formatSourcesBlock(webSources)
    if (sourcesBlock) {
      fullResponse += sourcesBlock
      res.write(`data: ${JSON.stringify({ chunk: sourcesBlock })}\n\n`)
      res.flush?.()
    }
  } else if (!streamFailed && !clientGoneRef.current && searchQuotaExhausted) {
    const msg = '\n\n_Límite de búsquedas alcanzado. Mejora tu plan para más búsquedas._'
    fullResponse += msg
    res.write(`data: ${JSON.stringify({ chunk: msg })}\n\n`)
    res.flush?.()
  }

  let finalTitle: string | undefined
  if (isFirstExchange && !streamFailed) {
    finalTitle = await Promise.race([
      generateSmartTitle(message, fullResponse).catch(() => cleanFallbackTitle(message)),
      new Promise<string>(resolve => setTimeout(() => resolve(cleanFallbackTitle(message)), 6000)),
    ])
    await prisma.conversation.updateMany({
      where: { id: conversationId, title: cleanFallbackTitle(message) },
      data: { title: finalTitle },
    }).catch(() => {})
  }

  res.write(`data: ${JSON.stringify({ done: true, conversationId, failed: streamFailed, ...(finalTitle ? { title: finalTitle } : {}) })}\n\n`)
  res.end()

  return { fullResponse, streamFailed, finalTitle, clientGone, conversationId, regenOldAssistantId, userId, message, isFirstExchange }
}

export async function saveResponse(
  result: StreamingResult,
  bestModel: string
): Promise<void> {
  const { conversationId, fullResponse, streamFailed, regenOldAssistantId, userId, message } = result

  if (!streamFailed) {
    if (regenOldAssistantId) {
      await prisma.message.delete({ where: { id: regenOldAssistantId } }).catch(() => {})
    }
    await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: fullResponse,
        model: bestModel
      }
    })
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }).catch(() => {})

    const { runPostChatHooks } = await import('../../controllers/chatController')
    void runPostChatHooks(userId, message, fullResponse, bestModel)
  }
}

function formatToolsLine(toolsUsed: string[]): string {
  if (!toolsUsed.length) return ''
  const unicas = Array.from(new Set(toolsUsed))
  return `\n\n_Herramientas usadas: ${unicas.join(' → ')}_`
}

function formatSourcesBlock(sources: { title: string; url: string }[]): string {
  if (!sources.length) return ''
  const seen = new Set<string>()
  const items = sources.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true })
  if (!items.length) return ''
  return `\n\n---\n**Fuentes consultadas:**\n` + items.map(s => `- [${s.title}](${s.url})`).join('\n')
}