// ============================================
// DAYA IA — Cross-Feature Intelligence
// Connects knowledge across different features:
//   - Documents inform chat context
//   - Calendar informs task prioritization
//   - Emails inform conversation topics
//   - Notes inform document generation
//
// This is what makes Daya feel "smart" — it doesn't
// treat each feature as an isolated silo.
// ============================================
import { prisma } from '../../lib/prisma'
import { getUserFacts } from './userGraph'

const db = prisma

export interface CrossFeatureInsight {
  id: string
  fromFeature: string
  toFeature: string
  insight: string
  confidence: number
  data?: Record<string, unknown>
}

// ── Document → Chat context ──

export async function getDocumentChatContext(userId: string, _query: string): Promise<string> {
  try {
    // Check if query relates to any indexed documents
    const chunks = (await db.$queryRawUnsafe(
      `SELECT source, text, 1 - (embedding <=> $1::vector) AS score
       FROM doc_chunk_vectors
       WHERE "userId" = $2
       ORDER BY embedding <=> $1::vector
       LIMIT 3`,
      `[${new Array(1536).fill(0).join(',')}]`, // dummy vector for now
      userId,
    ).catch(() => [])) as Array<{ source: string; text: string }>

    if (chunks.length) {
      const context = chunks.map(c => `[${c.source}]: ${c.text.slice(0, 200)}`).join('\n')
      return `\nDocumentos relevantes del usuario:\n${context}`
    }
  } catch { /* ok */ }
  return ''
}

// ── Calendar → Task prioritization ──

export async function getCalendarContext(userId: string): Promise<string> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: `calendar_events:${userId}` } }).catch(() => null)
    if (!row) return ''
    const events: any[] = JSON.parse(row.value)
    const now = Date.now()
    const upcoming = events
      .filter(e => new Date(e.start).getTime() > now && new Date(e.start).getTime() - now < 24 * 60 * 60 * 1000)
      .sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 5)

    if (upcoming.length) {
      const lines = upcoming.map(e => `- ${e.title} (${new Date(e.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })})`)
      return `\nPróximos eventos (hoy):\n${lines.join('\n')}`
    }
  } catch { /* ok */ }
  return ''
}

// ── Email → Conversation context ──

export async function getEmailContext(userId: string): Promise<string> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: `email_recent:${userId}` } }).catch(() => null)
    if (!row) return ''
    const emails: any[] = JSON.parse(row.value)
    const recent = emails.slice(0, 3)

    if (recent.length) {
      const lines = recent.map(e => `- De: ${e.from}, Asunto: ${e.subject}`)
      return `\nEmails recientes:\n${lines.join('\n')}`
    }
  } catch { /* ok */ }
  return ''
}

// ── Aggregate all cross-feature context ──

export async function getCrossFeatureContext(userId: string, query: string): Promise<string> {
  const [docCtx, calCtx, emailCtx] = await Promise.all([
    getDocumentChatContext(userId, query),
    getCalendarContext(userId),
    getEmailContext(userId),
  ])

  const parts = [docCtx, calCtx, emailCtx].filter(Boolean)
  if (!parts.length) return ''

  return '\n─── Contexto de tus otros datos ───' + parts.join('')
}

// ── Generate cross-feature insights ──

export async function generateCrossInsights(userId: string): Promise<CrossFeatureInsight[]> {
  const insights: CrossFeatureInsight[] = []
  const facts = await getUserFacts(userId)

  // Example: if user has both work documents and calendar events about the same topic
  // (This is a simplified version — real implementation would do semantic matching)

  const professionalFacts = facts.filter(f => f.category === 'professional')
  if (professionalFacts.length) {
    insights.push({
      id: `cross_professional`,
      fromFeature: 'user_graph',
      toFeature: 'chat',
      insight: `Tu perfil profesional (${professionalFacts[0].value}) puede mejorar mis respuestas. Cuéntame más sobre tus proyectos actuales.`,
      confidence: 0.6,
    })
  }

  return insights
}
