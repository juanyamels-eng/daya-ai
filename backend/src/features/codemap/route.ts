// ============================================
// DAYA IA — Ruta: Codemap (grep estructural + esqueleto de código)
//   POST /api/codemap/grep      { files:[{path,content}], pattern, ignoreCase?, loiPad?, childContext? }
//   POST /api/codemap/skeleton  { path, content }
//   POST /api/codemap/chunks    { path, content, maxChunkLines? }
//   GET  /api/codemap/status    → ¿tree-sitter disponible?
// Todo devuelve JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { grepStructural, codeSkeleton, structuralChunks } from './codemap'
import { isParserAvailable } from './parserLoader'

const router = Router()
router.use(requireAuth)

router.get('/status', async (_req: Request, res: Response) => {
  const treeSitter = await isParserAvailable()
  res.json({
    treeSitter,
    mode: treeSitter ? 'tree-sitter (preciso)' : 'heurística por indentación (respaldo)',
  })
})

router.post('/grep', async (req: Request, res: Response) => {
  const { files, pattern, ignoreCase, loiPad, childContext } = req.body || {}
  if (!Array.isArray(files) || !pattern) {
    return res.status(400).json({ error: 'Faltan files[] y pattern.' })
  }
  try {
    const matches = await grepStructural(files, String(pattern), {
      ignoreCase: !!ignoreCase,
      loiPad: typeof loiPad === 'number' ? loiPad : undefined,
      childContext: childContext !== false,
    })
    res.json({ count: matches.length, matches })
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'El grep estructural falló.' })
  }
})

router.post('/skeleton', async (req: Request, res: Response) => {
  const { path, content } = req.body || {}
  if (!path || content == null) return res.status(400).json({ error: 'Faltan path y content.' })
  try {
    res.json(await codeSkeleton(String(path), String(content)))
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'No se pudo extraer el esqueleto.' })
  }
})

router.post('/chunks', async (req: Request, res: Response) => {
  const { path, content, maxChunkLines } = req.body || {}
  if (!path || content == null) return res.status(400).json({ error: 'Faltan path y content.' })
  try {
    const chunks = await structuralChunks(String(path), String(content), Number(maxChunkLines) || 120)
    res.json({ count: chunks.length, chunks })
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'No se pudieron generar los chunks.' })
  }
})

export default router
