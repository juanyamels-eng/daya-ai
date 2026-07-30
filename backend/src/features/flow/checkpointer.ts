// ============================================
// DAYA IA — Checkpointer (ejecución durable)
// --------------------------------------------------------------------------
// Guarda el estado de una ejecución de workflow para que pueda:
//   • Sobrevivir a un reinicio del servidor y RETOMAR donde quedó.
//   • Pausar por una interrupción (human-in-the-loop) y REANUDAR luego.
//
// Persistencia SIN migraciones: usa DayaSystemConfig (modelo existente) con
// clave `flowrun:<runId>`. Al final del archivo está el modelo Prisma dedicado
// (comentado) por si prefieres una tabla formal más adelante.
//
// La idea de "checkpoints para ejecución durable" viene de LangGraph (MIT);
// implementación propia.
// ============================================

import { prisma } from '../../lib/prisma'

const db = prisma as any

export type RunStatus = 'running' | 'interrupted' | 'done' | 'error' | 'max_steps'

export interface Checkpoint<S = any> {
  runId: string
  userId: string
  graph: string              // nombre del grafo/flujo
  status: RunStatus
  state: S                   // estado actual del workflow
  nextNode?: string          // dónde retomar
  interrupt?: { node: string; payload: any }
  trace: { node: string; at: number; durationMs: number; patchKeys: string[] }[]
  error?: string
  createdAt: number
  updatedAt: number
}

const KEY = (runId: string) => `flowrun:${runId}`

export function newRunId(): string {
  return 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

export async function saveCheckpoint(cp: Checkpoint): Promise<void> {
  cp.updatedAt = Date.now()
  await db.dayaSystemConfig.upsert({
    where: { key: KEY(cp.runId) },
    update: { value: JSON.stringify(cp) },
    create: { key: KEY(cp.runId), value: JSON.stringify(cp) },
  })
}

export async function loadCheckpoint<S = any>(runId: string, userId: string): Promise<Checkpoint<S> | null> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: KEY(runId) } })
    if (!row?.value) return null
    const cp = JSON.parse(row.value) as Checkpoint<S>
    if (cp.userId !== userId) return null // aislamiento por usuario
    return cp
  } catch {
    return null
  }
}

export async function deleteCheckpoint(runId: string): Promise<void> {
  await db.dayaSystemConfig.delete({ where: { key: KEY(runId) } }).catch(() => {})
}

/** Lista las ejecuciones de un usuario (escaneo acotado por índice opcional). */
const INDEX_KEY = (userId: string) => `flowruns_idx:${userId}`

export async function indexRun(userId: string, runId: string): Promise<void> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: INDEX_KEY(userId) } })
    const list: string[] = row?.value ? JSON.parse(row.value) : []
    if (!list.includes(runId)) {
      list.unshift(runId)
      await db.dayaSystemConfig.upsert({
        where: { key: INDEX_KEY(userId) },
        update: { value: JSON.stringify(list.slice(0, 100)) },
        create: { key: INDEX_KEY(userId), value: JSON.stringify([runId]) },
      })
    }
  } catch { /* índice best-effort */ }
}

export async function listRuns(userId: string): Promise<Checkpoint[]> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: INDEX_KEY(userId) } })
    const ids: string[] = row?.value ? JSON.parse(row.value) : []
    const out: Checkpoint[] = []
    for (const id of ids.slice(0, 50)) {
      const cp = await loadCheckpoint(id, userId)
      if (cp) out.push(cp)
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

// ──────────────────────────────────────────────────────────────────────────
// (OPCIONAL, futuro) Tabla Prisma dedicada en vez de JSON en DayaSystemConfig:
//
// model FlowRun {
//   id         String   @id            // runId
//   userId     String
//   graph      String
//   status     String
//   state      Json
//   nextNode   String?
//   interrupt  Json?
//   trace      Json     @default("[]")
//   error      String?
//   createdAt  DateTime @default(now())
//   updatedAt  DateTime @updatedAt
//   @@index([userId])
// }
// ──────────────────────────────────────────────────────────────────────────
