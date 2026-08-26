import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del configStore en memoria (evita Prisma en tests del motor)
const memStore = new Map<string, string>()
vi.mock('../services/configStore', () => ({
  loadConfig: vi.fn(async (key: string) => {
    const raw = memStore.get(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  }),
  saveConfig: vi.fn(async (key: string, items: unknown[]) => {
    memStore.set(key, JSON.stringify(items))
  }),
  loadConfigObj: vi.fn(async (key: string) => {
    const raw = memStore.get(key)
    return raw ? JSON.parse(raw) : null
  }),
  saveConfigObj: vi.fn(async (key: string, obj: unknown) => {
    memStore.set(key, JSON.stringify(obj))
  }),
}))

vi.mock('../../lib/prisma', () => ({
  prisma: { dayaSystemConfig: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

import {
  createRecipe,
  listRecipes,
  toggleRecipe,
  updateRecipe,
  deleteRecipe,
  runRecipe,
  runRecipeNow,
  runDueAutomations,
  Recipe,
  RecipeStep,
} from '../features/automations/engine'

beforeEach(() => {
  memStore.clear()
  vi.clearAllMocks()
})

// ── Fixture helpers ────────────────────────────────────────────────────────
function makeRecipe(overrides: Partial<Recipe> = {}): Partial<Recipe> & { name: string; trigger: Recipe['trigger']; steps: RecipeStep[] } {
  return {
    name: 'Mi receta',
    enabled: true,
    trigger: { triggerId: 'manual', config: {} },
    steps: [{ actionId: 'notify', config: { message: 'Hola' } }],
    ...overrides,
  }
}

describe('Automations engine — CRUD de recetas', () => {
  it('crea una receta y la lista', async () => {
    const created = await createRecipe('user1', makeRecipe())
    expect('error' in created).toBe(false)
    const recipe = created as Recipe
    expect(recipe.id).toMatch(/^rcp_/)
    expect(recipe.enabled).toBe(true)
    expect(recipe.runCount).toBe(0)

    const recipes = await listRecipes('user1')
    expect(recipes).toHaveLength(1)
    expect(recipes[0].name).toBe('Mi receta')
  })

  it('rechaza trigger desconocido', async () => {
    const res = await createRecipe('user1', makeRecipe({ trigger: { triggerId: 'inexistente', config: {} } }))
    expect('error' in res).toBe(true)
  })

  it('rechaza acción desconocida', async () => {
    const res = await createRecipe('user1', makeRecipe({ steps: [{ actionId: 'inexistente', config: {} }] }))
    expect('error' in res).toBe(true)
  })

  it('toggle enable/disable', async () => {
    const created = await createRecipe('user1', makeRecipe())
    const recipe = created as Recipe
    expect(await toggleRecipe('user1', recipe.id, false)).toBe(true)
    const [r] = await listRecipes('user1')
    expect(r.enabled).toBe(false)
  })

  it('toggle inexistente devuelve false', async () => {
    expect(await toggleRecipe('user1', 'rcp_noexiste', false)).toBe(false)
  })

  it('actualiza nombre y pasos', async () => {
    const created = await createRecipe('user1', makeRecipe())
    const recipe = created as Recipe
    const ok = await updateRecipe('user1', recipe.id, {
      name: 'Nuevo nombre',
      steps: [{ actionId: 'noop', config: { extra: true } }],
    })
    expect(ok).toBe(true)
    const [r] = await listRecipes('user1')
    expect(r.name).toBe('Nuevo nombre')
    expect(r.steps).toHaveLength(1)
  })

  it('borra una receta', async () => {
    const created = await createRecipe('user1', makeRecipe())
    const recipe = created as Recipe
    expect(await deleteRecipe('user1', recipe.id)).toBe(true)
    expect(await listRecipes('user1')).toHaveLength(0)
  })

  it('borrar inexistente devuelve false', async () => {
    expect(await deleteRecipe('user1', 'rcp_noexiste')).toBe(false)
  })

  it('recetas por usuario están aisladas', async () => {
    await createRecipe('user1', makeRecipe({ name: 'A' }))
    await createRecipe('user2', makeRecipe({ name: 'B' }))
    expect(await listRecipes('user1')).toHaveLength(1)
    expect(await listRecipes('user2')).toHaveLength(1)
  })
})

describe('Automations engine — ejecución', () => {
  it('runRecipe con force=true ejecuta acciones', async () => {
    const created = await createRecipe('user1', makeRecipe())
    const recipe = created as Recipe
    const record = await runRecipe('user1', recipe, true)
    expect(record.triggered).toBe(true)
    expect(record.steps.length).toBe(1)
    expect(record.steps[0].ok).toBe(true)
  })

  it('runRecipeNow deja log', async () => {
    const created = await createRecipe('user1', makeRecipe())
    const recipe = created as Recipe
    const record = await runRecipeNow('user1', recipe.id)
    expect('error' in record).toBe(false)
    const rlc = await import('../features/automations/engine')
    const logs = await rlc.getLogs('user1')
    expect(logs).toHaveLength(1)
    expect(logs[0].recipeId).toBe(recipe.id)
  })

  it('runDueAutomations no ejecuta recetas si no hay usuarios activos', async () => {
    const res = await runDueAutomations()
    expect(res).toEqual({ ran: 0 })
  })
})