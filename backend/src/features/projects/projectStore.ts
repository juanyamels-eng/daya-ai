// ============================================
// DAYA IA — Gestión de proyectos
// --------------------------------------------------------------------------
// Da estructura a tus tareas: hoy `Task` es una lista plana. Esto añade la capa
// de gestión: PROYECTOS que agrupan ISSUES con ESTADO, PRIORIDAD, ETIQUETAS y
// CICLOS (sprints), más cálculo de PROGRESO.
//
// Persistencia SIN migraciones: todo se guarda en DayaSystemConfig (modelo
// existente) como JSON por usuario. Al final está el modelo Prisma dedicado
// (comentado) para cuando quieras tablas formales con Claude Code.
// ============================================

import { prisma } from '../../lib/prisma'

const db = prisma as any

// ── Tipos ─────────────────────────────────────────────────────────────────

export type IssueState = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled'
export type IssuePriority = 'urgent' | 'high' | 'medium' | 'low' | 'none'

export interface Issue {
  id: string
  title: string
  description?: string
  state: IssueState
  priority: IssuePriority
  labels: string[]
  assignee?: string         // texto libre (nombre/rol); DAYA no impone usuarios
  dueDate?: string          // ISO
  cycleId?: string          // a qué ciclo pertenece
  blockedBy?: string[]      // ids de issues que lo bloquean
  createdAt: number
  updatedAt: number
  order: number             // para ordenar dentro de una columna
}

export interface Cycle {
  id: string
  name: string
  startDate?: string
  endDate?: string
  goal?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  issues: Issue[]
  cycles: Cycle[]
  createdAt: number
  updatedAt: number
}

const KEY = (userId: string) => `projects:${userId}`

// ── Almacén ───────────────────────────────────────────────────────────────

async function load(userId: string): Promise<Project[]> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: KEY(userId) } })
    if (!row?.value) return []
    const arr = JSON.parse(row.value)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function save(userId: string, projects: Project[]): Promise<void> {
  await db.dayaSystemConfig.upsert({
    where: { key: KEY(userId) },
    update: { value: JSON.stringify(projects.slice(0, 50)) },
    create: { key: KEY(userId), value: JSON.stringify(projects) },
  })
}

function genId(p: string): string {
  return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ── CRUD de proyectos ──────────────────────────────────────────────────────

export async function listProjects(userId: string): Promise<Project[]> {
  return load(userId)
}

export async function getProject(userId: string, id: string): Promise<Project | null> {
  return (await load(userId)).find(p => p.id === id) || null
}

export async function createProject(userId: string, name: string, description?: string): Promise<Project> {
  const projects = await load(userId)
  const project: Project = {
    id: genId('prj'), name: name.slice(0, 120), description: description?.slice(0, 1000),
    issues: [], cycles: [], createdAt: Date.now(), updatedAt: Date.now(),
  }
  projects.unshift(project)
  await save(userId, projects)
  return project
}

export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const projects = await load(userId)
  const next = projects.filter(p => p.id !== id)
  if (next.length === projects.length) return false
  await save(userId, next)
  return true
}

// ── CRUD de issues ──────────────────────────────────────────────────────────

async function mutateProject(userId: string, projectId: string, fn: (p: Project) => void): Promise<Project | null> {
  const projects = await load(userId)
  const p = projects.find(x => x.id === projectId)
  if (!p) return null
  fn(p)
  p.updatedAt = Date.now()
  await save(userId, projects)
  return p
}

export async function addIssue(
  userId: string, projectId: string,
  data: Partial<Issue> & { title: string }
): Promise<Issue | null> {
  let created: Issue | null = null
  await mutateProject(userId, projectId, (p) => {
    const issue: Issue = {
      id: genId('iss'),
      title: data.title.slice(0, 240),
      description: data.description?.slice(0, 4000),
      state: data.state || 'todo',
      priority: data.priority || 'none',
      labels: (data.labels || []).slice(0, 10),
      assignee: data.assignee,
      dueDate: data.dueDate,
      cycleId: data.cycleId,
      blockedBy: data.blockedBy || [],
      createdAt: Date.now(), updatedAt: Date.now(),
      order: p.issues.length,
    }
    p.issues.push(issue)
    created = issue
  })
  return created
}

