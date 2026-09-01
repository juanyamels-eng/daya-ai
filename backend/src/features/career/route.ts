// ============================================
// DAYA IA — Ruta: Career (asistente de carrera)
//   POST /api/career/structure-resume  { text }                → CV texto → JSON canónico
//   POST /api/career/structure-job     { text } | { url }      → oferta → JSON canónico
//   POST /api/career/match             { resume, job }         → encaje CV↔oferta
//   POST /api/career/tailor            { resume, job }         → CV adaptado a la oferta
//   POST /api/career/cover-letter      { resume, job, tone? }  → carta de presentación
//   POST /api/career/full              { resumeText, jobText|jobUrl, tone? } → todo el pipeline
// Todo devuelve JSON.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { structureResume, structureJob, structureJobFromUrl } from './structure'
import { matchResumeToJob, tailorResume, coverLetter } from './match'
import { validateResume, validateJob, Resume, JobPosting } from './schema'

const router = Router()
router.use(requireAuth)

router.post('/structure-resume', async (req: Request, res: Response) => {
  const { text } = req.body || {}
  if (!text) return res.status(400).json({ error: 'Falta el texto del CV.' })
  res.json(await structureResume(String(text)))
})

router.post('/structure-job', async (req: Request, res: Response) => {
  const { text, url } = req.body || {}
  if (url) return res.json(await structureJobFromUrl(String(url)))
  if (text) return res.json(await structureJob(String(text)))
  res.status(400).json({ error: 'Falta text o url.' })
})

router.post('/match', async (req: Request, res: Response) => {
  const { resume, job } = req.body || {}
  const vr = validateResume(resume), vj = validateJob(job)
  if (!vr.valid) return res.status(400).json({ error: 'CV inválido', details: vr.errors })
  if (!vj.valid) return res.status(400).json({ error: 'Oferta inválida', details: vj.errors })
  try {
    res.json(await matchResumeToJob(resume as Resume, job as JobPosting))
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'El match falló.' })
  }
})

router.post('/tailor', async (req: Request, res: Response) => {
  const { resume, job } = req.body || {}
  if (!resume || !job) return res.status(400).json({ error: 'Faltan resume y job.' })
  res.json(await tailorResume(resume as Resume, job as JobPosting))
})

router.post('/cover-letter', async (req: Request, res: Response) => {
  const { resume, job, tone, language } = req.body || {}
  if (!resume || !job) return res.status(400).json({ error: 'Faltan resume y job.' })
  res.json(await coverLetter(resume as Resume, job as JobPosting, { tone, language }))
})

// Pipeline completo de una sola llamada: estructura ambos, hace match, adapta y carta.
router.post('/full', async (req: Request, res: Response) => {
  const { resumeText, jobText, jobUrl, tone } = req.body || {}
  if (!resumeText) return res.status(400).json({ error: 'Falta resumeText.' })
  if (!jobText && !jobUrl) return res.status(400).json({ error: 'Falta jobText o jobUrl.' })
  try {
    const [rRes, jRes] = await Promise.all([
      structureResume(String(resumeText)),
      jobUrl ? structureJobFromUrl(String(jobUrl)) : structureJob(String(jobText)),
    ])
    if (!rRes.ok || !rRes.data) return res.status(400).json({ error: 'No se pudo estructurar el CV.', details: rRes.errors })
    if (!jRes.ok || !jRes.data) return res.status(400).json({ error: 'No se pudo estructurar la oferta.', details: jRes.errors })

    const resume = rRes.data, job = jRes.data
    const match = await matchResumeToJob(resume, job)
    // Adaptación y carta en paralelo (independientes).
    const [tailor, letter] = await Promise.all([
      tailorResume(resume, job),
      coverLetter(resume, job, { tone }),
    ])

    res.json({
      resume, job, match,
      tailoredResume: tailor.ok ? tailor.resume : undefined,
      tailorChanges: tailor.changes,
      coverLetter: letter.ok ? letter.letter : undefined,
    })
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'El pipeline falló.' })
  }
})

export default router
