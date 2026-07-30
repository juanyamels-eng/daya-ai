// ============================================
// DAYA IA — Ruta: Automations (recetas estilo Zapier) + plantillas
//   GET  /api/automations/pieces                 → catálogo de triggers/actions
//   GET  /api/automations/templates              → recetas listas para usar
//   GET  /api/automations                        → recetas del usuario
//   POST /api/automations         { name, trigger, steps, intervalMin? }
//   PATCH/DELETE /api/automations/:id
//   POST /api/automations/:id/run                → ejecutar ahora (manual)
//   GET  /api/automations/logs                   → últimas ejecuciones
// Todo devuelve JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { listPieces } from './pieces'
import {
  listRecipes, createRecipe, toggleRecipe, updateRecipe, deleteRecipe, runRecipeNow, getLogs,
} from './engine'

const router = Router()
router.use(requireAuth)

// Plantillas: recetas pre-armadas que el usuario puede crear con un clic.
const TEMPLATES = [
  {
    id: 'tpl_daily_news',
    name: 'Resumen de noticias diario',
    description: 'Cada día investiga un tema y te lo guarda como nota.',
    intervalMin: 1440,
    trigger: { triggerId: 'schedule', config: {} },
    steps: [
      { actionId: 'deep_research', config: { topic: 'novedades en inteligencia artificial' } },
      { actionId: 'create_note', config: { title: '📰 {{researchTitle}}', content: '{{researchMarkdown}}' } },
    ],
  },
  {
    id: 'tpl_task_reminder',
    name: 'Aviso de tareas por vencer',
    description: 'Cuando una tarea está por vencer, te deja una notificación.',
    intervalMin: 60,
    trigger: { triggerId: 'task_due_soon', config: {} },
    steps: [
      { actionId: 'notify', config: { message: 'Tienes {{dueCount}} tarea(s) por vencer: {{dueTasks}}' } },
    ],
  },
  {
    id: 'tpl_crypto_watch',
    name: 'Precio de cripto a nota',
    description: 'Consulta el precio de Bitcoin y lo guarda como nota.',
    intervalMin: 360,
    trigger: { triggerId: 'schedule', config: {} },
    steps: [
      { actionId: 'query_api', config: { connector: 'crypto', arg: 'bitcoin' } },
      { actionId: 'create_note', config: { title: '₿ Precio Bitcoin', content: '{{apiResult}}' } },
    ],
  },
]

router.get('/pieces', (_req: Request, res: Response) => {
  res.json(listPieces())
})

router.get('/templates', (_req: Request, res: Response) => {
  res.json({ templates: TEMPLATES })
})

router.get('/', async (req: Request, res: Response) => {
  res.json({ recipes: await listRecipes((req as any).userId) })
})

router.post('/', async (req: Request, res: Response) => {
  const { name, trigger, steps, intervalMin, enabled } = req.body || {}
  if (!name || !trigger?.triggerId || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'Faltan name, trigger.triggerId y steps[].' })
  }
  const result = await createRecipe((req as any).userId, { name, trigger, steps, intervalMin, enabled })
  if ('error' in result) return res.status(400).json(result)
  res.json({ recipe: result })
})

router.patch('/:id', async (req: Request, res: Response) => {
  const { enabled, name, trigger, steps, intervalMin } = req.body || {}
  const uid = (req as any).userId
  // Si solo viene `enabled`, usamos toggleRecipe; si hay más campos, updateRecipe.
  if (name !== undefined || trigger !== undefined || steps !== undefined || intervalMin !== undefined) {
    const ok = await updateRecipe(uid, req.params.id, { name, enabled, trigger, steps, intervalMin })
    return res.json({ ok })
  }
  const ok = await toggleRecipe(uid, req.params.id, enabled !== false)
  res.json({ ok })
})

router.delete('/:id', async (req: Request, res: Response) => {
  res.json({ deleted: await deleteRecipe((req as any).userId, req.params.id) })
})

router.post('/:id/run', async (req: Request, res: Response) => {
  const result = await runRecipeNow((req as any).userId, req.params.id)
  if ('error' in result) return res.status(404).json(result)
  res.json({ run: result })
})

router.get('/logs', async (req: Request, res: Response) => {
  const raw = await getLogs((req as any).userId)
  const recipes = await listRecipes((req as any).userId)
  const nameMap: Record<string, string> = {}
  recipes.forEach(r => { nameMap[r.id] = r.name })
  const logs = raw.map((r: any) => {
    const failedStep = (r.steps || []).find((s: any) => !s.ok)
    const output = (r.steps || []).filter((s: any) => s.ok).map((s: any) => s.actionId).join(', ')
    return {
      recipeId: r.recipeId,
      recipeName: nameMap[r.recipeId] || r.recipeId,
      status: r.ok ? 'ok' : 'error',
      ts: r.at || Date.now(),
      output: output || undefined,
      error: failedStep ? `${failedStep.actionId}: ${failedStep.error || 'error'}` : undefined,
    }
  })
  res.json({ logs })
})

export default router
