// ============================================
// DAYA IA — Deep Research v2 (iterativo, con registro de tareas)
// --------------------------------------------------------------------------
// Capacidad NUEVA de DAYA, escrita desde cero en TypeScript.
//
// Mejora sobre services/deepResearch.ts (que ya existe y NO se toca):
//   1) Ciclo LLM-en-el-bucle: el modelo PLANIFICA → busca → LEE → decide si
//      le falta algo → vuelve a buscar, hasta cubrir el tema o agotar rondas.
//   2) Re-ranking de fuentes (usa features/searchrank) para leer las mejores.
//   3) Registro de tareas en memoria: una investigación corre en segundo plano,
//      sobrevive a un refresh de página y se puede CANCELAR o consultar estado.
//   4) Eventos de progreso para streaming a la UI (planning/searching/reading/
//      writing/done/error).
//
// Investigación iterativa con registro de tareas cancelable.
// ============================================

import { chatJSON } from '../../services/openrouter'
import { searchAndRank, RankedResult } from '../searchrank/ranking'
import { domainOf } from '../../utils/url'
import { readPageText } from '../readurl/route'
import { prisma } from '../../lib/prisma'

// ── Tipos ─────────────────────────────────────────────────────────────────

export type ResearchPhase =
  | 'queued' | 'planning' | 'searching' | 'reading' | 'writing' | 'done' | 'error' | 'cancelled'

export interface ResearchProgress {
  phase: ResearchPhase
  message: string
  round?: number
  totalRounds?: number
  sourcesFound?: number
}

export interface ResearchSource {
  title: string
  url: string
  score?: number
}

export interface ResearchReport {
  title: string
  markdown: string
  sources: ResearchSource[]
}

// Entrada del registro de tareas (una por investigación en curso)
interface TaskEntry {
  id: string
  userId: string
  topic: string
  phase: ResearchPhase
  progress: ResearchProgress[]
  result?: ResearchReport
  error?: string
  cancel: boolean
  createdAt: number
  updatedAt: number
}

export interface ResearchOptions {
  rounds?: number               // rondas de búsqueda (2..5), por defecto 3
  model?: string                // modelo para redactar (por defecto el premium del chat)
  maxSourcesRead?: number       // tope de fuentes que se mandan al redactor
  maxSeconds?: number           // tiempo máximo total (por defecto 180s)
  onProgress?: (p: ResearchProgress) => void
  plan?: 'FREE' | 'PRO'        // plan del usuario (FREE por defecto)
}

// ── Registro de tareas en memoria ──────────────────────────────────────────
// Map simple: id → tarea. Se autolimpia: las tareas terminadas se borran a la
// hora. (Si en el futuro quieres persistencia entre reinicios, este es el único
// punto a cambiar — la lógica de research no depende de dónde se guarde.)
const tasks = new Map<string, TaskEntry>()

function gcTasks() {
  const now = Date.now()
  for (const [id, t] of tasks) {
    const terminal = t.phase === 'done' || t.phase === 'error' || t.phase === 'cancelled'
    if (terminal && now - t.updatedAt > 60 * 60 * 1000) tasks.delete(id)
  }
}

function newId(): string {
  return 'res_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function setProgress(task: TaskEntry, p: ResearchProgress, onProgress?: (p: ResearchProgress) => void) {
  task.phase = p.phase
  task.progress.push(p)
  task.updatedAt = Date.now()
  if (onProgress) { try { onProgress(p) } catch { /* la UI no debe romper el motor */ } }
}

// ── Núcleo del motor ────────────────────────────────────────────────────────

const PLANNER_SYS = `Eres un estratega de investigación. Dado un tema, generas un PLAN de búsqueda: entre 4 y 6 sub-consultas web, cortas y específicas, que cubran ángulos distintos (datos/estadísticas, contexto actual, ejemplos o casos, perspectivas opuestas, marco regulatorio si aplica). Respondes SOLO en JSON.`

const GAP_SYS = `Eres un investigador meticuloso. A partir del CONTENIDO ya recopilado, detectas qué ángulos, datos o evidencia FALTAN para un informe completo y propones nuevas búsquedas. No repitas lo ya cubierto. Respondes SOLO en JSON.`

