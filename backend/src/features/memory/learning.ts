// ============================================
// DAYA IA — Learning Loop
// Tracks user feedback and adapts behavior over time.
//
// Signals collected:
//   - Message reactions (thumbs up/down)
//   - Conversation continuation (did user engage or leave?)
//   - Tool retry patterns (did the user re-ask the same thing?)
//   - Explicit feedback ("me gustó", "no me gustó", "mejor así")
// ============================================
import { prisma } from '../../lib/prisma'
import { addFact } from './userGraph'
import { childLogger } from '../../services/logger'

const db = prisma
const log = childLogger('learning')

export interface FeedbackSignal {
  type: 'thumbs_up' | 'thumbs_down' | 'continuation' | 'abandonment' | 'retry' | 'explicit'
  conversationId: string
  messageId?: string
  content?: string
  timestamp: number
}

interface LearningPattern {
  topic: string
  positiveCount: number
  negativeCount: number
  preference: 'more' | 'less' | 'neutral'
  lastUpdated: number
}

// ── Record feedback ──

export async function recordFeedback(userId: string, signal: FeedbackSignal): Promise<void> {
  // Store signal
  const key = `learning:${userId}`
  const row = await db.dayaSystemConfig.findUnique({ where: { key } }).catch(() => null)
  const signals: FeedbackSignal[] = row ? JSON.parse(row.value) : []
  signals.push(signal)
  // Keep last 500 signals
  if (signals.length > 500) signals.splice(0, signals.length - 500)

  await db.dayaSystemConfig.upsert({
    where: { key },
    update: { value: JSON.stringify(signals) },
    create: { key, value: JSON.stringify(signals) },
  }).catch(() => {})

  // Extract learning from explicit feedback
  if (signal.type === 'explicit' && signal.content) {
    await extractPreference(userId, signal.content)
  }

  log.debug({ userId, type: signal.type }, 'Feedback recorded')
}

// ── Extract preferences from feedback ──

async function extractPreference(userId: string, feedback: string): Promise<void> {
  const lower = feedback.toLowerCase()

  if (/me gusta|bueno|perfecto|genial|gracias|me sirvió/.test(lower)) {
    await addFact(userId, {
      category: 'preference',
      key: 'liked_response',
      value: feedback.slice(0, 200),
      confidence: 0.6,
      source: 'explicit_feedback',
    })
  }

  if (/no me gusta|malo|incorrecto|mal|no sirve|mejor/.test(lower)) {
    await addFact(userId, {
      category: 'preference',
      key: 'disliked_response',
      value: feedback.slice(0, 200),
      confidence: 0.6,
      source: 'explicit_feedback',
    })
  }

  if (/más corto|breve|resumido|corto/.test(lower)) {
    await addFact(userId, {
      category: 'preference',
      key: 'response_length',
      value: 'short',
      confidence: 0.8,
      source: 'explicit_feedback',
    })
  }

  if (/más detalle|detallado|explica más|largo/.test(lower)) {
    await addFact(userId, {
      category: 'preference',
      key: 'response_length',
      value: 'detailed',
      confidence: 0.8,
      source: 'explicit_feedback',
    })
  }
}

// ── Analyze patterns ──

export async function analyzeLearningPatterns(userId: string): Promise<LearningPattern[]> {
  const key = `learning:${userId}`
  const row = await db.dayaSystemConfig.findUnique({ where: { key } }).catch(() => null)
  const signals: FeedbackSignal[] = row ? JSON.parse(row.value) : []

  // Group by conversation and analyze
  const byConversation = new Map<string, FeedbackSignal[]>()
  for (const s of signals) {
    if (!byConversation.has(s.conversationId)) byConversation.set(s.conversationId, [])
    byConversation.get(s.conversationId)!.push(s)
  }

  const patterns: Map<string, LearningPattern> = new Map()

  for (const [convId, convSignals] of byConversation) {
    const positive = convSignals.filter(s => s.type === 'thumbs_up' || s.type === 'continuation').length
    const negative = convSignals.filter(s => s.type === 'thumbs_down' || s.type === 'abandonment').length

    if (positive + negative > 0) {
      const topic = convSignals[0]?.content?.slice(0, 50) || convId
      const existing = patterns.get(topic) || { topic, positiveCount: 0, negativeCount: 0, preference: 'neutral' as const, lastUpdated: 0 }
      existing.positiveCount += positive
      existing.negativeCount += negative
      existing.preference = existing.positiveCount > existing.negativeCount * 2 ? 'more' : existing.negativeCount > existing.positiveCount * 2 ? 'less' : 'neutral'
      existing.lastUpdated = Math.max(...convSignals.map(s => s.timestamp))
      patterns.set(topic, existing)
    }
  }

  return [...patterns.values()].sort((a, b) => b.lastUpdated - a.lastUpdated).slice(0, 20)
}

// ── Get learning context for system prompt ──

export async function getLearningContext(userId: string): Promise<string> {
  const patterns = await analyzeLearningPatterns(userId)
  if (!patterns.length) return ''

  const lines = patterns
    .filter(p => p.preference !== 'neutral')
    .map(p => `- "${p.topic}": el usuario ${p.preference === 'more' ? 'quiere más' : 'quiere menos'} de esto`)

  return lines.length ? `Preferencias aprendidas:\n${lines.join('\n')}` : ''
}
