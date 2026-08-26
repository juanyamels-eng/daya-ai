// ============================================
// DAYA IA — Conversation Memory
// Automatically summarizes conversations and maintains
// a rolling memory of important context.
//
// Every conversation gets:
//   1. An auto-generated summary (title + key points)
//   2. Extracted facts → fed into User Graph
//   3. A memory score (how important is this conversation)
// ============================================
import { prisma } from '../../lib/prisma'
import { extractFactsFromConversation } from './userGraph'
import { childLogger } from '../../services/logger'

const db = prisma
const log = childLogger('conv-memory')

export interface ConversationMemory {
  conversationId: string
  userId: string
  title: string
  summary: string
  keyPoints: string[]
  topics: string[]
  memoryScore: number     // 0-1, how important to remember
  factsExtracted: number
  createdAt: number
  messageCount: number
}

// ── Summarize a conversation ──

export async function summarizeConversation(
  userId: string,
  conversationId: string,
  messages: { role: string; content: string }[],
): Promise<ConversationMemory> {
  const userMessages = messages.filter(m => m.role === 'user')

  // Generate title from first user message
  const firstMsg = userMessages[0]?.content || ''
  const title = firstMsg.slice(0, 80) + (firstMsg.length > 80 ? '...' : '')

  // Generate summary from all messages
  const allContent = messages.map(m => `${m.role === 'user' ? 'U' : 'D'}: ${m.content.slice(0, 500)}`).join('\n')
  const summary = allContent.slice(0, 1000)

  // Extract key points (sentences with important words)
  const importantWords = ['importante', 'necesito', 'urgente', 'recuerda', 'no olvides', 'decidimos', 'acordamos', 'problema', 'solución', 'meta', 'objetivo']
  const keyPoints = messages
    .flatMap(m => m.content.split(/[.!?]+/))
    .filter(s => importantWords.some(w => s.toLowerCase().includes(w)))
    .map(s => s.trim())
    .filter(s => s.length > 10 && s.length < 200)
    .slice(0, 5)

  // Detect topics
  const topicPatterns: Record<string, RegExp> = {
    'código': /(?:código|code|programa|function|class|npm|pip|git)/i,
    'trabajo': /(?:trabajo|reunión|proyecto|cliente|equipo|deadline)/i,
    'salud': /(?:salud|ejercicio|dieta|dormir|estrés|medico)/i,
    'finanzas': /(?:dinero|inversión|ahorro|presupuesto|crypto|bolsa)/i,
    'aprendizaje': /(?:aprender|curso|estudiar|libro|tutorial|tutorial)/i,
    'creatividad': /(?:escribir|diseñar|crear|arte|música|historia)/i,
    'relaciones': /(?:familia|amigo|pareja|hijo|padre|madre)/i,
  }
  const topics = Object.entries(topicPatterns)
    .filter(([, regex]) => regex.test(allContent))
    .map(([topic]) => topic)

  // Calculate memory score
  const memoryScore = Math.min(1,
    (userMessages.length > 5 ? 0.2 : 0) +
    (keyPoints.length > 2 ? 0.2 : 0) +
    (topics.length > 1 ? 0.1 : 0) +
    (allContent.length > 2000 ? 0.2 : 0) +
    (importantWords.some(w => allContent.toLowerCase().includes(w)) ? 0.3 : 0)
  )

  // Extract facts → User Graph
  let factsExtracted = 0
  try {
    const facts = await extractFactsFromConversation(userId, messages as any)
    factsExtracted = facts.length
  } catch { /* best-effort */ }

  const memory: ConversationMemory = {
    conversationId,
    userId,
    title,
    summary,
    keyPoints,
    topics,
    memoryScore,
    factsExtracted,
    createdAt: Date.now(),
    messageCount: messages.length,
  }

  // Save to DB
  await db.dayaSystemConfig.upsert({
    where: { key: `convmem:${conversationId}` },
    update: { value: JSON.stringify(memory) },
    create: { key: `convmem:${conversationId}`, value: JSON.stringify(memory) },
  }).catch(() => {})

  // Update user's conversation index
  const indexKey = `convmem_index:${userId}`
  const row = await db.dayaSystemConfig.findUnique({ where: { key: indexKey } }).catch(() => null)
  const index: Array<{ id: string; title: string; score: number; ts: number }> = row ? JSON.parse(row.value) : []
  index.unshift({ id: conversationId, title, score: memoryScore, ts: Date.now() })
  // Keep last 100 conversations
  await db.dayaSystemConfig.upsert({
    where: { key: indexKey },
    update: { value: JSON.stringify(index.slice(0, 100)) },
    create: { key: indexKey, value: JSON.stringify(index.slice(0, 100)) },
  }).catch(() => {})

  log.info({ userId, conversationId, topics, factsExtracted }, 'Conversation summarized')
  return memory
}

// ── Retrieve memories ──

export async function getConversationMemory(conversationId: string): Promise<ConversationMemory | null> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `convmem:${conversationId}` } }).catch(() => null)
  return row ? JSON.parse(row.value) : null
}

export async function getUserMemoryIndex(userId: string, limit = 20): Promise<Array<{ id: string; title: string; score: number; ts: number }>> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `convmem_index:${userId}` } }).catch(() => null)
  const index: Array<{ id: string; title: string; score: number; ts: number }> = row ? JSON.parse(row.value) : []
  return index.slice(0, limit)
}

// ── Get relevant memories for a query ──

export async function getRelevantMemories(userId: string, query: string, limit = 5): Promise<ConversationMemory[]> {
  const index = await getUserMemoryIndex(userId, 50)

  // Simple keyword matching (could be enhanced with embeddings)
  const queryWords = query.toLowerCase().split(/\s+/)
  const scored = index.map(entry => {
    const titleWords = entry.title.toLowerCase().split(/\s+/)
    const overlap = queryWords.filter(w => titleWords.some(tw => tw.includes(w) || w.includes(tw))).length
    return { ...entry, relevance: overlap / Math.max(queryWords.length, 1) + entry.score * 0.3 }
  }).sort((a, b) => b.relevance - a.relevance)

  const memories: ConversationMemory[] = []
  for (const entry of scored.slice(0, limit)) {
    const mem = await getConversationMemory(entry.id)
    if (mem) memories.push(mem)
  }

  return memories
}
