// ============================================
// DAYA IA — Ruta: Audio Intelligence
//   POST /api/audiointel/analyze        { transcript, kind? }     → analiza texto ya transcrito
//   POST /api/audiointel/process        (multipart: audio)        → transcribe + analiza
//   POST /api/audiointel/markdown       { insight, title? }       → acta en markdown
// Todo devuelve JSON. Patrón de subida idéntico al de /transcribe (multer memory).
// ============================================
import { Router, Request, Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../../middleware/auth'
import { analyzeTranscript, transcribeAndAnalyze, insightToMarkdown, AudioInsight } from './audioIntel'

const router = Router()
router.use(requireAuth)

// Mismo patrón que el endpoint /transcribe existente: memoria + tope de tamaño.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB (como suele limitar Whisper)
})

// Analiza una transcripción ya existente (sin audio).
router.post('/analyze', async (req: Request, res: Response) => {
  const { transcript, kind } = req.body || {}
  if (!transcript || !String(transcript).trim()) {
    return res.status(400).json({ error: 'Falta la transcripción (transcript).' })
  }
  try {
    const insight = await analyzeTranscript(String(transcript), { kind })
    res.json({ insight })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'El análisis falló.' })
  }
})

// Pipeline completo: sube audio → transcribe → analiza.
router.post('/process', audioUpload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió audio.' })
  const kind = (req.body?.kind as any) || undefined
  try {
    const result = await transcribeAndAnalyze(req.file.buffer, req.file.originalname || 'audio.webm', { kind })
    if (!result.success) return res.status(500).json({ error: result.error })
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'El procesamiento falló.' })
  }
})

// Exporta una inteligencia a markdown (acta lista para guardar/compartir).
router.post('/markdown', (req: Request, res: Response) => {
  const { insight, title } = req.body || {}
  if (!insight) return res.status(400).json({ error: 'Falta insight.' })
  try {
    const md = insightToMarkdown(insight as AudioInsight, title || 'Resumen de audio')
    res.json({ markdown: md })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo generar el markdown.' })
  }
})

export default router
