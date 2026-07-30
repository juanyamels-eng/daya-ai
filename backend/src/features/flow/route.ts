// ============================================
// DAYA IA — Ruta: Flow (motor de workflows)
//   GET  /api/flow/graphs              → grafos registrados
//   POST /api/flow/start   { graph, input, maxSteps? }   → arranca un workflow
//   POST /api/flow/:runId/resume { input }               → reanuda uno pausado
//   GET  /api/flow/:runId              → estado/checkpoint de una ejecución
//   GET  /api/flow                     → ejecuciones del usuario
// Todo devuelve JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { startRun, resumeRun, listGraphs, registerGraph } from './runner'
import { loadCheckpoint, listRuns } from './checkpointer'
import { registerCragFlow } from './cragFlow'

// Registra los flujos disponibles al cargar el módulo.
registerCragFlow()

const router = Router()
router.use(requireAuth)

router.get('/graphs', (_req: Request, res: Response) => {
  res.json({ graphs: listGraphs() })
})

router.post('/start', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { graph, input, maxSteps } = req.body || {}
  if (!graph) return res.status(400).json({ error: 'Falta el nombre del grafo (graph).' })
  try {
    const cp = await startRun(String(graph), userId, input || {}, { maxSteps: Number(maxSteps) || undefined })
    res.json(publicView(cp))
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'No se pudo iniciar el workflow.' })
  }
})

router.post('/:runId/resume', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { input } = req.body || {}
  try {
    const cp = await resumeRun(req.params.runId, userId, input, {})
    res.json(publicView(cp))
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'No se pudo reanudar.' })
  }
})

router.get('/:runId', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const cp = await loadCheckpoint(req.params.runId, userId)
  if (!cp) return res.status(404).json({ error: 'Ejecución no encontrada.' })
  res.json(publicView(cp))
})

router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const runs = await listRuns(userId)
  res.json({ runs: runs.map(r => ({ runId: r.runId, graph: r.graph, status: r.status, updatedAt: r.updatedAt })) })
})

// Vista pública del checkpoint (sin exponer nada interno innecesario).
function publicView(cp: any) {
  return {
    runId: cp.runId,
    graph: cp.graph,
    status: cp.status,
    state: cp.state,
    interrupt: cp.interrupt,
    nextNode: cp.nextNode,
    error: cp.error,
    steps: cp.trace?.map((t: any) => ({ node: t.node, durationMs: t.durationMs })) || [],
    updatedAt: cp.updatedAt,
  }
}

export default router