// Lee el texto completo de las N mejores fuentes. Best-effort: las que fallen
// se saltan. Devuelve las enriquecidas con contenido real.
async function extractTopSources(sources: RankedResult[], maxRead: number): Promise<RankedResult[]> {
  const out: RankedResult[] = []
  for (const s of sources) {
    if (out.length >= maxRead) break
    try {
      const page = await readPageText(s.url)
      if ('text' in page && page.text.length > 200) {
        out.push({ ...s, content: page.text.slice(0, 6000) })
        continue
      }
    } catch { /* fuente no accesible */ }
    // fallback: lo que ya traía el search
    if ((s.content || '').length > 100) out.push(s)
  }
  return out
}

// Costo estimado de cada llamada al modelo (en dólares). Suficiente para
// presupuestar: el coste real puede variar ±20%.
const COST_ESTIMATES = {
  plannerChat: 0.005,   // chatJSON barato para planificar
  gapChat: 0.003,       // gap detection, chat pequeño
  writerChat: 0.05,     // escritura del informe (modelo fuerte, tokens largos)
  searchCall: 0.001,    // cada búsqueda web
  readCall: 0.001,      // cada lectura de URL
} as const

// Límite de coste por plan. FREE no puede pasar de $0.15 por investigación;
// PRO tiene $0.60 por investigación.
const PLAN_BUDGET = { FREE: 0.15, PRO: 0.60 } as const

const WRITER_SYS = `Eres un analista de investigación senior. Produces informes ejecutivos extensos, rigurosos y bien estructurados, basados ESTRICTAMENTE en las fuentes dadas.
REGLAS:
- Escribe en español, prosa profesional y fluida (sin emojis).
- Estructura: ## Resumen ejecutivo, varias ## secciones temáticas con análisis profundo (3-4 párrafos c/u), y ## Conclusiones.
- Cita las fuentes como [Fuente N] dentro del texto donde uses su información.
- No inventes datos que no estén en las fuentes; si algo no aparece, dilo.
- Responde SOLO en JSON válido.`

async function planQueries(topic: string): Promise<string[]> {
  try {
    const parsed = await chatJSON(
      `Tema: "${topic}"\n\nGenera entre 4 y 6 sub-consultas de búsqueda web en español. Responde SOLO con JSON: { "queries": ["...", "..."] }`,
      PLANNER_SYS
    )
    const qs = Array.isArray(parsed?.queries) ? parsed.queries : []
    const clean = qs.filter((q: any) => typeof q === 'string' && q.trim()).map((q: string) => q.trim())
    const unique = Array.from(new Set([topic, ...clean]))
    return unique.length >= 2 ? unique.slice(0, 6) : [topic, `${topic} datos recientes`, `${topic} análisis`]
  } catch {
    return [topic, `${topic} datos estadísticas recientes`, `${topic} análisis tendencias`]
  }
}

async function findGaps(topic: string, found: RankedResult[]): Promise<string[]> {
  try {
    const snippets = found.slice(0, 12).map((s, i) =>
      `${i + 1}. ${s.title}\n   ${(s.content || '').slice(0, 600)}`
    ).join('\n')
    const parsed = await chatJSON(
      `Tema: "${topic}"\n\nContenido recopilado hasta ahora:\n${snippets}\n\n¿Qué ángulos, datos o contraejemplos faltan? Propón entre 2 y 4 búsquedas nuevas. Responde SOLO con: {"queries": ["...","..."]}`,
      GAP_SYS
    )
    const qs = Array.isArray(parsed?.queries) ? parsed.queries : []
    return qs.filter((q: any) => typeof q === 'string' && q.trim()).map((q: string) => q.trim()).slice(0, 4)
  } catch {
    return []
  }
}

// ── Costo estimado ─────────────────────────────────────────────────────────
// Lleva la cuenta acumulada en USD. Cuando se supera el presupuesto del plan,
// la investigación se aborta con un mensaje claro.
class CostTracker {
  private spent = 0
  readonly budget: number

  constructor(plan: 'FREE' | 'PRO') {
    this.budget = PLAN_BUDGET[plan]
  }

  add(cents: number) { this.spent += cents }
  get spentUSD() { return this.spent }
  overBudget() { return this.spent >= this.budget }
}

