// ============================================
// DAYA IA — selfimprove: señales de mejora
// --------------------------------------------------------------------------
// Almacén de "oportunidades de mejora" que alimenta el loop de auto-mejora:
// fallos de herramientas, tests rotos, peticiones manuales. Se persisten en
// DayaSystemConfig (sin migraciones), deduplicadas por firma.
// ============================================

import { loadConfigObj, saveConfigObj } from '../../services/configStore'

export interface ImprovementIssue {
  id: string
  kind: 'tool_failure' | 'test_failure' | 'feature_request' | 'github_issue' | 'manual'
  title: string
  detail: string
  signature: string
  count: number
  lastSeen: number
  createdAt: number
  status: 'open' | 'in_progress' | 'done' | 'failed'
  runId?: string
  prUrl?: string
}

const KEY = 'selfimprove:issues'

export async function listIssues(): Promise<ImprovementIssue[]> {
  return (await loadConfigObj<ImprovementIssue[]>(KEY)) || []
}

async function saveIssues(issues: ImprovementIssue[]): Promise<void> {
  await saveConfigObj(KEY, issues.slice(0, 200))
}

// Reporta una señal. Deduplica por firma (solo una issue abierta por problema);
// las repetidas incrementan `count` para saber cuánto molesta.
export async function reportIssue(issue: Omit<ImprovementIssue, 'id' | 'count' | 'lastSeen' | 'createdAt' | 'status'>): Promise<void> {
  try {
    const issues = await listIssues()
    const existing = issues.find(i => i.signature === issue.signature && i.status === 'open')
    if (existing) {
      existing.count++
      existing.lastSeen = Date.now()
      existing.detail = String(issue.detail).slice(0, 2000)
    } else {
      issues.unshift({
        ...issue,
        id: 'iss_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        count: 1,
        lastSeen: Date.now(),
        createdAt: Date.now(),
        status: 'open',
      })
    }
    await saveIssues(issues)
  } catch { /* best-effort: una señal no debe tumbar nada */ }
}

export async function updateIssue(id: string, patch: Partial<ImprovementIssue>): Promise<void> {
  const issues = await listIssues()
  const target = issues.find(i => i.id === id)
  if (!target) return
  Object.assign(target, patch)
  await saveIssues(issues)
}

export async function addManualRequest(goal: string): Promise<ImprovementIssue> {
  const issue: Omit<ImprovementIssue, 'id' | 'count' | 'lastSeen' | 'createdAt' | 'status'> = {
    kind: 'manual',
    title: goal.slice(0, 120),
    detail: goal,
    signature: 'manual:' + goal.toLowerCase().trim().slice(0, 80),
  }
  await reportIssue(issue)
  const issues = await listIssues()
  return issues.find(i => i.signature === issue.signature)!
}

// La issue abierta más antigua aún sin trabajar (prioriza por antigüedad).
export async function pickTopIssue(): Promise<ImprovementIssue | null> {
  const issues = await listIssues()
  return issues.find(i => i.status === 'open') || null
}
