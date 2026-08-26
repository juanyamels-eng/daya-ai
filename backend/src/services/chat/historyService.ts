import { prisma } from '../../lib/prisma'
import { chatSingle } from '../../services/openrouter'
import { cleanFallbackTitle } from '../../controllers/chatController'

export interface HistoryItem {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt?: Date
}

export async function getOrCreateConversation(
  userId: string,
  conversationId: string | null
): Promise<{ conversation: any; isFirstExchange: boolean }> {
  let conversation = conversationId
    ? await prisma.conversation.findFirst({ where: { id: conversationId, userId } })
    : null

  const isFirstExchange = !conversation

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { userId, title: 'Nueva conversación', model: 'auto', mode: 'SINGLE' },
    })
  }

  return { conversation, isFirstExchange }
}

export async function saveUserMessage(
  conversationId: string,
  message: string
): Promise<void> {
  await prisma.message.create({
    data: { conversationId, role: 'user', content: message.slice(0, 8000) }
  })
}

export async function handleRegeneration(
  conversationId: string
): Promise<{ history: HistoryItem[]; regenOldAssistantId: string | null }> {
  let history: HistoryItem[] = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 20,
    select: { id: true, role: true, content: true, createdAt: true },
  })

  let regenOldAssistantId: string | null = null
  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')
  if (lastAssistant) {
    regenOldAssistantId = lastAssistant.id ?? null
    history = history.filter((m) => m.id !== lastAssistant.id)
  }
  const lastUserIdx = history.map((m) => m.role).lastIndexOf('user')
  if (lastUserIdx >= 0) history = history.slice(0, lastUserIdx + 1)

  return { history, regenOldAssistantId }
}

export async function buildHistoryMessages(
  history: HistoryItem[],
  regenerate: boolean,
  message: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const finalHistory = regenerate ? history : [...history, { role: 'user', content: message }]

  if (finalHistory.length > 10) {
    const older = finalHistory.slice(0, finalHistory.length - 6)
    const recent = finalHistory.slice(-6)
    const summaryInput = older
      .map((m) => `${m.role === 'user' ? 'Usuario' : 'DAYA'}: ${m.content.slice(0, 300)}`)
      .join('\n')
    const summary = await chatSingle(
      [{ role: 'user', content: `Resume MUY CONCISO en máximo 120 palabras los temas y conclusiones:\n\n${summaryInput}` }],
      'fast', undefined, undefined, 250
    ).catch(() => '')

    return [
      ...(summary ? [{ role: 'user' as const, content: `[Contexto de mensajes anteriores: ${summary}]` }] : []),
      ...recent.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]
  }

  return finalHistory.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
}

export async function updateConversationTitle(
  conversationId: string,
  provisionalTitle: string,
  finalTitle: string
): Promise<void> {
  await prisma.conversation.updateMany({
    where: { id: conversationId, title: provisionalTitle },
    data: { title: finalTitle },
  }).catch(() => {})
}

export async function touchConversation(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  }).catch(() => {})
}