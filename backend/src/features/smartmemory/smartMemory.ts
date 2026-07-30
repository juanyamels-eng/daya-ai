// ============================================
// DAYA IA — Smart Memory (intelligent memory resolution)
// --------------------------------------------------------------------------
// Inspired by mem0 (Apache-2.0): instead of ACCUMULATING everything learned,
// when a new fact arrives it decides which OPERATION to apply by comparing it
// with what is already known:
//
//   • ADD    → new fact, unrelated → save
//   • UPDATE → contradicts/updates an existing one → replace
//   • DELETE → old fact is no longer valid → delete
//   • NONE   → already known → do nothing (avoids duplicates)
//
// This turns memory from a "growing heap" into a "coherent, up-to-date state".
// Complements services/memory.ts (does NOT replace it): it hooks into the
// save step to resolve conflicts. Uses your embeddings to find related
// memories. Own TypeScript code (idea from mem0, without copying its code).
// ============================================

import { prisma } from '../../lib/prisma'
import { chatJSON } from '../../services/openrouter'
import { embedText, cosineSimilarity, isEmbeddingConfigured } from '../../services/embeddings'
import { tokenize } from '../../utils/nlp'

const db = prisma as any

// ── Types ─────────────────────────────────────────────────────────────────

interface MemoryRow {
  id: string
  content: string
  category: string
  embedding: number[]
}

export type Operation = 'ADD' | 'UPDATE' | 'DELETE' | 'NONE'

export interface ResolutionDecision {
  operation: Operation
  fact: string                 // el hecho candidato
  category: string
  targetId?: string            // id del recuerdo a actualizar/borrar (UPDATE/DELETE)
  reason?: string
}

export interface ResolveResult {
  added: number
  updated: number
  deleted: number
  skipped: number
  decisions: ResolutionDecision[]
}

// ── Fetch related memories (to give context for the decision) ────────────────

