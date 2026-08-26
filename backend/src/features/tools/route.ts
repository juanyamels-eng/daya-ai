// ============================================
// DAYA IA — catálogo público de herramientas
// --------------------------------------------------------------------------
// GET /api/tools/catalog — lista en vivo de TODAS las herramientas del agente
// (núcleo + comunidad + las que crea la auto-mejora). Público, sin auth: es la
// vitrina que alimenta la página /community y enseña cómo crece DAYA.
// ============================================

import { Router } from 'express'
import { getCatalog } from '../agent/tools'

const router = Router()

router.get('/catalog', (_req, res) => {
  const tools = getCatalog()
  res.json({
    total: tools.length,
        byAuthor: tools.reduce((acc: Record<string, number>, t) => {
          const k = t.meta.author || 'daya'
          acc[k] = (acc[k] || 0) + 1
          return acc
        }, {}),
    tools,
  })
})

export default router
