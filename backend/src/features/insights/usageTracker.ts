// ============================================
// DAYA IA — Insights (usage & cost observability)
// --------------------------------------------------------------------------
// New DAYA-native capability: provides transparency on WHICH model was used,
// HOW MANY tokens and HOW MUCH it cost (estimated). Almost no consumer AI shows
// this — it builds trust ("used a cheap model for this, you saved") and helps
// YOU see where spending goes.
//
// How it works: you log each LLM call with a lightweight helper
// (trackUsage). Records are stored aggregated by day in DayaSystemConfig
// (no migrations). Queries return totals by model, by day, and an
// estimated cost based on a configurable price table.
//
// Cost estimation: uses approximate public OpenRouter prices per 1M
// tokens. These are ESTIMATES (prices change); good for magnitude and trend,
// not for exact billing.
// ============================================

import { prisma } from '../../lib/prisma'

const db = prisma as any

// ── Price table (USD per 1M tokens) — ESTIMATED, adjustable ──────────────────
// Maps OpenRouter model ID → { input, output }.
// If a model is not listed, a conservative default price is used.
// Prices READ ONE BY ONE from OpenRouter's live catalog (26-jul-2026), not
// estimated: this table feeds the per-user cost in the Insights panel, so
// an invented number here hides exactly what we need to monitor. Only
// Chinese models: these are the only ones Daya uses.
const PRICES: Record<string, { in: number; out: number }> = {
  // DeepSeek
  'deepseek/deepseek-v4-flash': { in: 0.14, out: 0.28 },
  'deepseek/deepseek-v4-pro': { in: 0.43, out: 0.87 },
  'deepseek/deepseek-v3.2': { in: 0.27, out: 0.40 },
  'deepseek/deepseek-r1-0528': { in: 0.50, out: 2.15 },
  // Qwen (Alibaba)
  'qwen/qwen3-vl-32b-instruct': { in: 0.10, out: 0.42 },
  'qwen/qwen3.7-plus': { in: 0.32, out: 1.28 },
  'qwen/qwen3.5-plus-02-15': { in: 0.26, out: 1.56 },
  'qwen/qwen3-coder-next': { in: 0.11, out: 0.80 },
  'qwen/qwen3-coder': { in: 0.30, out: 1.00 },
  'qwen/qwen3-vl-235b-a22b-instruct': { in: 0.21, out: 1.90 },
  'qwen/qwen3-max': { in: 0.78, out: 3.90 },
  'qwen/qwen3-max-thinking': { in: 0.78, out: 3.90 },
  'qwen/qwen3.7-max': { in: 1.48, out: 4.42 },
  // GLM (Z.ai)
  'z-ai/glm-4.7-flash': { in: 0.06, out: 0.40 },
  'z-ai/glm-4.5-air': { in: 0.13, out: 0.85 },
  'z-ai/glm-4.7': { in: 0.40, out: 1.75 },
  'z-ai/glm-4.6': { in: 0.50, out: 2.00 },
  'z-ai/glm-5.2': { in: 0.67, out: 2.10 },
  'z-ai/glm-5.1': { in: 0.97, out: 3.04 },
  // Kimi (Moonshot)
  'moonshotai/kimi-k2.6': { in: 0.65, out: 2.72 },
  'moonshotai/kimi-k2.7-code': { in: 0.73, out: 3.50 },
  'moonshotai/kimi-k3': { in: 3.00, out: 15.00 },
  // MiniMax
  'minimax/minimax-m3': { in: 0.30, out: 1.20 },
}
const DEFAULT_PRICE = { in: 1, out: 3 }

function priceFor(model: string): { in: number; out: number } {
  return PRICES[model] || DEFAULT_PRICE
}

// Estima el costo en USD de una llamada.
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model)
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out
}

// Estimación de tokens cuando el proveedor no los reporta (~4 chars/token).
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4)
}

// ── Usage recording ──────────────────────────────────────────────────────────

interface DayUsage {
  date: string                          // YYYY-MM-DD
  calls: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }>
  byFeature: Record<string, { calls: number; costUsd: number }>
}

const KEY = (userId: string, date: string) => `usage:${userId}:${date}`
const INDEX = (userId: string) => `usage_days:${userId}`

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function loadDay(userId: string, date: string): Promise<DayUsage> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: KEY(userId, date) } })
    if (row?.value) return JSON.parse(row.value)
  } catch { /* nada */ }
  return { date, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: {}, byFeature: {} }
}