// Ejecuta TODA la investigación.
async function execute(
  topic: string,
  opts: ResearchOptions,
  shouldCancel: () => boolean,
  emit: (p: ResearchProgress) => void,
  cost: CostTracker
): Promise<ResearchReport> {
  const rounds = Math.max(2, Math.min(opts.rounds ?? 3, 5))
  const maxRead = Math.max(5, Math.min(opts.maxSourcesRead ?? 12, 20))
  const deadline = Date.now() + Math.max(60, Math.min(opts.maxSeconds ?? 180, 600)) * 1000

  const stop = () => shouldCancel() || Date.now() > deadline || cost.overBudget()
  const stopMsg = () => cost.overBudget()
    ? `Presupuesto de ${cost.budget.toFixed(2)} USD agotado. Acorta el tema o reduce las rondas.`
    : '__CANCELLED__'

  const seen = new Set<string>()
  const all: RankedResult[] = []
  const add = (batch: RankedResult[]) => {
    for (const r of batch) {
      if (r.url && !seen.has(r.url)) { seen.add(r.url); all.push(r) }
    }
  }

  // Ronda 1: planificar y buscar
  emit({ phase: 'planning', message: 'Planeando la investigación…', round: 1, totalRounds: rounds })
  if (stop()) throw new Error(stopMsg())
  cost.add(COST_ESTIMATES.plannerChat)
  const queries = await planQueries(topic)

  emit({ phase: 'searching', message: `Buscando ${queries.length} líneas de investigación…`, round: 1, totalRounds: rounds })
  for (const q of queries) {
    if (stop()) throw new Error(stopMsg())
    cost.add(COST_ESTIMATES.searchCall)
    add(await searchAndRank(q, 6).catch(() => []))
  }
  emit({ phase: 'searching', message: `${all.length} fuentes encontradas.`, round: 1, totalRounds: rounds, sourcesFound: all.length })

  // Extraer contenido real de las mejores fuentes para gap detection + redacción
  emit({ phase: 'reading', message: 'Leyendo las mejores fuentes…', round: 1, totalRounds: rounds })
  cost.add(COST_ESTIMATES.readCall * Math.min(all.length, maxRead))
  const enriched = await extractTopSources(all, maxRead)

  // Rondas 2..N: detectar huecos con contenido REAL y completar
  for (let round = 2; round <= rounds; round++) {
    if (stop()) break
    if (enriched.length === 0) break
    emit({ phase: 'reading', message: `Analizando y buscando lo que falta (ronda ${round})…`, round, totalRounds: rounds, sourcesFound: enriched.length })
    cost.add(COST_ESTIMATES.gapChat)
    const gaps = await findGaps(topic, enriched)
    if (!gaps.length) break
    for (const q of gaps) {
      if (stop()) break
      cost.add(COST_ESTIMATES.searchCall)
      add(await searchAndRank(q, 4).catch(() => []))
    }
    // Enriquecer las fuentes nuevas que llegaron
    const newOnes = all.filter(r => !enriched.find(e => e.url === r.url))
    if (newOnes.length > 0) {
      cost.add(COST_ESTIMATES.readCall * Math.min(newOnes.length, 3))
      const fresh = await extractTopSources(newOnes, Math.max(3, maxRead - enriched.length))
      enriched.push(...fresh)
    }
  }

  if (enriched.length === 0) {
    throw new Error(stopMsg())
  }

  // Selección final: ordena por score y diversidad de dominios (máx. 3 por dominio)
  const byScore = enriched.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
  const perDomain = new Map<string, number>()
  const diverse: RankedResult[] = []
  for (const r of byScore) {
    const d = domainOf(r.url)
    const n = perDomain.get(d) || 0
    if (n >= 3) continue
    perDomain.set(d, n + 1)
    diverse.push(r)
    if (diverse.length >= 6) break
  }
  if (diverse.length < 4) {
    for (const r of byScore) {
      if (diverse.includes(r)) continue
      diverse.push(r)
      if (diverse.length >= 6) break
    }
  }
  const used = diverse

  // Redacción final
  if (stop()) throw new Error(stopMsg())
  emit({ phase: 'writing', message: 'Redactando el informe final…', sourcesFound: used.length })

  const corpus = used
    .map((s, i) => `[Fuente ${i + 1}] ${s.title}\nURL: ${s.url}\n${(s.content || '').slice(0, 6000)}`)
    .join('\n\n---\n\n')

  cost.add(COST_ESTIMATES.writerChat)
  const parsed = await chatJSON(
    `Tema de investigación: "${topic}"\n\nFuentes recopiladas:\n${corpus}\n\nGenera un informe profundo basado en estas fuentes. Responde SOLO con JSON:\n{\n  "title": "título ejecutivo y específico",\n  "content": "informe en markdown con ## Resumen ejecutivo, varias ## secciones temáticas (3-4 párrafos c/u) y ## Conclusiones. Cita [Fuente N]. Mínimo 800 palabras."\n}`,
    WRITER_SYS,
    opts.model,
    8000
  )

  const biblio = used.map((s, i) => `${i + 1}. ${s.title}. Disponible en: ${s.url}`).join('\n\n')
  const markdown = `${parsed.content || ''}\n\n## Bibliografía\n\n${biblio}`

  return {
    title: String(parsed.title) || `Informe: ${topic}`,
    markdown,
    sources: used.map(s => ({ title: s.title, url: s.url, score: s.score })),
  }
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Investigación SÍNCRONA (espera el informe). Buena para llamadas directas o
 * para el agente. Para la UI con barra de progreso usa startResearch + SSE.
 */
export async function runResearch(topic: string, opts: ResearchOptions = {}): Promise<ResearchReport> {
  const cost = new CostTracker(opts.plan || 'FREE')
  return execute(topic, opts, () => false, opts.onProgress || (() => {}), cost)
}

/**
 * Arranca una investigación en SEGUNDO PLANO y devuelve su id de inmediato.
 * El cliente consulta el estado con getResearch(id) o puede cancelarla con
 * cancelResearch(id). Sobrevive a refrescos de página porque el estado vive
 * en el registro del servidor, no en la conexión del cliente.
 */
export function startResearch(userId: string, topic: string, opts: ResearchOptions = {}): TaskEntry {
  gcTasks()
  const id = newId()
  const task: TaskEntry = {
    id, userId, topic,
    phase: 'queued',
    progress: [{ phase: 'queued', message: 'En cola…' }],
    cancel: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  tasks.set(id, task)

  // Lee el plan del usuario y lo inyecta en opts (best-effort: si falla, FREE)
  ;(async () => {
    let plan: 'FREE' | 'PRO' = 'FREE'
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
      plan = user?.plan === 'PRO' ? 'PRO' : 'FREE'
    } catch { /* plan por defecto = FREE */ }
    const optsWithPlan = { ...opts, plan }
    const cost = new CostTracker(plan)

    try {
      const report = await execute(
        topic,
        optsWithPlan,
        () => task.cancel,
        (p) => setProgress(task, p, opts.onProgress),
        cost
      )
      task.result = report
      setProgress(task, { phase: 'done', message: 'Investigación completada.' }, opts.onProgress)
    } catch (e) {
      if ((e instanceof Error ? e.message : String(e)) === '__CANCELLED__' || task.cancel) {
        setProgress(task, { phase: 'cancelled', message: 'Investigación cancelada.' }, opts.onProgress)
      } else {
        task.error = e instanceof Error ? e.message : 'La investigación falló.'
        setProgress(task, { phase: 'error', message: task.error! }, opts.onProgress)
      }
    }
  })()

  return task
}

// Devuelve el estado actual de una tarea (sin exponer flags internos).
export function getResearch(userId: string, id: string) {
  const t = tasks.get(id)
  if (!t || t.userId !== userId) return null
  return {
    id: t.id,
    topic: t.topic,
    phase: t.phase,
    progress: t.progress,
    result: t.result,
    error: t.error,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

// Marca una tarea para cancelación. El bucle la detiene en el siguiente chequeo.
export function cancelResearch(userId: string, id: string): boolean {
  const t = tasks.get(id)
  if (!t || t.userId !== userId) return false
  if (t.phase === 'done' || t.phase === 'error' || t.phase === 'cancelled') return false
  t.cancel = true
  t.updatedAt = Date.now()
  return true
}

// Lista las tareas de un usuario (para reconstruir la UI tras un refresh).
export function listResearch(userId: string) {
  gcTasks()
  return [...tasks.values()]
    .filter(t => t.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(t => ({ id: t.id, topic: t.topic, phase: t.phase, updatedAt: t.updatedAt }))
}
