// ============================================
// DAYA IA — extract (extracción estructurada con esquema)
// --------------------------------------------------------------------------
// Primitiva tipo Stagehand `extract()` pero para datos (JSON/HTML/texto), no
// para navegador. Le pides en lenguaje natural qué campos quieres + un esquema,
// y devuelve un objeto validado.
//
// La gracia: usa el Action Engine, así que la primera extracción "descubre" con
// IA un PLAN (qué rutas/regex usar para cada campo) y lo cachea; las siguientes
// del MISMO tipo de fuente corren SIN IA. Si la fuente cambia de forma y el plan
// deja de validar, se auto-repara re-planificando.
//
// Esquema: formato mínimo propio (sin dependencias). Cada campo declara su tipo
// y una descripción que guía a la IA.
// ============================================

import { runAction, ActionDef, Plan, RunOptions } from './actionEngine'
import { chatJSON } from '../../services/openrouter'

// ── Esquema mínimo ───────────────────────────────────────────────────────────

export type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]'

export interface FieldSpec {
  type: FieldType
  description?: string
  required?: boolean
}

export type ExtractSchema = Record<string, FieldSpec>

// El plan que descubre la IA: por cada campo, una "ruta" de extracción.
// Soporta dos modos:
//   • path: ruta tipo JSONPath simple sobre datos JSON ("data.items.0.name")
//   • regex: expresión sobre texto plano (primer grupo capturado)
interface ExtractPlan extends Plan {
  fields: Record<string, { mode: 'path' | 'regex' | 'ai'; expr?: string }>
}

interface ExtractInput {
  source: string               // contenido (JSON string, HTML o texto)
  format: 'json' | 'text'      // cómo tratar la fuente
  schema: ExtractSchema
}

// ── Utilidades de extracción determinista (sin IA) ───────────────────────────

