// ============================================
// DAYA IA — Email Intelligence
// Analyzes incoming emails and provides:
//   - Urgency classification (urgent/normal/low)
//   - Category tagging (work/personal/spam/notification)
//   - Auto-draft responses
//   - Summary of inbox
// ============================================
import { prisma } from '../../lib/prisma'
import { childLogger } from '../../services/logger'

const db = prisma
const log = childLogger('email-intel')

export interface EmailAnalysis {
  id: string
  from: string
  subject: string
  snippet: string
  urgency: 'urgent' | 'normal' | 'low'
  category: 'work' | 'personal' | 'spam' | 'notification' | 'newsletter' | 'action_required'
  sentiment: 'positive' | 'neutral' | 'negative'
  suggestedAction: string
  autoReply?: string
  analyzedAt: number
}

// ── Analyze email ──

export function analyzeEmail(email: { from: string; subject: string; body: string }): Omit<EmailAnalysis, 'id' | 'analyzedAt'> {
  const text = `${email.subject} ${email.body}`.toLowerCase()
  const from = email.from.toLowerCase()

  // Urgency detection
  let urgency: EmailAnalysis['urgency'] = 'normal'
  if (/urgente|asap|critical|deadline|hoy|inmediatamente|importante/i.test(text)) urgency = 'urgent'
  if (/newsletter|unsubscribe|no-reply|noreply|notification/i.test(text)) urgency = 'low'

  // Category detection
  let category: EmailAnalysis['category'] = 'notification'
  if (/no.?reply|noreply|notification|alert|update/.test(from)) category = 'notification'
  else if (/unsubscribe|newsletter|marketing/.test(text)) category = 'newsletter'
  else if (/spam|viagra|casino|winner|congratulations/.test(text)) category = 'spam'
  else if (/team|project|meeting|deadline|deliver|client|report/.test(text)) category = 'work'
  else if (/family|friend|birthday|party|personal/.test(text)) category = 'personal'
  else if (/action.?required|please|confirm|approve|review|respond/.test(text)) category = 'action_required'

  // Sentiment
  let sentiment: EmailAnalysis['sentiment'] = 'neutral'
  if (/thank|great|awesome|love|appreciate|congrat/.test(text)) sentiment = 'positive'
  if (/complaint|unhappy|frustrated|angry|disappointed|problem|issue/.test(text)) sentiment = 'negative'

  // Suggested action
  let suggestedAction = 'Leer y archivar'
  if (urgency === 'urgent') suggestedAction = 'Responder URGENTE'
  else if (category === 'action_required') suggestedAction = 'Requiere acción'
  else if (category === 'spam') suggestedAction = 'Mover a spam'
  else if (category === 'newsletter') suggestedAction = 'Leer cuando tengas tiempo'

  // Auto-draft for simple replies
  let autoReply: string | undefined
  if (/thank|gracias/i.test(text) && sentiment === 'positive') {
    autoReply = '¡Gracias por tu mensaje! Lo reviso y te respondo pronto.'
  }

  return {
    from: email.from,
    subject: email.subject,
    snippet: email.body.slice(0, 200),
    urgency,
    category,
    sentiment,
    suggestedAction,
    autoReply,
  }
}

// ── Batch analysis ──

export async function analyzeInbox(userId: string, emails: Array<{ from: string; subject: string; body: string }>): Promise<EmailAnalysis[]> {
  const analyses = emails.map(email => {
    const analysis = analyzeEmail(email)
    return {
      ...analysis,
      id: `email_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      analyzedAt: Date.now(),
    }
  })

  // Save to user's recent emails
  await db.dayaSystemConfig.upsert({
    where: { key: `email_recent:${userId}` },
    update: { value: JSON.stringify(analyses.slice(0, 20)) },
    create: { key: `email_recent:${userId}`, value: JSON.stringify(analyses.slice(0, 20)) },
  }).catch(() => {})

  log.info({ userId, count: analyses.length }, 'Inbox analyzed')
  return analyses
}

// ── Get inbox summary ──

export async function getInboxSummary(userId: string): Promise<string> {
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `email_recent:${userId}` } }).catch(() => null)
  if (!row) return 'No hay emails analizados recientemente.'

  const emails: EmailAnalysis[] = JSON.parse(row.value)
  const urgent = emails.filter(e => e.urgency === 'urgent')
  const actionRequired = emails.filter(e => e.category === 'action_required')

  const lines: string[] = []
  if (urgent.length) lines.push(`🔴 ${urgent.length} emails URGENTES`)
  if (actionRequired.length) lines.push(`🟡 ${actionRequired.length} requieren acción`)
  lines.push(`📧 ${emails.length} emails analizados en total`)

  return lines.join('\n')
}
