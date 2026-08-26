// ============================================
// DAYA IA — Structured Outputs: Zod validation wrapper
// Enforces typed, validated JSON from LLM responses.
// Wraps chatJSON() with schema validation + one-shot repair.
// ============================================
import { z } from 'zod'
import { chatJSON } from './openrouter'

export interface StructuredResult<T> {
  data: T
  raw: string
  repaired: boolean
}

export async function structuredCall<T extends z.ZodType>(
  schema: T,
  prompt: string,
  systemPrompt?: string,
  modelOverride?: string,
  maxTokens = 4000,
): Promise<StructuredResult<T>> {
  const raw = await chatJSON(prompt, systemPrompt, modelOverride, maxTokens)
  const parsed = typeof raw === 'string' ? raw : JSON.stringify(raw)
  const json = typeof raw === 'object' ? raw : (() => { try { return JSON.parse(raw) } catch { return raw } })()

  const result = schema.safeParse(json)
  if (result.success) return { data: result.data, raw: parsed, repaired: false }

  const repairPrompt = `El siguiente JSON no cumple el esquema requerido.
Errores de validación:\n${result.error.message}\n\nJSON original:\n${parsed.slice(0, 4000)}\n\nRepara el JSON para que cumpla EXACTAMENTE el esquema. Responde SOLO con el JSON reparado, sin texto adicional.`

  const repairedRaw = await chatJSON(repairPrompt, systemPrompt, modelOverride, maxTokens)
  const repairedJson = typeof repairedRaw === 'object' ? repairedRaw : (() => { try { return JSON.parse(repairedRaw) } catch { return repairedRaw } })()
  const repairedParsed = typeof repairedRaw === 'string' ? repairedRaw : JSON.stringify(repairedRaw)

  const repairedResult = schema.safeParse(repairedJson)
  if (repairedResult.success) return { data: repairedResult.data, raw: repairedParsed, repaired: true }

  throw new Error(`Structured output failed after repair: ${repairedResult.error.message}`)
}

// ── Predefined schemas for the orchestrator and tools ──

export const ToolCallSchema = z.object({
  action: z.enum(['tool', 'answer', 'evaluate']),
  name: z.string().optional(),
  args: z.record(z.unknown()).optional(),
  content: z.string().optional(),
  verdict: z.enum(['done', 'needs_more', 'failed']).optional(),
  reason: z.string().optional(),
})

export type ToolCallDecision = z.infer<typeof ToolCallSchema>

export const PlanStepSchema = z.object({
  tool: z.string(),
  description: z.string().optional(),
  args: z.record(z.unknown()).optional(),
  saveAs: z.string().optional(),
})

export const PlanSchema = z.object({
  steps: z.array(PlanStepSchema),
  reasoning: z.string().optional(),
})

export type Plan = z.infer<typeof PlanSchema>

export const EvaluationSchema = z.object({
  verdict: z.enum(['done', 'needs_more', 'failed']),
  reason: z.string(),
  answer: z.string().optional(),
})

export type Evaluation = z.infer<typeof EvaluationSchema>

export const EntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
})

export const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),
  description: z.string().optional(),
  weight: z.number().optional(),
})

export const GraphExtractionSchema = z.object({
  entities: z.array(EntitySchema),
  relations: z.array(RelationSchema),
})

export type GraphExtraction = z.infer<typeof GraphExtractionSchema>