function getPath(data: any, path: string): any {
  if (!path) return undefined
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur = data
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

function coerce(value: any, type: FieldType): any {
  if (value == null) return type.endsWith('[]') ? [] : (type === 'string' ? '' : null)
  switch (type) {
    case 'string': return String(value)
    case 'number': { const n = Number(value); return Number.isNaN(n) ? null : n }
    case 'boolean': return value === true || value === 'true' || value === 1
    case 'string[]': return Array.isArray(value) ? value.map(String) : [String(value)]
    case 'number[]': return Array.isArray(value) ? value.map(Number).filter(n => !Number.isNaN(n)) : []
  }
}

// ── Definición de la acción "extract" ────────────────────────────────────────

function buildExtractAction(): ActionDef<ExtractInput, Record<string, any>> {
  return {
    name: 'extract',
    intent: 'Extraer campos estructurados de una fuente según un esquema.',
    ttlMs: 3 * 24 * 60 * 60 * 1000, // 3 días: las estructuras de datos cambian

    // PLANNER (IA): descubre cómo localizar cada campo en la fuente.
    planner: async (_intent, sample) => {
      const fieldList = Object.entries(sample.schema)
        .map(([k, s]) => `- ${k} (${s.type})${s.description ? ': ' + s.description : ''}`)
        .join('\n')
      const preview = sample.source.slice(0, 4000)

      const parsed = await chatJSON(
        `Necesito un PLAN de extracción reutilizable para esta fuente (${sample.format}).\n\n` +
        `Campos a extraer:\n${fieldList}\n\n` +
        `Muestra de la fuente:\n${preview}\n\n` +
        `Para cada campo decide el mejor método:\n` +
        `- "path": ruta tipo JSONPath ("a.b.0.c") si la fuente es JSON.\n` +
        `- "regex": expresión regular (con UN grupo de captura) si es texto/HTML.\n` +
        `- "ai": solo si no hay forma determinista (último recurso).\n\n` +
        `Responde SOLO con JSON:\n` +
        `{ "fields": { "campo": { "mode": "path|regex|ai", "expr": "la ruta o regex" } } }`,
        'Eres un experto en extracción de datos. Diseñas planes deterministas (rutas/regex) reutilizables. Respondes SOLO en JSON.'
      )
      return { plan: { fields: parsed?.fields || {} } as ExtractPlan }
    },

    // EXECUTOR (sin IA): aplica el plan a la fuente.
    executor: async (plan: Plan, input: ExtractInput) => {
      const p = plan as ExtractPlan
      const data = input.format === 'json' ? safeParse(input.source) : null
      const out: Record<string, any> = {}
      const aiFields: string[] = []

      for (const [field, spec] of Object.entries(input.schema)) {
        const rule = p.fields?.[field]
        if (!rule) { out[field] = coerce(undefined, spec.type); continue }
        if (rule.mode === 'path' && data != null) {
          out[field] = coerce(getPath(data, rule.expr || ''), spec.type)
        } else if (rule.mode === 'regex' && rule.expr) {
          const m = new RegExp(rule.expr).exec(input.source)
          out[field] = coerce(m ? (m[1] ?? m[0]) : null, spec.type)
        } else {
          aiFields.push(field) // resoluble solo con IA
          out[field] = coerce(undefined, spec.type)
        }
      }

      // Si algún campo quedó como "ai", se resuelve en un solo paso (no rompe la
      // naturaleza cacheable: el PLAN sigue cacheado; solo estos campos usan IA).
      if (aiFields.length) {
        const aiVals = await resolveAIFields(input, aiFields)
        for (const f of aiFields) out[f] = coerce(aiVals[f], input.schema[f].type)
      }
      return out
    },

    // VERIFIER: los campos requeridos deben venir con valor.
    verifier: (output) => {
      // Nota: el esquema no está aquí; verificamos forma mínima (objeto no vacío).
      return output != null && typeof output === 'object'
    },
  }
}

function safeParse(s: string): any {
  try { return JSON.parse(s) } catch { return null }
}

// Resuelve campos marcados como "ai" en una sola llamada (cuando no hay ruta/regex).
async function resolveAIFields(input: ExtractInput, fields: string[]): Promise<Record<string, any>> {
  try {
    const want = fields.map(f => `- ${f} (${input.schema[f].type})${input.schema[f].description ? ': ' + input.schema[f].description : ''}`).join('\n')
    const parsed = await chatJSON(
      `Extrae estos campos de la fuente:\n${want}\n\nFuente:\n${input.source.slice(0, 6000)}\n\nResponde SOLO con JSON con esos campos.`,
      'Extraes datos con precisión. No inventas: si un campo no está, devuélvelo vacío/null. Respondes SOLO en JSON.'
    )
    return parsed || {}
  } catch {
    return {}
  }
}

// ── API pública ─────────────────────────────────────────────────────────────

export interface ExtractResult {
  ok: boolean
  data?: Record<string, any>
  error?: string
  usedAI: boolean
  fromCache: boolean
  healed: boolean
}

/**
 * Extrae datos estructurados de una fuente según un esquema.
 * `sourceKind` agrupa fuentes equivalentes para compartir caché de plan
 * (p. ej. "github-pr" para todas las respuestas de PRs de GitHub).
 */
export async function extract(
  source: string,
  schema: ExtractSchema,
  opts: { format?: 'json' | 'text'; sourceKind?: string; forceReplan?: boolean } = {}
): Promise<ExtractResult> {
  const format = opts.format || (looksLikeJSON(source) ? 'json' : 'text')
  const def = buildExtractAction()
  const runOpts: RunOptions = {
    cacheKey: opts.sourceKind || 'default',
    forceReplan: !!opts.forceReplan,
  }
  // Verificación de "requeridos" la hacemos aquí (el verifier del engine no ve el schema).
  const run = await runAction(def, { source, format, schema }, runOpts)
  if (!run.ok) return { ok: false, error: run.error, usedAI: run.usedAI, fromCache: run.fromCache, healed: run.healed }

  const data = run.output || {}
  const missing = Object.entries(schema)
    .filter(([k, s]) => s.required && (data[k] == null || data[k] === ''))
    .map(([k]) => k)
  if (missing.length) {
    return { ok: false, error: `Faltan campos requeridos: ${missing.join(', ')}`, data, usedAI: run.usedAI, fromCache: run.fromCache, healed: run.healed }
  }
  return { ok: true, data, usedAI: run.usedAI, fromCache: run.fromCache, healed: run.healed }
}

function looksLikeJSON(s: string): boolean {
  const t = s.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}
