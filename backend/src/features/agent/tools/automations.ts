import { DayaTool } from './types'
import getClient, { MODELS } from '../../../services/openrouter'
import { listPieces } from '../../automations/pieces'
import { createRecipe, listRecipes, toggleRecipe, runRecipeNow } from '../../automations/engine'

// Catálogo de triggers/actions en texto, para que el modelo planifique la receta.
function piecesCatalog(): string {
  const { triggers, actions } = listPieces()
  const t = triggers.map(x => `- ${x.id} (trigger): ${x.description}`).join('\n')
  const a = actions.map(x => `- ${x.id} (action): ${x.description}`).join('\n')
  return `TRIGGERS:\n${t}\n\nACTIONS:\n${a}`
}

function summarizeRecipes(recipes: { id: string; name: string; enabled: boolean; runCount: number; lastRun: number }[]): string {
  if (!recipes.length) return 'No tienes automatizaciones creadas todavía.'
  return recipes.map(r => {
    const state = r.enabled ? 'activa' : 'pausada'
    const runs = r.runCount ? ` · ${r.runCount} ejecución(es)` : ''
    return `· ${r.name} [${r.id}] — ${state}${runs}`
  }).join('\n')
}

export const createAutomation: DayaTool = {
  name: 'crear_automatizacion',
  description: 'Crea una AUTOMATIZACIÓN (receta estilo Zapier) a partir de una petición en lenguaje natural: p. ej. "cada mañana búscame noticias de IA y guárdalas como nota". Tú decides el trigger (schedule/manual/task_due_soon/new_email) y los pasos (web_search, create_note, create_task, deep_research, query_api, ai_generate, notify). Devuelve la automatización creada.',
  parameters: {
    type: 'object',
    properties: {
      descripcion: { type: 'string', description: 'Qué se automatiza, en lenguaje natural. Ej: "cada día a las 8 investiga el precio del bitcoin y guárdalo en una nota"' },
      cuando: { type: 'string', description: 'Cuándo debe ejecutarse (p. ej. "cada mañana", "cada hora", "cuando haya tareas por vencer"). Si no aplica, no lo pongas' },
      trigger: { type: 'string', enum: ['schedule', 'manual', 'task_due_soon', 'new_email'], description: 'Trigger de la automatización (opcional, DAYA elige si no se indica)' },
      intervalo_min: { type: 'number', description: 'Cada cuántos minutos se repite si es programada (mín 5, máx 1440). Opcional' },
    },
    required: ['descripcion'],
  },
  async run(userId, args) {
    const descripcion = String(args?.descripcion || '').trim()
    if (!descripcion) return 'Falta la descripción de la automatización.'

    let triggerId = String(args?.trigger || '')
    if (!['schedule', 'manual', 'task_due_soon', 'new_email'].includes(triggerId)) {
      // Si el usuario dice "cada X…" o una frecuencia, schedule es lo natural; si dice
      // "cuando venza una tarea" → task_due_soon. Lo decide el modelo en el plan.
      triggerId = /cada|diar|horas|minuto|todos los/i.test(`${descripcion} ${args?.cuando || ''}`) ? 'schedule' : 'manual'
    }
    const intervalMin = Number(args?.intervalo_min) || (triggerId === 'schedule' ? 1440 : undefined)

    try {
      const res = await getClient().chat.completions.create({
        model: MODELS.flash,
        messages: [
          { role: 'system', content: `Eres un planificador de automatizaciones. Dada una petición y un catálogo de piezas, diseñas una receta. Responde SOLO con JSON:
{ "name": "nombre corto", "triggerId": "uno de los triggers", "steps": [ { "actionId": "acción", "config": { …campos } } ], "intervalMin": número }.
Elige bien las acciones del catálogo y rellena sus config con la info de la petición.\n\n${piecesCatalog()}` },
          { role: 'user', content: `Petición: "${descripcion}". Cuándo: "${args?.cuando || ''}". Trigger sugerido: ${triggerId}.` },
        ],
        max_tokens: 900,
      })
      const raw = (res.choices?.[0]?.message?.content || '').trim()
      const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim())

      const name = String(parsed.name || descripcion.slice(0, 80))
      const steps: { actionId: string; config: Record<string, any> }[] = Array.isArray(parsed.steps)
        ? parsed.steps.map((s: { actionId: string; config?: Record<string, any> }) => ({ actionId: String(s.actionId), config: s.config || {} }))
        : []
      const finalTrigger = ['schedule', 'manual', 'task_due_soon', 'new_email'].includes(parsed.triggerId) ? parsed.triggerId : triggerId
      const finalInterval = Number(parsed.intervalMin) || intervalMin

      const result = await createRecipe(userId, {
        name,
        trigger: { triggerId: finalTrigger, config: {} },
        steps,
        intervalMin: finalInterval,
      })
      if ('error' in result) return `No pude crear la automatización: ${result.error}`
      const howOften = finalTrigger === 'schedule' ? ` cada ${finalInterval || 1440} min` : ` (trigger ${finalTrigger})`
      return `✓ Automatización creada: "${result.name}" [${result.id}]${howOften}. Pasos: ${steps.map(s => s.actionId).join(' → ')}.`
    } catch (e: unknown) {
      return `No pude crear la automatización: ${(e instanceof Error && e.message) || String(e)}. Verifica que la petición describa una tarea repetible con las piezas disponibles.`
    }
  },
}

