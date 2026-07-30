import { Router, Request, Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth'
import { heavyLimiter } from '../middleware/rateLimiter'
import { buildProfessionalHTML, buildIllustratedHTML } from '../services/documents/pdfGenerator'
import { htmlToPDF } from '../services/documents/pdfRenderer'
import { buildDOCX } from '../services/documents/docxGenerator'
import { generateExcelData, buildExcelPreviewHTML, buildXLSX } from '../services/documents/excelGenerator'
import { generatePresentationData, buildPresentationHTML } from '../services/documents/pptGenerator'
import { buildPPTX } from '../services/documents/pptxGenerator'
import {
  analyzeFile, reorganizeDocument, summarizeDocument,
  transformDocument, saveToLibrary, getLibraryDocuments,
  deleteLibraryDocument, generateDocumentContent
} from '../services/documents/documentService'
import { parseFile, isSupported } from '../services/documents/fileParser'
import { prisma } from '../lib/prisma'

// Multer in memory — max 20MB per file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

// Converts a title to a clean filename
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'documento'
}

const router = Router()

// Public download — validated by the unique docId (cuid hard to guess).
// Goes BEFORE requireAuth because browser <a href> links don't send tokens.
// "Anyone with the link" model: the id itself is the access capability (like a
// Google Docs download link). We harden it by validating the id format.
router.get('/download/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id || ''
    // Only ids with cuid/uuid shape (8-40 alphanumeric/hyphen chars). Anything
    // else is a probe: we respond 404 without touching the database.
    if (!/^[a-z0-9_-]{8,40}$/i.test(id)) {
      return res.status(404).send('Documento no encontrado')
    }
    const doc = await prisma.libraryDocument.findUnique({
      where: { id }
    })
    if (!doc) return res.status(404).send('Documento no encontrado')

    // Prevents the browser from "guessing" the content type (anti-XSS defense).
    res.setHeader('X-Content-Type-Options', 'nosniff')

    const isView = req.query.view === '1'

    // Binary (xlsx) saved as base64 with prefix
    if (doc.content.startsWith('__B64__:')) {
      const rest = doc.content.slice('__B64__:'.length)
      const sep = rest.indexOf(':')
      const mime = rest.slice(0, sep)
      const b64 = rest.slice(sep + 1)
      res.setHeader('Content-Type', mime)
      res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`)
      return res.send(Buffer.from(b64, 'base64'))
    }

    // HTML / text
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (!isView) {
      res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`)
    }
    res.send(doc.content)
  } catch {
    res.status(500).send('Error descargando documento')
  }
})

// Everything else requires authentication
router.use(requireAuth)

// ============================================
// POST /api/documents/upload
// Uploads a file (PDF/Word/Excel/CSV/TXT), READS it and processes it
// ============================================
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const file = (req as any).file
  const action = req.body.action || 'analyze' // analyze | reorganize | summarize | transform
  const question = req.body.question || ''

  if (!file) return res.status(400).json({ error: 'No se recibió ningún archivo' })

  if (!isSupported(file.originalname)) {
    return res.status(400).json({ error: `Formato no soportado: ${file.originalname}. Acepta PDF, Word, PowerPoint, Excel, CSV, EPUB y TXT.` })
  }

  try {
    // 1️⃣ READ the file — extract text from binary
    const parsed = await parseFile(file.buffer, file.originalname, file.mimetype)

    if (!parsed.text || parsed.text.length < 5) {
      return res.status(422).json({ error: 'El archivo está vacío o no se pudo extraer texto.' })
    }

    // 2️⃣ PROCESS according to the requested action
    let result: any

    switch (action) {
      case 'summarize':
        result = await summarizeDocument(parsed.text, 'executive', 200)
        break
      case 'reorganize':
        result = await reorganizeDocument(parsed.text, question || 'Mejora la estructura y claridad', 'pdf')
        break
      case 'transform':
        result = await transformDocument(parsed.text, parsed.metadata.type as any, (req.body.targetFormat || 'pdf'))
        break
      default: // analyze
        result = await analyzeFile({ userId: (req as any).userId, fileContent: parsed.text, fileName: file.originalname, fileType: parsed.metadata.type, question })
    }

    res.json({
      success: true,
      fileName: file.originalname,
      metadata: parsed.metadata,
      extractedLength: parsed.text.length,
      result,
    })

  } catch (error: any) {
    console.error('❌ File upload/parse error:', error.message)
    res.status(500).json({ error: error.message || 'Error procesando el archivo' })
  }
})

