// ============================================
// DAYA IA — Project Manager IA
// --------------------------------------------------------------------------
// La capa que hace especial a DAYA: la IA hace el trabajo pesado de gestión.
//   • extractIssuesFromText  → convierte texto libre / acta de reunión en issues
//     estructurados (título, estado, prioridad, etiquetas, responsable).
//   • suggestPriorities      → propone prioridades para issues sin clasificar.
//   • statusSummary          → resumen del estado del proyecto en lenguaje natural.
//   • detectBlockers         → señala cuellos de botella y dependencias en riesgo.
//
// Conecta con lo que ya construimos: audiointel (saca tareas de una reunión) y
// flow (orquesta). Código propio.
// ============================================

import { chatJSON, chatSingle } from '../../services/openrouter'
import {
  Project, Issue, IssuePriority, addIssue, computeProgress,
} from './projectStore'

// ── Extraer issues de texto libre ────────────────────────────────────────────

const EXTRACT_SYS = `Eres un jefe de proyecto. Conviertes texto libre (notas, actas de reunión, mensajes) en una lista de issues accionables y bien formados. Cada issue tiene un título claro en imperativo, prioridad y, si se menciona, responsable y fecha. No inventes tareas que no estén implícitas en el texto. Respondes SOLO en JSON.`

export interface ExtractedIssue {
  title: string
  description?: string
  priority: IssuePriority
  labels: string[]
  assignee?: string
  dueDate?: string
}

/** Analiza texto y devuelve issues estructurados (sin guardarlos todavía). */
export async function extractIssuesFromText(text: string): Promise<ExtractedIssue[]> {
  if (!text || text.trim().length < 15) return []
  try {
    const parsed = await chatJSON(
      `Extrae issues accionables de este texto:\n"""${text.slice(0, 8000)}"""\n\n` +
      `Responde SOLO con JSON:\n` +
      `{ "issues": [ { "title": "imperativo y conciso", "description": "detalle opcional", "priority": "urgent|high|medium|low|none", "labels": ["área/tipo"], "assignee": "responsable o ''", "dueDate": "ISO o ''" } ] }\n` +
      `No inventes. Si el texto no contiene tareas, devuelve lista vacía.`,
      EXTRACT_SYS
    )
    const issues = Array.isArray(parsed?.issues) ? parsed.issues : []
    return issues
      .filter((i: any) => i && typeof i.title === 'string' && i.title.trim())
      .map((i: any) => ({
        title: String(i.title).slice(0, 240),
        description: i.description ? String(i.description).slice(0, 2000) : undefined,
        priority: normalizePriority(i.priority),
        labels: Array.isArray(i.labels) ? i.labels.map((l: any) => String(l).slice(0, 40)).slice(0, 5) : [],
        assignee: i.assignee ? String(i.assignee).slice(0, 80) : undefined,
        dueDate: i.dueDate && /^\d{4}-\d{2}/.test(i.dueDate) ? i.dueDate : undefined,
      }))
      .slice(0, 40)
  } catch {
    return []
  }
}

/** Extrae issues de un texto y los AÑADE directamente a un proyecto. */
export async function importIssuesIntoProject(
  userId: string, projectId: string, text: string
): Promise<{ added: number; issues: Issue[] }> {
  const extracted = await extractIssuesFromText(text)
  const issues: Issue[] = []
  for (const e of extracted) {
    const created = await addIssue(userId, projectId, { ...e, state: 'todo' })
    if (created) issues.push(created)
  }
  return { added: issues.length, issues }
}

// ── Sugerir prioridades ───────────────────────────────────────────────────────