export const manageAutomations: DayaTool = {
  name: 'gestionar_automatizaciones',
  description: 'Gestiona las automatizaciones del usuario: las lista, las activa/desactiva o las ejecuta al instante. Úsalo cuando pidan ver, pausar, reanudar o lanzar una automatización.',
  parameters: {
    type: 'object',
    properties: {
      accion: { type: 'string', enum: ['listar', 'activar', 'desactivar', 'ejecutar'], description: 'Qué hacer: listar (ver todas), activar/desactivar (pausar o reanudar), ejecutar (correr ahora mismo)' },
      nombre: { type: 'string', description: 'Nombre de la automatización a gestionar (para activar/desactivar/ejecutar)' },
    },
    required: ['accion'],
  },
  async run(userId, args) {
    const accion = String(args?.accion || '')
    const nombre = String(args?.nombre || '')

    try {
      if (accion === 'listar') {
        return `Tus automatizaciones:\n${summarizeRecipes(await listRecipes(userId))}`
      }

      if (!nombre) return 'Dime el nombre de la automatización para ' + (accion === 'ejecutar' ? 'ejecutarla.' : 'cambiarla.')
      const recipes = await listRecipes(userId)
      const target = recipes.find(r => r.name.toLowerCase().includes(nombre.toLowerCase()))
      if (!target) return `No encontré una automatización llamada "${nombre}".`
      const same = recipes.filter(r => r.name.toLowerCase().includes(nombre.toLowerCase()))

      if (accion === 'ejecutar') {
        const results: string[] = []
        for (const r of same) {
          const rec = await runRecipeNow(userId, r.id)
          results.push('error' in rec
            ? `· "${r.name}": ${rec.error}`
            : `· "${r.name}": ${rec.ok ? 'ejecutada OK' : 'ejecutada con errores'} (${rec.steps.filter(s => s.ok).length}/${rec.steps.length} pasos OK)`)
        }
        return `Ejecución manual:\n${results.join('\n')}`
      }

      const enable = accion === 'activar'
      const results: string[] = []
      for (const r of same) {
        const ok = await toggleRecipe(userId, r.id, enable)
        results.push(`· "${r.name}": ${ok ? (enable ? 'activada' : 'pausada') : 'no se pudo cambiar'}`)
      }
      return results.join('\n')
    } catch (e: unknown) {
      return `Falló al gestionar automatizaciones: ${(e instanceof Error && e.message) || String(e)}`
    }
  },
}
