// ============================================
// DAYA IA — Ruta: Blocks (formato de contenido por bloques)
//   POST /api/blocks/from-markdown { markdown }        → markdown → documento de bloques
//   POST /api/blocks/to-markdown   { document }        → bloques → markdown
//   POST /api/blocks/to-html       { document }        → bloques → HTML
//   POST /api/blocks/to-text       { document }        → bloques → texto plano (para RAG)
//   POST /api/blocks/validate      { document }        → valida y sanea
// Todo devuelve JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { validateDocument, sanitizeDocument, documentToPlainText, BlockDocument } from './blockDocument'
import { markdownToBlocks, blocksToMarkdown, blocksToHtml } from './convert'

const router = Router()
router.use(requireAuth)

router.post('/from-markdown', (req: Request, res: Response) => {
  const { markdown } = req.body || {}
  if (typeof markdown !== 'string') return res.status(400).json({ error: 'Falta markdown (string).' })
  try {
    res.json({ document: markdownToBlocks(markdown) })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'La conversión falló.' })
  }
})

router.post('/to-markdown', (req: Request, res: Response) => {
  const { document } = req.body || {}
  const v = validateDocument(document)
  if (!v.valid) return res.status(400).json({ error: 'Documento inválido', details: v.errors })
  res.json({ markdown: blocksToMarkdown(sanitizeDocument(document)) })
})

router.post('/to-html', (req: Request, res: Response) => {
  const { document } = req.body || {}
  const v = validateDocument(document)
  if (!v.valid) return res.status(400).json({ error: 'Documento inválido', details: v.errors })
  res.json({ html: blocksToHtml(sanitizeDocument(document)) })
})

router.post('/to-text', (req: Request, res: Response) => {
  const { document } = req.body || {}
  const v = validateDocument(document)
  if (!v.valid) return res.status(400).json({ error: 'Documento inválido', details: v.errors })
  res.json({ text: documentToPlainText(sanitizeDocument(document as BlockDocument)) })
})

router.post('/validate', (req: Request, res: Response) => {
  const { document } = req.body || {}
  const v = validateDocument(document)
  res.json({ valid: v.valid, errors: v.errors, sanitized: v.valid ? sanitizeDocument(document) : undefined })
})

export default router