// ============================================
// POST /api/documents/extract
// Only extracts text from a file (without AI processing)
// ============================================
router.post('/extract', upload.single('file'), async (req: Request, res: Response) => {
  const file = (req as any).file
  if (!file) return res.status(400).json({ error: 'No se recibió ningún archivo' })

  try {
    const parsed = await parseFile(file.buffer, file.originalname, file.mimetype)
    res.json({
      success: true,
      fileName: file.originalname,
      text: parsed.text,
      metadata: parsed.metadata,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// POST /api/documents/generate
// Generates any type of document
// ============================================
// (Previous pre-generation questions were removed: the document is generated directly.)
router.post('/generate', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { prompt, docType, language, template, answers } = req.body

  if (!prompt || !docType) {
    return res.status(400).json({ error: 'prompt y docType son requeridos' })
  }

  // Document quota per plan (FREE 3/day, BETA 50/month, PRO/TEAM unlimited).
  // It is reserved BEFORE generating; if generation fails, it is returned in the catch.
  const { consumeQuota } = await import('../services/quota')
  const dq = await consumeQuota(userId, 'document')
  if (!dq.ok) return res.status(429).json({ error: dq.error })
  let quotaConsumed = true

  try {
    let content: Buffer | string
    let contentType: string
    let fileName: string
    let previewHTML: string | null = null

    // White-label + model according to plan (FREE cheap, paid Claude)
    const userPlan = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
    const plan = userPlan?.plan || 'free'
    const branded = /free/i.test(plan)

    const genReq = { userId, prompt, docType, language, template, answers, plan }

    // Template based on what the user requested, interpreting FREE TEXT
    // (now DAYA asks conversationally; the answer comes in answers.preferencias)
    const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    const freeText = (answers && (answers['preferencias'] || answers['¿Qué estilo visual prefieres?'] || answers['estilo'] || '')) || ''
    const audiencia = (answers && (answers['¿Para quién es el documento?'] || answers['audiencia'])) || ''
    const blob = norm(`${freeText} ${audiencia}`)
    const validStyles = ['ejecutivo', 'academico', 'moderno', 'minimalista', 'corporativo', 'esmeralda', 'editorial', 'tech', 'elegante', 'calido', 'blanco', 'negro', 'noche', 'rubi', 'oceano', 'violeta', 'bosque', 'slate', 'medianoche', 'carbon', 'coral']
    let docStyle = 'ejecutivo'
    // 1) exact template name in the text
    const matched = validStyles.find(v => blob.includes(v))
    if (matched) docStyle = matched
    else if (template && validStyles.includes(template)) docStyle = template
    // 2) BLACK / WHITE background (what the user usually asks directly)
    else if (/fondo (negro|oscuro)|modo (oscuro|noche)|tema oscuro|dark|pantalla negra/.test(blob)) docStyle = 'negro'
    else if (/fondo blanco|tema claro|bien limpio|blanco puro|papel blanco/.test(blob)) docStyle = 'blanco'
    // 3) by "vibe" / descriptive words
    else if (/universidad|tesis|academ|cientific|investigaci|escolar|colegio|ensayo/.test(blob)) docStyle = 'academico'
    else if (/lujo|elegante|premium|sofistic|formal alto|dorado/.test(blob)) docStyle = 'elegante'
    else if (/minimal|limpio|simple|sobrio|sencillo/.test(blob)) docStyle = 'minimalista'
    else if (/empresa|corporativ|negocio|ejecutiv|profesional|trabajo|formal/.test(blob)) docStyle = 'corporativo'
    else if (/tech|tecnolog|software|app|startup|digital/.test(blob)) docStyle = 'tech'
    else if (/eco|verde|natural|ambient|sosten|salud/.test(blob)) docStyle = 'esmeralda'
    else if (/revista|editorial|magazine|creativ|art/.test(blob)) docStyle = 'editorial'
    else if (/calid|amigable|cercano|personal|casual|naranja|coral/.test(blob)) docStyle = 'calido'
    else if (/morado|violeta|purpura|creativ/.test(blob)) docStyle = 'violeta'
    else if (/oceano|mar|azul fuerte|fresco/.test(blob)) docStyle = 'oceano'
    else if (/rojo|granate|rubi|vino/.test(blob)) docStyle = 'rubi'
    else if (/modern|fresco|actual/.test(blob)) docStyle = 'moderno'

    switch (docType) {
      case 'pdf': {
        // Generates content ONCE, searches for images, layouts it and renders to real PDF.
        const docData = await generateDocumentContent(genReq)
        const html = await buildIllustratedHTML(docData.title, docData.content, docData.sections, prompt, branded, docStyle)
        content = await htmlToPDF(html)
        contentType = 'application/pdf'
        fileName = `${slugify(docData.title)}.pdf`
        previewHTML = html
        break
      }

      case 'word': {
        // Real Word (.docx) PREMIUM with theme, images and white-label.
        const docData = await generateDocumentContent(genReq)
        content = await buildDOCX(docData.title, docData.content, prompt, branded, docStyle)
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        fileName = `${slugify(docData.title)}.docx`
        previewHTML = buildProfessionalHTML(docData.title, docData.content, docData.sections, null, undefined, branded, docStyle)
        break
      }

      case 'excel': {
        const excelData = await generateExcelData(genReq)
        const docContent = await generateDocumentContent({ ...genReq, docType: 'excel' })
        previewHTML = buildExcelPreviewHTML(
          docContent.title,
          excelData.headers,
          excelData.rows,
          excelData.chartConfig,
          excelData.insights || [],
        )
        // Downloads the REAL styled .xlsx (VIP headers, auto-fit, currency)
        content = buildXLSX(docContent.title, excelData.headers, excelData.rows)
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        fileName = `${slugify(docContent.title)}.xlsx`
        break
      }

      case 'powerpoint': {
        const pptData = await generatePresentationData(genReq)
        // HTML preview (to show in chat) + real .pptx file to download
        previewHTML = buildPresentationHTML(
          pptData.title,
          pptData.subtitle,
          pptData.slides,
          pptData.theme,
          docStyle,
        )
        content = await buildPPTX(pptData.title, pptData.subtitle, pptData.slides, branded, docStyle)
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        fileName = `${slugify(pptData.title)}.pptx`
        break
      }

      default: {
        const docContent = await generateDocumentContent(genReq)
        content = Buffer.from(docContent.content, 'utf-8')
        contentType = 'text/plain'
        fileName = `daya-doc-${Date.now()}.txt`
        previewHTML = null
      }
    }

    // Save to library.
    // For binaries (xlsx, pdf, docx) we save base64 with mimeType prefix; for text, direct HTML/text.
    const isBinary = contentType.includes('spreadsheet')
      || contentType.includes('officedocument')
      || contentType.includes('presentationml')
      || contentType.includes('pdf')
    const stored = isBinary
      ? `__B64__:${contentType}:${content.toString('base64')}`
      : content.toString()

    const docId = await saveToLibrary(userId, fileName, docType, stored, content.length)

    res.json({
      success: true,
      docId,
      fileName,
      docType,
      previewHTML,
      downloadUrl: `/api/documents/download/${docId}`,
    })

  } catch (error: any) {
    console.error('❌ Document generation error:', error.message)
    // The quota was reserved but the document was not generated: refund it.
    if (quotaConsumed) {
      const { refundQuota } = await import('../services/quota')
      await refundQuota(userId, 'document').catch(() => {})
    }
    res.status(500).json({ error: error.message || 'Error generando documento' })
  }
})

// ============================================
// POST /api/documents/analyze
// Analyzes an uploaded file
// ============================================
router.post('/analyze', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { fileContent, fileName, fileType, question } = req.body

  if (!fileContent || !fileName) {
    return res.status(400).json({ error: 'fileContent y fileName son requeridos' })
  }

  try {
    const analysis = await analyzeFile({ userId, fileContent, fileName, fileType, question })
    res.json({ success: true, analysis })
  } catch (error: any) {
    res.status(500).json({ error: 'Error analizando archivo', details: error.message })
  }
})

// ============================================
// POST /api/documents/reorganize
// Reorganizes and improves a document
// ============================================
router.post('/reorganize', async (req: Request, res: Response) => {
  const { content, instruction, docType } = req.body
  try {
    const result = await reorganizeDocument(content, instruction, docType || 'word')
    res.json({ success: true, ...result })
  } catch (error: any) {
    res.status(500).json({ error: 'Error reorganizando documento' })
  }
})

// ============================================
// POST /api/documents/summarize
// Summarizes a document
// ============================================
router.post('/summarize', async (req: Request, res: Response) => {
  const { content, style, maxWords } = req.body
  try {
    const result = await summarizeDocument(content, style, maxWords)
    res.json({ success: true, ...result })
  } catch (error: any) {
    res.status(500).json({ error: 'Error resumiendo documento' })
  }
})

// ============================================
// POST /api/documents/transform
// Converts between formats
// ============================================
router.post('/transform', async (req: Request, res: Response) => {
  const { content, fromType, toType } = req.body
  try {
    const result = await transformDocument(content, fromType, toType)
    res.json({ success: true, ...result })
  } catch (error: any) {
    res.status(500).json({ error: 'Error transformando documento' })
  }
})

// ============================================
// GET /api/documents/library
// Gets the user's library
// ============================================
router.get('/library', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { category } = req.query
  try {
    const docs = await getLibraryDocuments(userId, category as string)
    res.json(docs)
  } catch (error: any) {
    res.status(500).json({ error: 'Error obteniendo biblioteca' })
  }
})

// ============================================
// DELETE /api/documents/library/:id
// ============================================
router.delete('/library/:id', async (req: Request, res: Response) => {
  const userId = (req as any).userId
  try {
    await deleteLibraryDocument(userId, req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: 'Error eliminando documento' })
  }
})

// ============================================
export default router
