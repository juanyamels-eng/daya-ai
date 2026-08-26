// ============================================
// DAYA IA — Proactive Engine
// Generates proactive suggestions and insights
// based on user patterns, calendar, email, and context.
//
// Instead of waiting for the user to ask, Daya:
//   - Notices patterns ("you always ask about X on Mondays")
//   - Detects opportunities ("you have a meeting in 30min, want a prep?")
//   - Suggests actions ("you haven't finished X from yesterday")
// ============================================
import { prisma } from '../../lib/prisma'
import { getUserFacts } from './userGraph'
import { getUserMemoryIndex } from './conversationMemory'

const db = prisma

export interface ProactiveSuggestion {
  id: string
  type: 'insight' | 'action' | 'reminder' | 'pattern' | 'connection' | 'tip'
  title: string
  description: string
  confidence: number
  priority: 'high' | 'medium' | 'low'
  icon: string
  actionable: boolean
  suggestedAction?: string
  createdAt: number
  expiresAt?: number
}

// ── Generate suggestions ──

export async function generateProactiveSuggestions(userId: string): Promise<ProactiveSuggestion[]> {
  const suggestions: ProactiveSuggestion[] = []
  const facts = await getUserFacts(userId)
  const memoryIndex = await getUserMemoryIndex(userId, 30)

  // 1. Pattern detection: recurring topics
  const topicCounts = new Map<string, number>()
  for (const mem of memoryIndex) {
    // Simple topic extraction from titles
    const words = mem.title.toLowerCase().split(/\s+/)
    for (const w of words) {
      if (w.length > 4) topicCounts.set(w, (topicCounts.get(w) || 0) + 1)
    }
  }
  const frequentTopics = [...topicCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  for (const [topic, count] of frequentTopics) {
    suggestions.push({
      id: `pattern_${topic}`,
      type: 'pattern',
      title: `Patrón detectado: "${topic}"`,
      description: `Has hablado sobre "${topic}" ${count} veces recientemente. ¿Quieres que profundice en algo específico?`,
      confidence: 0.7,
      priority: 'medium',
      icon: '🔄',
      actionable: true,
      suggestedAction: `Cuéntame más sobre ${topic}`,
      createdAt: Date.now(),
    })
  }

  // 2. Goal tracking
  const goals = facts.filter(f => f.category === 'goal')
  for (const goal of goals) {
    const daysSince = (Date.now() - goal.lastSeen) / (1000 * 60 * 60 * 24)
    if (daysSince > 7) {
      suggestions.push({
        id: `goal_${goal.id}`,
        type: 'reminder',
        title: `Meta actualizdate: ${goal.key.replace(/_/g, ' ')}`,
        description: `No has mencionado "${goal.value}" en ${Math.floor(daysSince)} días. ¿Sigues en eso?`,
        confidence: 0.6,
        priority: 'medium',
        icon: '🎯',
        actionable: true,
        suggestedAction: `Hablemos de "${goal.value}"`,
        createdAt: Date.now(),
      })
    }
  }

  // 3. Time-based suggestions
  const hour = new Date().getHours()
  if (hour === 9) {
    suggestions.push({
      id: 'morning_brief',
      type: 'insight',
      title: 'Buenos días — Tu resumen del día',
      description: 'Revisando tu calendario, emails y tareas pendientes...',
      confidence: 0.9,
      priority: 'high',
      icon: '☀️',
      actionable: false,
      createdAt: Date.now(),
    })
  }

  if (hour === 17 || hour === 18) {
    suggestions.push({
      id: 'evening_wrap',
      type: 'insight',
      title: 'Fin del día — ¿Qué logramos?',
      description: '¿Quieres que resumamos lo que hiciste hoy y preparemos pendientes para mañana?',
      confidence: 0.8,
      priority: 'medium',
      icon: '🌆',
      actionable: true,
      suggestedAction: 'Resumen del día',
      createdAt: Date.now(),
    })
  }

  // 4. Learning tips based on user's interests
  const professionalFacts = facts.filter(f => f.category === 'professional')
  if (professionalFacts.length) {
    const job = professionalFacts[0].value
    suggestions.push({
      id: `tip_${professionalFacts[0].id}`,
      type: 'tip',
      title: `Tip para tu trabajo`,
      description: `Basado en que trabajas como "${job}", hay nuevas tendencias que podrían interesarte.`,
      confidence: 0.5,
      priority: 'low',
      icon: '💡',
      actionable: true,
      suggestedAction: `Muéstrame tendencias para ${job}`,
      createdAt: Date.now(),
    })
  }

  // 5. Connection suggestions (cross-feature)
  const recentMemories = memoryIndex.slice(0, 5)
  if (recentMemories.length >= 3) {
    const titles = recentMemories.map(m => m.title).join(' | ')
    suggestions.push({
      id: 'connection_cross',
      type: 'connection',
      title: 'Conexión entre tus conversaciones',
      description: `Noto que tus últimas conversaciones (${titles.slice(0, 100)}...) están relacionadas. ¿Quieres que las conecte?`,
      confidence: 0.6,
      priority: 'low',
      icon: '🔗',
      actionable: true,
      suggestedAction: 'Conectar conversaciones',
      createdAt: Date.now(),
    })
  }

  // Save suggestions
  await db.dayaSystemConfig.upsert({
    where: { key: `suggestions:${userId}` },
    update: { value: JSON.stringify(suggestions) },
    create: { key: `suggestions:${userId}`, value: JSON.stringify(suggestions) },
  }).catch(() => {})

  return suggestions
}

// ── Get saved suggestions ──

export async function getSavedSuggestions(userId: string): Promise<ProactiveSuggestion[]> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `suggestions:${userId}` } }).catch(() => null)
  if (!row) return []
  const suggestions: ProactiveSuggestion[] = JSON.parse(row.value)
  return suggestions.filter(s => !s.expiresAt || s.expiresAt > Date.now())
}

// ── Dismiss a suggestion ──

export async function dismissSuggestion(userId: string, suggestionId: string): Promise<void> {
  const suggestions = await getSavedSuggestions(userId)
  const filtered = suggestions.filter(s => s.id !== suggestionId)
  await db.dayaSystemConfig.upsert({
    where: { key: `suggestions:${userId}` },
    update: { value: JSON.stringify(filtered) },
    create: { key: `suggestions:${userId}`, value: JSON.stringify(filtered) },
  }).catch(() => {})
}
