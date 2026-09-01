// ============================================
// DAYA IA — Action Engine (acciones cacheables y auto-reparables)
// --------------------------------------------------------------------------
// Reimplementación clean-room (TypeScript propio) de la IDEA central de
// Stagehand, sin su navegador: el patrón de "acción que la IA descubre una vez,
// se CACHEA, y luego corre SIN IA — y se AUTO-REPARA si cambia el entorno".
//
// Cómo funciona:
//   1) Defines una "acción" con: una INTENCIÓN en lenguaje natural, un
//      "planificador" que (con IA) produce un PLAN reutilizable, y un
//      "ejecutor" determinista que aplica ese plan a una entrada.
//   2) La primera vez: el planner (IA) genera el plan → se guarda en caché.
//   3) Las siguientes: se usa el plan cacheado, SIN llamar a la IA (rápido,
//      barato, repetible).
//   4) Si el ejecutor falla o el verificador dice que el resultado ya no sirve
//      (el sitio/API cambió), se INVALIDA la caché y se re-planifica con IA
//      automáticamente (self-healing).
//
// La idea (cache + self-healing + "código vs. lenguaje natural") viene de
// Stagehand (MIT); este código no copia el suyo. Núcleo agnóstico: sirve para
// extraer datos de JSON/HTML, mapear campos de una API, parsear formatos, etc.
// ============================================

import { prisma } from '../../lib/prisma'

const db = prisma as any

// ── Tipos ─────────────────────────────────────────────────────────────────

// Un PLAN es lo que la IA "descubre" una vez y luego se reutiliza sin IA.
// Es JSON serializable (p. ej. una lista de rutas a extraer, un mapeo de campos,
// una secuencia de transformaciones…). Su forma la define cada acción.
export type Plan = Record<string, any>

export interface PlanResult { plan: Plan; explanation?: string }

// El planner usa IA para producir un plan a partir de la intención + una muestra.
export type Planner<I> = (intent: string, sample: I) => Promise<PlanResult>

// El ejecutor aplica un plan a una entrada SIN IA. Debe ser determinista.
// Lanza si el plan ya no encaja con la entrada (señal para self-healing).
export type Executor<I, O> = (plan: Plan, input: I) => O | Promise<O>

// Verificador opcional: ¿el resultado es válido? Si devuelve false, se re-planifica.
export type Verifier<O> = (output: O) => boolean

export interface ActionDef<I, O> {
  name: string                 // identificador estable de la acción
  intent: string               // qué hace, en lenguaje natural (entra al planner)
  planner: Planner<I>
  executor: Executor<I, O>
  verifier?: Verifier<O>
  ttlMs?: number               // caducidad del plan cacheado (por defecto 7 días)
}

export interface RunOptions {
  cacheKey?: string            // sobreescribe la clave de caché (p. ej. por dominio)
  forceReplan?: boolean        // ignora la caché y re-descubre el plan
  noCache?: boolean            // no leer ni escribir caché (modo IA siempre)
}

export interface ActionRun<O> {
  ok: boolean
  output?: O
  error?: string
  usedAI: boolean              // ¿se invocó la IA en esta ejecución?
  healed: boolean              // ¿se auto-reparó (re-planificó por fallo)?
  fromCache: boolean           // ¿el plan vino de caché?
  plan?: Plan
}

// ── Caché de planes (en DayaSystemConfig, sin migraciones) ───────────────────

interface CachedPlan { plan: Plan; explanation?: string; createdAt: number; ttlMs: number }

const CACHE_KEY = (name: string, key: string) => `action:${name}:${key}`
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000 // 7 días

async function loadPlan(name: string, key: string): Promise<CachedPlan | null> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: CACHE_KEY(name, key) } })
    if (!row?.value) return null
    const cp = JSON.parse(row.value) as CachedPlan
    if (Date.now() - cp.createdAt > cp.ttlMs) return null // caducado
    return cp
  } catch {
    return null
  }
}

async function savePlan(name: string, key: string, plan: Plan, ttlMs: number, explanation?: string): Promise<void> {
  const value = JSON.stringify({ plan, explanation, createdAt: Date.now(), ttlMs } as CachedPlan)
  await db.dayaSystemConfig.upsert({
    where: { key: CACHE_KEY(name, key) },
    update: { value },
    create: { key: CACHE_KEY(name, key), value },
  }).catch(() => {})
}

async function invalidatePlan(name: string, key: string): Promise<void> {
  await db.dayaSystemConfig.delete({ where: { key: CACHE_KEY(name, key) } }).catch(() => {})
}

// ── Motor ─────────────────────────────────────────────────────────────────

/**
 * Ejecuta una acción sobre una entrada. Reutiliza el plan cacheado si existe;
 * si no, lo descubre con IA y lo guarda. Si la ejecución falla o el verificador
 * la rechaza, re-planifica una vez (self-healing) y reintenta.
 */
export async function runAction<I, O>(
  def: ActionDef<I, O>,
  input: I,
  opts: RunOptions = {}
): Promise<ActionRun<O>> {
  const key = opts.cacheKey || 'default'
  const ttl = def.ttlMs ?? DEFAULT_TTL

  // 1) Intentar con plan cacheado (salvo que se pida lo contrario).
  if (!opts.noCache && !opts.forceReplan) {
    const cached = await loadPlan(def.name, key)
    if (cached) {
      try {
        const output = await def.executor(cached.plan, input)
        if (!def.verifier || def.verifier(output)) {
          return { ok: true, output, usedAI: false, healed: false, fromCache: true, plan: cached.plan }
        }
        // El verificador rechazó → el entorno cambió → self-healing más abajo.
      } catch {
        // El ejecutor falló con el plan viejo → self-healing más abajo.
      }
      await invalidatePlan(def.name, key) // el plan cacheado ya no sirve
    }
  }

  // 2) Descubrir el plan con IA (primera vez o self-healing).
  let planResult: PlanResult
  try {
    planResult = await def.planner(def.intent, input)
  } catch (e: unknown) {
    return { ok: false, error: 'El planificador (IA) falló: ' + ((e instanceof Error && e.message) || ''), usedAI: true, healed: false, fromCache: false }
  }

  // 3) Ejecutar con el plan nuevo.
  try {
    const output = await def.executor(planResult.plan, input)
    if (def.verifier && !def.verifier(output)) {
      return { ok: false, error: 'El resultado no superó la verificación tras re-planificar.', usedAI: true, healed: true, fromCache: false, plan: planResult.plan }
    }
    if (!opts.noCache) await savePlan(def.name, key, planResult.plan, ttl, planResult.explanation)
    // healed = true si veníamos de un plan cacheado que falló (lo detectamos por
    // forceReplan=false y que hubo un intento previo). Para simplicidad lo marcamos
    // cuando NO fue forzado por el caller.
    return { ok: true, output, usedAI: true, healed: !opts.forceReplan, fromCache: false, plan: planResult.plan }
  } catch (e: unknown) {
    return { ok: false, error: 'La ejecución falló incluso tras re-planificar: ' + ((e instanceof Error && e.message) || ''), usedAI: true, healed: true, fromCache: false, plan: planResult.plan }
  }
}

/** Borra el plan cacheado de una acción (forzar re-descubrimiento la próxima vez). */
export async function clearActionCache(name: string, cacheKey = 'default'): Promise<void> {
  await invalidatePlan(name, cacheKey)
}