export async function suggestPriorities(project: Project): Promise<{ issueId: string; suggested: IssuePriority; reason: string }[]> {
  const unset = project.issues.filter(i => i.priority === 'none' && i.state !== 'done' && i.state !== 'cancelled')
  if (!unset.length) return []
  try {
    const list = unset.slice(0, 25).map(i => `${i.id}: ${i.title}${i.dueDate ? ` (vence ${i.dueDate})` : ''}`).join('\n')
    const parsed = await chatJSON(
      `Proyecto: "${project.name}". Sugiere prioridad para estos issues sin clasificar:\n${list}\n\n` +
      `Responde SOLO con JSON: { "suggestions": [ { "issueId": "...", "suggested": "urgent|high|medium|low", "reason": "breve" } ] }`,
      'Eres un jefe de proyecto que prioriza con criterio (impacto, urgencia, dependencias). Respondes SOLO en JSON.'
    )
    const s = Array.isArray(parsed?.suggestions) ? parsed.suggestions : []
    return s
      .filter((x: any) => x && x.issueId)
      .map((x: any) => ({ issueId: String(x.issueId), suggested: normalizePriority(x.suggested), reason: String(x.reason || '').slice(0, 200) }))
  } catch {
    return []
  }
}

// ── Resumen de estado ─────────────────────────────────────────────────────────

export async function statusSummary(project: Project): Promise<string> {
  const prog = computeProgress(project)
  const top = project.issues
    .filter(i => i.state === 'in_progress' || i.priority === 'urgent' || i.priority === 'high')
    .slice(0, 10)
    .map(i => `- [${i.state}] (${i.priority}) ${i.title}`)
    .join('\n')
  try {
    return await chatSingle(
      [{
        role: 'user',
        content:
          `Resume el estado de este proyecto en 3-5 frases, claro y honesto, señalando avances, riesgos y qué priorizar.\n\n` +
          `Proyecto: ${project.name}\n` +
          `Progreso: ${prog.completionPct}% completado · ${prog.byState.in_progress} en curso · ${prog.byState.todo} por hacer · ${prog.overdue} vencidos · ${prog.blocked} bloqueados\n` +
          `Issues destacados:\n${top || '(ninguno)'}`,
      }],
      'claude',
      'Eres un jefe de proyecto que da reportes de estado concisos, honestos y accionables.'
    )
  } catch {
    return `Progreso: ${prog.completionPct}%. ${prog.byState.in_progress} en curso, ${prog.overdue} vencidos, ${prog.blocked} bloqueados.`
  }
}

// ── Detectar bloqueos / cuellos de botella ───────────────────────────────────

export interface BlockerReport {
  blockedIssues: { id: string; title: string; waitingOn: string[] }[]
  staleInProgress: { id: string; title: string; days: number }[]
  overloaded: { assignee: string; count: number }[]
}

/** Análisis determinista (sin IA) de riesgos del proyecto. */
export function detectBlockers(project: Project): BlockerReport {
  const now = Date.now()
  const byId = new Map(project.issues.map(i => [i.id, i]))

  const blockedIssues = project.issues
    .filter(i => (i.blockedBy || []).length && i.state !== 'done' && i.state !== 'cancelled')
    .map(i => ({
      id: i.id, title: i.title,
      waitingOn: (i.blockedBy || [])
        .map(b => byId.get(b))
        .filter(b => b && b.state !== 'done' && b.state !== 'cancelled')
        .map(b => b!.title),
    }))
    .filter(x => x.waitingOn.length)

  // "En curso" desde hace mucho (>10 días sin actualizar) = posible estancamiento.
  const staleInProgress = project.issues
    .filter(i => i.state === 'in_progress' && (now - i.updatedAt) > 10 * 24 * 60 * 60 * 1000)
    .map(i => ({ id: i.id, title: i.title, days: Math.round((now - i.updatedAt) / (24 * 60 * 60 * 1000)) }))

  // Responsables con demasiados issues activos.
  const counts = new Map<string, number>()
  for (const i of project.issues) {
    if (i.assignee && i.state !== 'done' && i.state !== 'cancelled') {
      counts.set(i.assignee, (counts.get(i.assignee) || 0) + 1)
    }
  }
  const overloaded = [...counts.entries()].filter(([, c]) => c >= 5).map(([assignee, count]) => ({ assignee, count }))

  return { blockedIssues, staleInProgress, overloaded }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizePriority(p: any): IssuePriority {
  const v = String(p || '').toLowerCase()
  return (['urgent', 'high', 'medium', 'low', 'none'] as IssuePriority[]).includes(v as IssuePriority) ? v as IssuePriority : 'none'
}