async function saveDay(userId: string, day: DayUsage): Promise<void> {
  await db.dayaSystemConfig.upsert({
    where: { key: KEY(userId, day.date) },
    update: { value: JSON.stringify(day) },
    create: { key: KEY(userId, day.date), value: JSON.stringify(day) },
  })
  // Index of days with data (to list without scanning).
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: INDEX(userId) } })
    const days: string[] = row?.value ? JSON.parse(row.value) : []
    if (!days.includes(day.date)) {
      days.unshift(day.date)
      await db.dayaSystemConfig.upsert({
        where: { key: INDEX(userId) },
        update: { value: JSON.stringify(days.slice(0, 120)) },
        create: { key: INDEX(userId), value: JSON.stringify([day.date]) },
      })
    }
  } catch { /* best-effort index */ }
}

export interface TrackInput {
  userId: string
  model: string               // ID de modelo de OpenRouter
  inputTokens?: number
  outputTokens?: number
  inputText?: string          // si no hay tokens, se estima desde el texto
  outputText?: string
  feature?: string            // qué parte de DAYA hizo la llamada (chat, research...)
}

/**
 * Registra una llamada al LLM. Llámalo tras cada respuesta (no bloquea: si falla,
 * no afecta la respuesta al usuario). Devuelve el costo estimado de esa llamada.
 */
export async function trackUsage(input: TrackInput): Promise<number> {
  try {
    const inTok = input.inputTokens ?? estimateTokens(input.inputText || '')
    const outTok = input.outputTokens ?? estimateTokens(input.outputText || '')
    const cost = estimateCost(input.model, inTok, outTok)
    const feature = input.feature || 'general'

    const day = await loadDay(input.userId, today())
    day.calls++
    day.inputTokens += inTok
    day.outputTokens += outTok
    day.costUsd += cost

    const m = day.byModel[input.model] || { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
    m.calls++; m.inputTokens += inTok; m.outputTokens += outTok; m.costUsd += cost
    day.byModel[input.model] = m

    const f = day.byFeature[feature] || { calls: 0, costUsd: 0 }
    f.calls++; f.costUsd += cost
    day.byFeature[feature] = f

    await saveDay(input.userId, day)
    return cost
  } catch {
    return 0
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface UsageSummary {
  rangeDays: number
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number }
  byModel: Record<string, { calls: number; costUsd: number }>
  byFeature: Record<string, { calls: number; costUsd: number }>
  daily: { date: string; calls: number; costUsd: number }[]
}

/** Resumen de uso de los últimos `days` días. */
export async function getUsageSummary(userId: string, days = 30): Promise<UsageSummary> {
  let dates: string[] = []
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: INDEX(userId) } })
    dates = row?.value ? JSON.parse(row.value) : []
  } catch { /* nada */ }
  dates = dates.slice(0, days)

  const summary: UsageSummary = {
    rangeDays: days,
    totals: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    byModel: {}, byFeature: {}, daily: [],
  }

  for (const date of dates) {
    const d = await loadDay(userId, date)
    summary.totals.calls += d.calls
    summary.totals.inputTokens += d.inputTokens
    summary.totals.outputTokens += d.outputTokens
    summary.totals.costUsd += d.costUsd
    for (const [model, v] of Object.entries(d.byModel)) {
      const cur = summary.byModel[model] || { calls: 0, costUsd: 0 }
      cur.calls += v.calls; cur.costUsd += v.costUsd
      summary.byModel[model] = cur
    }
    for (const [feat, v] of Object.entries(d.byFeature)) {
      const cur = summary.byFeature[feat] || { calls: 0, costUsd: 0 }
      cur.calls += v.calls; cur.costUsd += v.costUsd
      summary.byFeature[feat] = cur
    }
    summary.daily.push({ date: d.date, calls: d.calls, costUsd: Math.round(d.costUsd * 10000) / 10000 })
  }
  summary.daily.sort((a, b) => a.date.localeCompare(b.date))
  summary.totals.costUsd = Math.round(summary.totals.costUsd * 10000) / 10000
  return summary
}

/** Friendly message to show the user after a response (transparency). */
export function friendlyCostNote(model: string, cost: number): string {
  const name = model.split('/').pop() || model
  if (cost < 0.001) return `Respondido con ${name} · costo mínimo`
  return `Respondido con ${name} · ~$${cost.toFixed(4)}`
}
