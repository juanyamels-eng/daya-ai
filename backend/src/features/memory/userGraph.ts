// ============================================
// DAYA IA — User Graph
// Builds and maintains a knowledge graph about each user.
// Extracts facts, preferences, relationships, and context
// from conversations, documents, and interactions.
//
// This is what makes Daya "remember" who you are:
//   - Your job, hobbies, family, goals
//   - Your preferences (tone, language, topics you care about)
//   - Your patterns (when you work, what you struggle with)
//   - Your relationships (colleagues, family, projects)
// ============================================
import { prisma } from '../../lib/prisma'
import { childLogger } from '../../services/logger'

const db = prisma
const log = childLogger('user-graph')

// ── Types ──

export interface UserFact {
  id: string
  category: 'personal' | 'professional' | 'preference' | 'habit' | 'relationship' | 'goal' | 'context'
  key: string           // e.g. "job_title", "favorite_color", "work_hours"
  value: string
  confidence: number    // 0-1, how sure are we
  source: string        // where we learned this (conversation, document, explicit)
  lastSeen: number      // timestamp
  embedding?: number[]  // for semantic search
}

export interface UserInsight {
  type: 'pattern' | 'preference' | 'suggestion' | 'reminder' | 'connection'
  title: string
  description: string
  confidence: number
  actionable: boolean
  suggestedAction?: string
}

export interface UserProfile {
  userId: string
  facts: UserFact[]
  summary: string       // AI-generated summary of who this user is
  lastUpdated: number
}

// ── CRUD ──

export async function getUserFacts(userId: string): Promise<UserFact[]> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `usergraph:${userId}` } }).catch(() => null)
  return row ? JSON.parse(row.value) : []
}

export async function saveUserFacts(userId: string, facts: UserFact[]): Promise<void> {
  await db.dayaSystemConfig.upsert({
    where: { key: `usergraph:${userId}` },
    update: { value: JSON.stringify(facts) },
    create: { key: `usergraph:${userId}`, value: JSON.stringify(facts) },
  })
}

export async function addFact(userId: string, fact: Omit<UserFact, 'id' | 'lastSeen'>): Promise<UserFact> {
  const facts = await getUserFacts(userId)

  // Deduplicate: if same key exists, update value and confidence
  const existing = facts.find(f => f.category === fact.category && f.key === fact.key)
  if (existing) {
    existing.value = fact.value
    existing.confidence = Math.max(existing.confidence, fact.confidence)
    existing.source = fact.source
    existing.lastSeen = Date.now()
  } else {
    facts.push({
      ...fact,
      id: `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      lastSeen: Date.now(),
    })
  }

  await saveUserFacts(userId, facts)
  return existing || facts[facts.length - 1]
}

export async function removeFact(userId: string, factId: string): Promise<void> {
  const facts = await getUserFacts(userId)
  await saveUserFacts(userId, facts.filter(f => f.id !== factId))
}

// ── Extract facts from conversation ──

export async function extractFactsFromConversation(userId: string, messages: { role: string; content: string }[]): Promise<UserFact[]> {
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n')
  if (!userMessages) return []

  const facts: UserFact[] = []

  // Pattern-based extraction (fast, no LLM needed)
  const patterns: Array<{ regex: RegExp; category: UserFact['category']; key: string; extract: (m: RegExpMatchArray) => string }> = [
    // Job/profession
    { regex: /(?:soy|trabajo como|mi trabajo es|mi profesión es|me dedico a)\s+(.+?)(?:\.|,|\n|$)/gi, category: 'professional', key: 'job_title', extract: m => m[1].trim() },
    // Location
    { regex: /(?:vivo en|estoy en|soy de|mudé a)\s+(.+?)(?:\.|,|\n|$)/gi, category: 'personal', key: 'location', extract: m => m[1].trim() },
    // Language preference
    { regex: /(?:prefiero|hablo|mi idioma es)\s+(.+?)(?:\.|,|\n|$)/gi, category: 'preference', key: 'language', extract: m => m[1].trim() },
    // Hobbies
    { regex: /(?:me gusta|disfruto|hago|mi hobby es|en mi tiempo libre)\s+(.+?)(?:\.|,|\n|$)/gi, category: 'personal', key: 'hobbies', extract: m => m[1].trim() },
    // Goals
    { regex: /(?:quiero|necesito|mi meta es|mi objetivo es|busco)\s+(.+?)(?:\.|,|\n|$)/gi, category: 'goal', key: 'current_goal', extract: m => m[1].trim() },
  ]

  for (const p of patterns) {
    let match
    while ((match = p.regex.exec(userMessages)) !== null) {
      const value = p.extract(match)
      if (value.length > 2 && value.length < 200) {
        facts.push({
          id: `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          category: p.category,
          key: p.key,
          value,
          confidence: 0.7,
          source: 'conversation_pattern',
          lastSeen: Date.now(),
        })
      }
    }
  }

  // Save extracted facts
  if (facts.length) {
    const existing = await getUserFacts(userId)
    for (const fact of facts) {
      const dup = existing.find(f => f.category === fact.category && f.key === fact.key)
      if (!dup) existing.push(fact)
    }
    await saveUserFacts(userId, existing)
    log.info({ userId, count: facts.length }, 'Extracted facts from conversation')
  }

  return facts
}

// ── Generate user profile summary ──

export async function generateProfileSummary(userId: string): Promise<string> {
  const facts = await getUserFacts(userId)
  if (!facts.length) return 'Nuevo usuario — aún no conozco mucho sobre ti. Cuéntame sobre ti para que pueda ayudarte mejor.'

  const byCategory = facts.reduce((acc, f) => {
    acc[f.category] = acc[f.category] || []
    acc[f.category].push(f)
    return acc
  }, {} as Record<string, UserFact[]>)

  const sections: string[] = []
  if (byCategory.professional) sections.push(`Profesión: ${byCategory.professional.map(f => f.value).join(', ')}`)
  if (byCategory.personal) sections.push(`Personal: ${byCategory.personal.map(f => f.value).join(', ')}`)
  if (byCategory.preference) sections.push(`Preferencias: ${byCategory.preference.map(f => f.value).join(', ')}`)
  if (byCategory.goal) sections.push(`Metas actuales: ${byCategory.goal.map(f => f.value).join(', ')}`)
  if (byCategory.habit) sections.push(`Hábitos: ${byCategory.habit.map(f => f.value).join(', ')}`)
  if (byCategory.relationship) sections.push(`Relaciones: ${byCategory.relationship.map(f => f.value).join(', ')}`)

  return sections.join('. ') + '.'
}

// ── Get context for system prompt ──

export async function getUserContext(userId: string): Promise<string> {
  const facts = await getUserFacts(userId)
  if (!facts.length) return ''

  const highConfidence = facts.filter(f => f.confidence >= 0.6)
  if (!highConfidence.length) return ''

  const lines = highConfidence.map(f => `- ${f.key.replace(/_/g, ' ')}: ${f.value}`)
  return `Conocimiento sobre el usuario:\n${lines.join('\n')}`
}
