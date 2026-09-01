// ============================================
// DAYA IA — Route: Actions (extract + act, cacheable and self-healing)
//   POST /api/actions/extract  { source, schema, format?, sourceKind?, forceReplan? }
//   POST /api/actions/act      { goal, tools?, initialVars?, forceReplan? }
//   POST /api/actions/cache/clear { name, cacheKey? }
//   GET  /api/actions/tools    → herramientas integradas disponibles para act
// Todo devuelve JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { extract, ExtractSchema } from './extract'
import { act, ActTool } from './act'
import { clearActionCache } from './actionEngine'
import { toActTools } from '../agent/tools'

const router = Router()
router.use(requireAuth)

// ── Built-in tools for `act` (wrap existing features) ────────────────────────
// El núcleo son las herramientas del agente marcadas como `safeForAct` (buscar
// en la web, leer URLs, calcular, resumir videos, crear diagramas…), reutilizadas
// desde el registro central de tools. Aquí se añaden las específicas de `act`
// (conexiones y extracción estructurada), que no viven en el agente.

function builtinTools(): ActTool[] {
  const extras: ActTool[] = [
    {
      name: 'query_api',
      description: 'Consulta una API pública o conector (github/crypto) y devuelve datos. args: { url?, path?, connector?, arg? }',
      run: async (args) => {
        try {
          const { ask } = await import('../oracle/oracleConnector')
          return await ask(args as any)
        } catch (e: unknown) { return { error: (e instanceof Error && e.message) || 'oracle no disponible' } }
      },
    },
    {
      name: 'extract_fields',
      description: 'Extrae campos estructurados de un texto/JSON. args: { source, schema }',
      run: async (args) => {
        const r = await extract(String(args.source || ''), (args.schema || {}) as ExtractSchema)
        return r.ok ? r.data : { error: r.error }
      },
    },
  ]
  return [...toActTools(), ...extras]
}

router.get('/tools', (_req: Request, res: Response) => {
  res.json({ tools: builtinTools().map(t => ({ name: t.name, description: t.description })) })
})

router.post('/extract', async (req: Request, res: Response) => {
  const { source, schema, format, sourceKind, forceReplan } = req.body || {}
  if (!source || !schema) return res.status(400).json({ error: 'Faltan source y schema.' })
  try {
    const result = await extract(String(source), schema as ExtractSchema, {
      format, sourceKind, forceReplan: !!forceReplan,
    })
    res.json(result)
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'La extracción falló.' })
  }
})

router.post('/act', async (req: Request, res: Response) => {
  const { goal, initialVars, forceReplan } = req.body || {}
  if (!goal) return res.status(400).json({ error: 'Falta el objetivo (goal).' })
  try {
    // Uses the built-in tools. (For custom tools, call act()
    // from your own backend code with your set of ActTool.)
    const result = await act(String(goal), builtinTools(), {
      initialVars: initialVars || {},
      forceReplan: !!forceReplan,
    })
    res.json(result)
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'La acción falló.' })
  }
})

router.post('/cache/clear', async (req: Request, res: Response) => {
  const { name, cacheKey } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Falta name.' })
  await clearActionCache(String(name), cacheKey || 'default')
  res.json({ ok: true })
})

export default router
