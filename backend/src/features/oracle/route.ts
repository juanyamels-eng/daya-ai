// ============================================
// DAYA IA — Ruta: Oracle Connector
//   POST /api/oracle/query    { url?, method?, headers?, body?, path?, connector?, arg? }
//   POST /api/oracle/inspect  { json }      → describe el esquema de un JSON pegado
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { ask, describeSchema, summarizeForAgent, extractPath } from './oracleConnector'

const router = Router()
router.use(requireAuth)

// Consulta una API externa o un conector, devuelve datos resumidos.
router.post('/query', async (req: Request, res: Response) => {
  try {
    const result = await ask(req.body || {})
    res.json({ result })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'La consulta falló.' })
  }
})

// Inspecciona un JSON que el usuario pega (o extrae una ruta de él).
router.post('/inspect', async (req: Request, res: Response) => {
  const { json, path } = req.body || {}
  if (json == null) return res.status(400).json({ error: 'Falta el JSON.' })
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json
    const target = path ? extractPath(data, path) : data
    res.json({
      schema: describeSchema(target),
      summary: summarizeForAgent(data, { path }),
    })
  } catch (e) {
    res.status(400).json({ error: 'JSON no válido: ' + (e instanceof Error ? e.message : '') })
  }
})

export default router