export async function updateIssue(
  userId: string, projectId: string, issueId: string, patch: Partial<Issue>
): Promise<Issue | null> {
  let updated: Issue | null = null
  await mutateProject(userId, projectId, (p) => {
    const iss = p.issues.find(i => i.id === issueId)
    if (!iss) return
    Object.assign(iss, {
      ...patch,
      id: iss.id, createdAt: iss.createdAt, updatedAt: Date.now(),
      labels: patch.labels ? patch.labels.slice(0, 10) : iss.labels,
    })
    updated = iss
  })
  return updated
}

export async function deleteIssue(userId: string, projectId: string, issueId: string): Promise<boolean> {
  let ok = false
  await mutateProject(userId, projectId, (p) => {
    const n = p.issues.length
    p.issues = p.issues.filter(i => i.id !== issueId)
    // limpia referencias de bloqueo
    for (const i of p.issues) i.blockedBy = (i.blockedBy || []).filter(b => b !== issueId)
    ok = p.issues.length < n
  })
  return ok
}

// ── Ciclos (sprints) ────────────────────────────────────────────────────────

export async function addCycle(userId: string, projectId: string, data: Partial<Cycle> & { name: string }): Promise<Cycle | null> {
  let created: Cycle | null = null
  await mutateProject(userId, projectId, (p) => {
    const cycle: Cycle = { id: genId('cyc'), name: data.name.slice(0, 120), startDate: data.startDate, endDate: data.endDate, goal: data.goal?.slice(0, 500) }
    p.cycles.push(cycle)
    created = cycle
  })
  return created
}

// ── Progreso / métricas ──────────────────────────────────────────────────────

export interface ProjectProgress {
  total: number
  byState: Record<IssueState, number>
  byPriority: Record<IssuePriority, number>
  completionPct: number
  overdue: number
  blocked: number
}

export function computeProgress(project: Project): ProjectProgress {
  const byState: Record<IssueState, number> = { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 }
  const byPriority: Record<IssuePriority, number> = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 }
  const now = Date.now()
  let overdue = 0, blocked = 0
  for (const i of project.issues) {
    byState[i.state] = (byState[i.state] || 0) + 1
    byPriority[i.priority] = (byPriority[i.priority] || 0) + 1
    if (i.dueDate && i.state !== 'done' && i.state !== 'cancelled' && Date.parse(i.dueDate) < now) overdue++
    if ((i.blockedBy || []).some(bid => {
      const blocker = project.issues.find(x => x.id === bid)
      return blocker && blocker.state !== 'done' && blocker.state !== 'cancelled'
    })) blocked++
  }
  const active = project.issues.filter(i => i.state !== 'cancelled').length
  const done = byState.done
  const completionPct = active ? Math.round((done / active) * 100) : 0
  return { total: project.issues.length, byState, byPriority, completionPct, overdue, blocked }
}

// ──────────────────────────────────────────────────────────────────────────
// (OPCIONAL, futuro con Claude Code) Modelos Prisma dedicados:
//
// model Project {
//   id String @id @default(uuid())
//   userId String
//   name String
//   description String @default("")
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   issues Issue[]
//   cycles Cycle[]
//   @@index([userId])
// }
// model Issue {
//   id String @id @default(uuid())
//   projectId String
//   title String
//   description String @default("")
//   state String @default("todo")
//   priority String @default("none")
//   labels String[] @default([])
//   assignee String?
//   dueDate DateTime?
//   cycleId String?
//   blockedBy String[] @default([])
//   order Int @default(0)
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   @@index([projectId])
// }
// model Cycle {
//   id String @id @default(uuid())
//   projectId String
//   name String
//   startDate DateTime?
//   endDate DateTime?
//   goal String @default("")
// }
// ──────────────────────────────────────────────────────────────────────────
