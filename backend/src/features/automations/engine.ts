// ============================================
// DAYA IA — Motor de automatizaciones (recetas)
// --------------------------------------------------------------------------
// Una RECETA es: un TRIGGER + una secuencia de ACTIONS. Cuando el trigger pasa,
// las acciones se ejecutan en orden, pasándose datos por un "bus" compartido.
// Estilo Zapier/Activepieces, pero sobre las piezas de DAYA.
//
// El "cuándo" de las recetas programadas lo dispara el worker (runDueAutomations),
// que ya corre cada minuto. Sin migraciones: recetas y registros de ejecución se
// guardan en DayaSystemConfig (JSON por usuario).
// ============================================

import { prisma } from '../../lib/prisma'
import {
  getTrigger, getAction, resolveConfig, Bus, PieceCtx,
} from './pieces'
import { loadConfig, saveConfig } from '../../services/configStore'

const db = prisma as any

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface RecipeStep {
  actionId: string
  config: Record<string, any>
}

export interface Recipe {
  id: string
  name: string
  enabled: boolean
  trigger: { triggerId: string; config: Record<string, any> }
  steps: RecipeStep[]
  intervalMin?: number        // para triggers programados (mín 5)
  lastRun: number
  createdAt: number
  runCount: number
}

export interface RunRecord {
  recipeId: string
  at: number
  ok: boolean
  steps: { actionId: string; ok: boolean; error?: string }[]
  triggered: boolean
}

const RKEY = (u: string) => `automations:${u}`
const LOGKEY = (u: string) => `automation_logs:${u}`
const IDX = 'automations:active_users'

// ── Almacén ───────────────────────────────────────────────────────────────

const loadRecipes = (userId: string): Promise<Recipe[]> => loadConfig<Recipe>(RKEY(userId))
const saveRecipes = (userId: string, recipes: Recipe[]) => saveConfig(RKEY(userId), recipes.slice(0, 100))

async function pushLog(userId: string, rec: RunRecord): Promise<void> {
  try {
    const logs = await loadConfig<RunRecord>(LOGKEY(userId))
    logs.unshift(rec)
    await saveConfig(LOGKEY(userId), logs.slice(0, 100))
  } catch { /* logs best-effort */ }
}
async function registerActiveUser(userId: string): Promise<void> {
  try {
    const set = await loadConfig<string>(IDX)
    if (!set.includes(userId)) await saveConfig(IDX, [...set, userId])
  } catch { /* nada */ }
}

