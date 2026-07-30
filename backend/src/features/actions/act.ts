// ============================================
// DAYA IA — act (acción por lenguaje natural, cacheable)
// --------------------------------------------------------------------------
// Primitiva tipo Stagehand `act()` pero sin navegador: describes en lenguaje
// natural QUÉ quieres lograr, y la IA produce una SECUENCIA de pasos usando un
// conjunto de "herramientas" deterministas que tú registras. Esa secuencia se
// CACHEA, así que repetir la misma intención no vuelve a llamar a la IA — y si
// una herramienta cambia su contrato y falla, se re-planifica (self-healing).
//
// Esto le da a DAYA "acciones reutilizables": la primera vez aprende el cómo,
// luego lo repite gratis. Las herramientas pueden envolver features existentes
// (oracle, searchrank, etc.), de modo que act se convierte en un orquestador
// barato y repetible por encima de ellas.
// ============================================

import { runAction, ActionDef, Plan } from './actionEngine'
import { chatJSON } from '../../services/openrouter'

// Una herramienta determinista que `act` puede encadenar.
export interface ActTool {
  name: string
  description: string            // qué hace (la IA la lee para planificar)
  // Ejecuta la herramienta. `args` salen del plan; `vars` es el bus de datos
  // compartido entre pasos (cada paso puede leer/escribir resultados previos).
  run: (args: Record<string, any>, vars: Record<string, any>) => Promise<any> | any
}

// Un paso del plan: qué herramienta usar, con qué args, y dónde guardar su salida.
interface ActStep {
  tool: string
  args: Record<string, any>
  saveAs?: string                // nombre en `vars` para reutilizar después
}

interface ActPlan extends Plan {
  steps: ActStep[]
}

interface ActInput {
  goal: string
  toolDescriptions: { name: string; description: string }[]
  initialVars: Record<string, any>
}

export interface ActResult {
  ok: boolean
  vars?: Record<string, any>     // bus de datos final (resultados de los pasos)
  steps?: { tool: string; ok: boolean }[]
  error?: string
  usedAI: boolean
  fromCache: boolean
  healed: boolean
}

// Construye la acción "act" sobre un registro de herramientas dado.
function buildActAction(tools: Map<string, ActTool>): ActionDef<ActInput, { vars: Record<string, any>; steps: { tool: string; ok: boolean }[] }> {
  return {
    name: 'act',
    intent: 'Planificar y ejecutar una secuencia de pasos para lograr un objetivo.',
    ttlMs: 7 * 24 * 60 * 60 * 1000,

    // PLANNER (IA): traduce el objetivo en una secuencia de pasos con herramientas.
    planner: async (_intent, sample) => {
      const toolList = sample.toolDescriptions.map(t => `- ${t.name}: ${t.description}`).join('\n')
      const parsed = await chatJSON(
        `Objetivo: "${sample.goal}"\n\nHerramientas disponibles:\n${toolList}\n\n` +
        `Diseña una secuencia mínima de pasos para lograr el objetivo. Cada paso usa una herramienta con sus args. ` +
        `Puedes referenciar la salida de un paso previo con "{{nombre}}" si lo guardaste con saveAs.\n\n` +
        `Responde SOLO con JSON:\n` +
        `{ "steps": [ { "tool": "nombre", "args": { }, "saveAs": "opcional" } ] }`,
        'Eres un planificador de acciones. Produces secuencias mínimas y correctas usando solo las herramientas dadas. Respondes SOLO en JSON.'
      )
      const steps = Array.isArray(parsed?.steps) ? parsed.steps : []
      return { plan: { steps } as ActPlan }
    },

    // EXECUTOR (sin IA): corre los pasos en orden, pasando datos entre ellos.
    executor: async (plan: Plan, input: ActInput) => {
      const p = plan as ActPlan
      if (!p.steps?.length) throw new Error('Plan vacío.')
      const vars: Record<string, any> = { ...input.initialVars }
      const trace: { tool: string; ok: boolean }[] = []

      for (const step of p.steps) {
        const tool = tools.get(step.tool)
        if (!tool) throw new Error(`Herramienta desconocida en el plan: ${step.tool}`) // → self-healing
        // Resuelve referencias "{{var}}" en los args con el bus de datos.
        const args = resolveRefs(step.args || {}, vars)
        const result = await tool.run(args, vars)
        if (step.saveAs) vars[step.saveAs] = result
        trace.push({ tool: step.tool, ok: true })
      }
      return { vars, steps: trace }
    },

    verifier: (output) => output != null && Array.isArray(output.steps) && output.steps.length > 0,
  }
}

// Sustituye "{{nombre}}" en los args por el valor correspondiente del bus.
function resolveRefs(args: Record<string, any>, vars: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string') {
      const m = v.match(/^\{\{(\w+)\}\}$/)
      out[k] = m ? vars[m[1]] : v.replace(/\{\{(\w+)\}\}/g, (_, n) => String(vars[n] ?? ''))
    } else {
      out[k] = v
    }
  }
  return out
}

/**
 * Ejecuta una acción descrita en lenguaje natural usando un set de herramientas.
 * La secuencia se cachea por `goal` (clave), así repetir el objetivo no usa IA.
 */
export async function act(
  goal: string,
  tools: ActTool[],
  opts: { initialVars?: Record<string, any>; forceReplan?: boolean; cacheKey?: string } = {}
): Promise<ActResult> {
  const registry = new Map(tools.map(t => [t.name, t]))
  const def = buildActAction(registry)
  const input: ActInput = {
    goal,
    toolDescriptions: tools.map(t => ({ name: t.name, description: t.description })),
    initialVars: opts.initialVars || {},
  }
  // Clave de caché: por objetivo (normalizado) salvo override.
  const cacheKey = opts.cacheKey || goal.toLowerCase().replace(/\s+/g, '_').slice(0, 80)
  const run = await runAction(def, input, { cacheKey, forceReplan: !!opts.forceReplan })

  if (!run.ok) return { ok: false, error: run.error, usedAI: run.usedAI, fromCache: run.fromCache, healed: run.healed }
  return {
    ok: true,
    vars: run.output?.vars,
    steps: run.output?.steps,
    usedAI: run.usedAI,
    fromCache: run.fromCache,
    healed: run.healed,
  }
}