async function relatedMemories(userId: string, factVector: number[], fact: string, k = 6): Promise<MemoryRow[]> {
  const all: MemoryRow[] = await db.memory.findMany({
    where: { userId },
    select: { id: true, content: true, category: true, embedding: true },
    take: 500,
  }).catch(() => [])

  if (!all.length) return []

  // If there are embeddings, sort by similarity; otherwise, by word overlap.
  if (factVector.length && isEmbeddingConfigured()) {
    return all
      .filter(m => Array.isArray(m.embedding) && m.embedding.length)
      .map(m => ({ m, sim: cosineSimilarity(factVector, m.embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, k)
      .map(x => x.m)
  }
  // Lexical fallback
  const ft = new Set(tokenize(fact))
  return all
    .map(m => ({ m, score: overlap(ft, new Set(tokenize(m.content))) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(x => x.m)
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0; for (const t of a) if (b.has(t)) n++; return n
}

// ── AI Decision: ADD/UPDATE/DELETE/NONE? ─────────────────────────────────────

const RESOLVE_SYS = `Eres el gestor de memoria de un asistente. Dado un HECHO NUEVO sobre el usuario y una lista de RECUERDOS EXISTENTES relacionados, decides UNA operación:
- ADD: el hecho es nuevo y no está cubierto por ningún recuerdo existente.
- UPDATE: el hecho actualiza o CONTRADICE un recuerdo existente (p. ej. cambió de trabajo, de ciudad, de preferencia). Indica cuál.
- DELETE: el hecho implica que un recuerdo existente ya NO es válido y no hay reemplazo.
- NONE: el hecho ya está cubierto por un recuerdo existente; no aporta nada nuevo.
Eres conservador: ante la duda entre ADD y UPDATE, elige UPDATE si hay un recuerdo del mismo tema. Respondes SOLO en JSON.`

async function decide(fact: string, related: MemoryRow[]): Promise<{ operation: Operation; targetId?: string; category?: string; reason?: string }> {
  if (!related.length) return { operation: 'ADD' }
  try {
    const list = related.map((m, i) => `${i + 1}. [id:${m.id}] (${m.category}) ${m.content}`).join('\n')
    const parsed = await chatJSON(
      `HECHO NUEVO: "${fact}"\n\nRECUERDOS EXISTENTES relacionados:\n${list}\n\n` +
      `Decide la operación. Responde SOLO con JSON:\n` +
      `{ "operation": "ADD|UPDATE|DELETE|NONE", "targetId": "id del recuerdo afectado si UPDATE/DELETE, o ''", "category": "categoría sugerida", "reason": "breve" }`,
      RESOLVE_SYS
    )
    const op = String(parsed?.operation || 'ADD').toUpperCase() as Operation
    if (!['ADD', 'UPDATE', 'DELETE', 'NONE'].includes(op)) return { operation: 'ADD' }
    // Verify targetId exists among related memories (security).
    const targetId = parsed?.targetId && related.some(m => m.id === parsed.targetId) ? parsed.targetId : undefined
    if ((op === 'UPDATE' || op === 'DELETE') && !targetId) return { operation: 'ADD' } // no valid target → treat as new
    return { operation: op, targetId, category: parsed?.category, reason: parsed?.reason }
  } catch {
    return { operation: 'ADD' } // on error, safe behavior = add
  }
}

// ── Apply the decision to the database ────────────────────────────────────────

async function applyDecision(userId: string, fact: string, category: string, d: { operation: Operation; targetId?: string }): Promise<void> {
  switch (d.operation) {
    case 'ADD': {
      const embedding = await embedText(fact).catch(() => [] as number[])
      await db.memory.create({ data: { userId, content: fact, category, embedding } })
      break
    }
    case 'UPDATE': {
      const embedding = await embedText(fact).catch(() => [] as number[])
      // Updates the target memory with the new fact (replacement).
      await db.memory.update({ where: { id: d.targetId }, data: { content: fact, category, embedding } }).catch(async () => {
        // if update fails (e.g. deleted), add as new
        await db.memory.create({ data: { userId, content: fact, category, embedding } })
      })
      break
    }
    case 'DELETE': {
      await db.memory.delete({ where: { id: d.targetId } }).catch(() => {})
      break
    }
    case 'NONE':
    default:
      break
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Processes a list of CANDIDATE FACTS (already extracted from dialogue) resolving
 * each one against existing memory. Returns a summary of operations.
 *
 * Intended to be called AFTER extracting facts (instead of blindly saving them),
 * or from an endpoint to process loose text.
 */
const SENSITIVE = /(contrase[ñn]|password|passwd|\bpin\b|tarjeta|cvv|cvc|\btoken\b|api[_\s-]?key|secreto|secret|\bssn\b|\bdni\b|n[uú]mero\s+de\s+(documento|identidad|tarjeta)|mi\s+(contrase[ñn]|tarjeta|pin|clave)|\b\d{13,19}\b)/i

export async function resolveFacts(userId: string, facts: { content: string; category?: string }[]): Promise<ResolveResult> {
  const result: ResolveResult = { added: 0, updated: 0, deleted: 0, skipped: 0, decisions: [] }

  for (const f of facts) {
    const fact = (f.content || '').trim()
    if (fact.length < 4) continue
    if (SENSITIVE.test(fact)) continue
    const category = f.category || 'general'

    const vec = await embedText(fact).catch(() => [] as number[])
    const related = await relatedMemories(userId, vec, fact)
    const d = await decide(fact, related)

    await applyDecision(userId, fact, d.category || category, d)

    if (d.operation === 'ADD') result.added++
    else if (d.operation === 'UPDATE') result.updated++
    else if (d.operation === 'DELETE') result.deleted++
    else result.skipped++

    result.decisions.push({
      operation: d.operation, fact, category: d.category || category,
      targetId: d.targetId, reason: d.reason,
    })
  }
  return result
}

/**
 * Extracts facts from an exchange AND resolves them intelligently. It is the
 * "smart" replacement for blind saving: can be called alongside (or instead of)
 * extractMemories when you want conflict resolution.
 */
export async function smartRemember(userId: string, userMessage: string, aiResponse: string): Promise<ResolveResult> {
  let facts: { content: string; category?: string }[] = []
  try {
    const parsed = await chatJSON(
      `Extract DURABLE and relevant facts about the user from this exchange (not ephemeral things). \n\nUser: "${userMessage.slice(0, 1500)}"\nAssistant: "${aiResponse.slice(0, 800)}"\n\nReply ONLY with JSON: { "facts": [ { "content": "third-person fact, concise", "category": "work|personal|preferences|projects|interests|goals|general" } ] }\nIf there are no durable facts, return an empty list.`,
      'You extract durable facts about the user for a long-term memory. Concise and faithful. You reply ONLY in JSON.'
    )
    facts = Array.isArray(parsed?.facts) ? parsed.facts.filter((f: any) => f?.content) : []
  } catch {
    facts = []
  }
  if (!facts.length) return { added: 0, updated: 0, deleted: 0, skipped: 0, decisions: [] }
  return resolveFacts(userId, facts)
}
