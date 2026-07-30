// ============================================
// DAYA IA — Ruta: Deep Research v2
//   POST   /api/research2/start    { topic, rounds? }  → arranca en 2º plano, SSE de progreso
//   GET    /api/research2/:id      → estado actual (para refrescos de página)
//   POST   /api/research2/:id/cancel → cancela
//   GET    /api/research2          → lista de investigaciones del usuario
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { startResearch, getResearch, cancelResearch, listResearch, runResearch } from './engine'

const router = Router()
router.use(requireAuth)

// Arranque con streaming SSE de progreso en vivo.
router.post('/start', async (req: Request, res: Response) => {
  const { topic, rounds } = req.body as { topic?: string; rounds?: number }
  const userId = (req as any).userId
  if (!topic || !String(topic).trim()) {
    return res.status(400).json({ error: 'Falta el tema (topic).' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const task = startResearch(userId, String(topic).trim(), {
    rounds,
    onProgress: (p) => send({ progress: p, id: task.id }),
  })

  // Manda el id de inmediato para que la UI pueda reconectar si se corta.
  send({ id: task.id, phase: task.phase })

  // Poll interno: reenvía el estado hasta terminar, luego cierra el stream.
  const timer = setInterval(() => {
    const cur = getResearch(userId, task.id)
    if (!cur) { clearInterval(timer); return res.end() }
    if (cur.phase === 'done') {
      send({ done: true, id: cur.id, report: cur.result })
      clearInterval(timer); res.end()
    } else if (cur.phase === 'error') {
      send({ error: cur.error, id: cur.id })
      clearInterval(timer); res.end()
    } else if (cur.phase === 'cancelled') {
      send({ cancelled: true, id: cur.id })
      clearInterval(timer); res.end()
    }
  }, 1000)

  // Si el cliente se desconecta, no cancelamos: la tarea sigue viva para que
  // pueda reconectarse con GET /:id tras un refresh.
  req.on('close', () => clearInterval(timer))
})

// Investigación síncrona simple (sin SSE), por si se quiere el informe directo.
router.post('/run', async (req: Request, res: Response) => {
  const { topic, rounds } = req.body as { topic?: string; rounds?: number }
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: 'Falta el tema (topic).' })
  try {
    const report = await runResearch(String(topic).trim(), { rounds })
    res.json({ report })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'La investigación falló.' })
  }
})

// Estado de una investigación (clave para sobrevivir a refrescos).
router.get('/:id', (req: Request, res: Response) => {
  const userId = (req as any).userId
  const cur = getResearch(userId, req.params.id)
  if (!cur) return res.status(404).json({ error: 'No encontrada.' })
  res.json(cur)
})

// Cancelar.
router.post('/:id/cancel', (req: Request, res: Response) => {
  const userId = (req as any).userId
  const ok = cancelResearch(userId, req.params.id)
  res.json({ cancelled: ok })
})

// Lista de investigaciones del usuario.
router.get('/', (req: Request, res: Response) => {
  const userId = (req as any).userId
  res.json({ items: listResearch(userId) })
})

export default router
