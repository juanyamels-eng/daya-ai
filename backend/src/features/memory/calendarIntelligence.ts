// ============================================
// DAYA IA — Calendar Intelligence
// Analyzes calendar events and provides:
//   - Conflict detection
//   - Meeting prep suggestions
//   - Time blocking recommendations
//   - Schedule optimization
// ============================================
import { prisma } from '../../lib/prisma'

const db = prisma

export interface CalendarEvent {
  id: string
  title: string
  start: string       // ISO
  end: string         // ISO
  location?: string
  description?: string
  attendees?: string[]
  isRecurring?: boolean
}

export interface CalendarInsight {
  type: 'conflict' | 'prep' | 'optimize' | 'reminder' | 'pattern'
  title: string
  description: string
  events: string[]    // related event IDs
  suggestion?: string
  priority: 'high' | 'medium' | 'low'
}

// ── Conflict detection ──

export function detectConflicts(events: CalendarEvent[]): CalendarInsight[] {
  const insights: CalendarInsight[] = []
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]
      const b = sorted[j]
      const aEnd = new Date(a.end).getTime()
      const bStart = new Date(b.start).getTime()

      if (bStart < aEnd) {
        insights.push({
          type: 'conflict',
          title: `Conflicto: "${a.title}" y "${b.title}"`,
          description: `${a.title} termina ${new Date(a.end).toLocaleTimeString('es')} pero ${b.title} empieza ${new Date(b.start).toLocaleTimeString('es')}`,
          events: [a.id, b.id],
          suggestion: `¿Reagendar uno de los dos?`,
          priority: 'high',
        })
      }
    }
  }

  return insights
}

// ── Meeting prep ──

export function suggestMeetingPrep(events: CalendarEvent[]): CalendarInsight[] {
  const insights: CalendarInsight[] = []
  const now = Date.now()

  for (const event of events) {
    const startMs = new Date(event.start).getTime()
    const diff = startMs - now

    // 30 minutes before meeting
    if (diff > 0 && diff < 30 * 60 * 1000) {
      insights.push({
        type: 'prep',
        title: `Preparación: "${event.title}"`,
        description: `Tu reunión "${event.title}" empieza en ${Math.round(diff / 60000)} minutos`,
        events: [event.id],
        suggestion: `¿Quieres que revise documentos relevantes o prepare un resumen?`,
        priority: 'high',
      })
    }
  }

  return insights
}

// ── Schedule optimization ──

export function optimizeSchedule(events: CalendarEvent[]): CalendarInsight[] {
  const insights: CalendarInsight[] = []
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  // Find gaps > 2 hours between meetings (potential focus time)
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = new Date(sorted[i].end).getTime()
    const nextStart = new Date(sorted[i + 1].start).getTime()
    const gap = nextStart - currentEnd

    if (gap > 2 * 60 * 60 * 1000 && gap < 4 * 60 * 60 * 1000) {
      const gapHours = Math.round(gap / 3600000)
      insights.push({
        type: 'optimize',
        title: `Tiempo de enfoque disponible`,
        description: `Tienes ${gapHours}h libre entre "${sorted[i].title}" y "${sorted[i + 1].title}"`,
        events: [sorted[i].id, sorted[i + 1].id],
        suggestion: `Bloquea este tiempo para trabajo profundo`,
        priority: 'medium',
      })
    }
  }

  // Detect back-to-back meetings (no break)
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = new Date(sorted[i].end).getTime()
    const nextStart = new Date(sorted[i + 1].start).getTime()
    const gap = nextStart - currentEnd

    if (gap < 5 * 60 * 1000 && gap >= 0) {
      insights.push({
        type: 'pattern',
        title: `Reuniones sin descanso`,
        description: `"${sorted[i].title}" y "${sorted[i + 1].title}" están muy juntas (sin break)`,
        events: [sorted[i].id, sorted[i + 1].id],
        suggestion: `Considera agregar un buffer de 5-10 minutos entre reuniones`,
        priority: 'low',
      })
    }
  }

  return insights
}

// ── Get all calendar insights ──

export async function getCalendarInsights(userId: string): Promise<CalendarInsight[]> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `calendar_events:${userId}` } }).catch(() => null)
  if (!row) return []

  const events: CalendarEvent[] = JSON.parse(row.value)
  const now = Date.now()
  const upcoming = events.filter(e => new Date(e.end).getTime() > now)

  const insights: CalendarInsight[] = [
    ...detectConflicts(upcoming),
    ...suggestMeetingPrep(upcoming),
    ...optimizeSchedule(upcoming),
  ]

  return insights.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
}

// ── Calendar summary for system prompt ──

export async function getCalendarContextForPrompt(userId: string): Promise<string> {
  const insights = await getCalendarInsights(userId)
  if (!insights.length) return ''

  const lines = insights.slice(0, 3).map(i => `- [${i.type}] ${i.title}: ${i.description}`)
  return `\nInsights del calendario:\n${lines.join('\n')}`
}