function genId(): string { return 'rcp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function listRecipes(userId: string): Promise<Recipe[]> { return loadRecipes(userId) }
export const getLogs = (userId: string): Promise<RunRecord[]> => loadConfig<RunRecord>(LOGKEY(userId))

export async function createRecipe(userId: string, input: Partial<Recipe> & { name: string; trigger: Recipe['trigger']; steps: RecipeStep[] }): Promise<Recipe | { error: string }> {
  // Validación: trigger y acciones deben existir en el catálogo.
  if (!getTrigger(input.trigger.triggerId)) return { error: `Trigger desconocido: ${input.trigger.triggerId}` }
  for (const s of input.steps) if (!getAction(s.actionId)) return { error: `Acción desconocida: ${s.actionId}` }

  const recipes = await loadRecipes(userId)
  const recipe: Recipe = {
    id: genId(),
    name: input.name.slice(0, 120),
    enabled: input.enabled !== false,
    trigger: input.trigger,
    steps: input.steps.slice(0, 20),
    intervalMin: input.intervalMin ? Math.max(5, Math.min(input.intervalMin, 1440)) : undefined,
    lastRun: 0, createdAt: Date.now(), runCount: 0,
  }
  recipes.unshift(recipe)
  await saveRecipes(userId, recipes)
  await registerActiveUser(userId)
  return recipe
}

export async function toggleRecipe(userId: string, id: string, enabled: boolean): Promise<boolean> {
  const recipes = await loadRecipes(userId)
  const r = recipes.find(x => x.id === id)
  if (!r) return false
  r.enabled = enabled
  await saveRecipes(userId, recipes)
  return true
}

export async function updateRecipe(userId: string, id: string, patch: Partial<Pick<Recipe, 'name' | 'enabled' | 'trigger' | 'steps' | 'intervalMin'>>): Promise<boolean> {
  const recipes = await loadRecipes(userId)
  const r = recipes.find(x => x.id === id)
  if (!r) return false
  if (patch.name !== undefined) r.name = patch.name.slice(0, 120)
  if (patch.enabled !== undefined) r.enabled = patch.enabled
  if (patch.trigger !== undefined) r.trigger = patch.trigger
  if (patch.steps !== undefined) r.steps = patch.steps.slice(0, 20)
  if (patch.intervalMin !== undefined) r.intervalMin = Math.max(5, Math.min(patch.intervalMin, 1440))
  await saveRecipes(userId, recipes)
  return true
}

export async function deleteRecipe(userId: string, id: string): Promise<boolean> {
  const recipes = await loadRecipes(userId)
  const next = recipes.filter(x => x.id !== id)
  if (next.length === recipes.length) return false
  await saveRecipes(userId, next)
  return true
}

// ── Ejecución ─────────────────────────────────────────────────────────────

/**
 * Ejecuta una receta: evalúa el trigger; si pasa, corre las acciones en orden.
 * `force` salta la evaluación del trigger (para "ejecutar ahora" manual).
 */
export async function runRecipe(userId: string, recipe: Recipe, force = false): Promise<RunRecord> {
  const bus: Bus = {}
  const ctx: PieceCtx = { userId, bus }
  const record: RunRecord = { recipeId: recipe.id, at: Date.now(), ok: true, steps: [], triggered: false }

  // 1) Trigger
  const trigger = getTrigger(recipe.trigger.triggerId)
  if (!trigger) { record.ok = false; return record }
  let initial: Bus | null = { manual: true }
  if (!force) {
    try { initial = await trigger.evaluate(recipe.trigger.config || {}, ctx) }
    catch { initial = null }
  }
  if (!initial) { record.triggered = false; return record } // el trigger no pasó: no se ejecuta
  record.triggered = true
  Object.assign(bus, initial)

  // 2) Acciones encadenadas
  for (const step of recipe.steps) {
    const action = getAction(step.actionId)
    if (!action) { record.steps.push({ actionId: step.actionId, ok: false, error: 'acción no encontrada' }); record.ok = false; continue }
    try {
      const cfg = resolveConfig(step.config || {}, bus)  // resuelve {{variables}}
      const out = await action.run(cfg, ctx)
      Object.assign(bus, out)                            // el resultado entra al bus
      record.steps.push({ actionId: step.actionId, ok: true })
    } catch (e: unknown) {
      record.steps.push({ actionId: step.actionId, ok: false, error: (e instanceof Error && e.message) || 'error' })
      record.ok = false
      // No abortamos: las siguientes acciones pueden no depender de esta.
    }
  }
  return record
}

/** Ejecuta una receta a mano (force=true) y deja log. */
export async function runRecipeNow(userId: string, id: string): Promise<RunRecord | { error: string }> {
  const recipes = await loadRecipes(userId)
  const r = recipes.find(x => x.id === id)
  if (!r) return { error: 'Receta no encontrada.' }
  const record = await runRecipe(userId, r, true)
  r.lastRun = Date.now(); r.runCount++
  await saveRecipes(userId, recipes)
  await pushLog(userId, record)
  return record
}

/**
 * Llamada por el worker cada minuto: corre las recetas PROGRAMADAS cuyo intervalo
 * ya venció. Aísla errores por receta. Devuelve cuántas ejecutó.
 */
export async function runDueAutomations(): Promise<{ ran: number }> {
  let ran = 0
  let users: string[] = []
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: IDX } })
    users = row?.value ? JSON.parse(row.value) : []
  } catch { return { ran: 0 } }

  const now = Date.now()
  for (const userId of users) {
    let recipes: Recipe[]
    try { recipes = await loadRecipes(userId) } catch { continue }
    let mutated = false
    for (const r of recipes) {
      if (!r.enabled) continue
      // Solo recetas con trigger programado o de evento que el worker revisa.
      const isScheduled = r.trigger.triggerId === 'schedule' || r.intervalMin
      const isEvent = ['new_email', 'task_due_soon'].includes(r.trigger.triggerId)
      if (!isScheduled && !isEvent) continue
      const interval = (r.intervalMin || 15) * 60 * 1000
      if (now - r.lastRun < interval) continue
      try {
        const record = await runRecipe(userId, r, false)
        if (record.triggered) { await pushLog(userId, record); ran++ }
      } catch { /* aislado */ }
      r.lastRun = now; r.runCount++
      mutated = true
    }
    if (mutated) await saveRecipes(userId, recipes).catch(() => {})
  }
  return { ran }
}
