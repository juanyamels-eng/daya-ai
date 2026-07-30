// ============================================
// DAYA IA — Match, adaptación de CV y carta de presentación
// --------------------------------------------------------------------------
// El valor central de tener CV y oferta en forma canónica: compararlos y actuar.
//   • matchResumeToJob  → puntúa el encaje, qué cumples y qué te falta.
//   • tailorResume      → reescribe/reordena el CV para esa oferta concreta.
//   • coverLetter       → genera una carta de presentación dirigida.
//
// El match combina una parte DETERMINISTA (solapamiento de skills, barata y
// explicable) con un juicio de IA (matices de experiencia y requisitos).
// ============================================

import { chatJSON, chatSingle } from '../../services/openrouter'
import { Resume, JobPosting } from './schema'

// ── Utilidades de skills ─────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Extrae el conjunto de skills del CV (nombres + keywords).
function resumeSkills(resume: Resume): Set<string> {
  const set = new Set<string>()
  for (const s of resume.skills || []) {
    if (s.name) set.add(norm(s.name))
    for (const k of s.keywords || []) set.add(norm(k))
  }
  // También de proyectos (keywords) y titulares de trabajo.
  for (const p of resume.projects || []) for (const k of p.keywords || []) set.add(norm(k))
  return set
}

// Extrae las skills pedidas por la oferta.
function jobSkills(job: JobPosting): string[] {
  const out: string[] = []
  for (const s of job.skills || []) {
    if (s.name) out.push(s.name)
    for (const k of s.keywords || []) out.push(k)
  }
  return [...new Set(out)]
}

// ── Match ─────────────────────────────────────────────────────────────────────

export interface MatchResult {
  score: number                  // 0..100
  verdict: string                // resumen en una frase
  matchedSkills: string[]
  missingSkills: string[]
  metQualifications: string[]
  unmetQualifications: string[]
  strengths: string[]
  gaps: string[]
  recommendations: string[]
}

const MATCH_SYS = `Eres un reclutador técnico imparcial. Evalúas el encaje entre un candidato y una oferta con honestidad: ni optimista ni duro de más. Te basas SOLO en los datos dados. Respondes SOLO en JSON.`

/**
 * Compara un CV con una oferta. Calcula el solapamiento de skills de forma
 * determinista y pide a la IA el juicio cualitativo (requisitos, fortalezas,
 * huecos y recomendaciones).
 */
export async function matchResumeToJob(resume: Resume, job: JobPosting): Promise<MatchResult> {
  // 1) Parte determinista: solapamiento de skills.
  const have = resumeSkills(resume)
  const want = jobSkills(job)
  const matched: string[] = []
  const missing: string[] = []
  for (const w of want) {
    if (have.has(norm(w))) matched.push(w)
    else missing.push(w)
  }
  const skillScore = want.length ? matched.length / want.length : 0.5

  // 2) Juicio de IA sobre requisitos/experiencia.
  let ai: any = {}
  try {
    ai = await chatJSON(
      `Evalúa el encaje candidato↔oferta.\n\n` +
      `CANDIDATO (resumen):\n${resumeDigest(resume)}\n\n` +
      `OFERTA:\nTítulo: ${job.title}\nExperiencia pedida: ${job.experience || 'n/d'}\n` +
      `Requisitos: ${(job.qualifications || []).join(' | ') || 'n/d'}\n` +
      `Responsabilidades: ${(job.responsibilities || []).join(' | ') || 'n/d'}\n\n` +
      `Skills que coinciden (calculado): ${matched.join(', ') || 'ninguna'}\n` +
      `Skills que faltan (calculado): ${missing.join(', ') || 'ninguna'}\n\n` +
      `Responde SOLO con JSON:\n` +
      `{\n` +
      `  "aiScore": 0-100,\n` +
      `  "verdict": "una frase honesta sobre el encaje",\n` +
      `  "metQualifications": ["requisitos que SÍ cumple"],\n` +
      `  "unmetQualifications": ["requisitos que NO cumple o no se evidencian"],\n` +
      `  "strengths": ["fortalezas del candidato para este puesto"],\n` +
      `  "gaps": ["carencias relevantes"],\n` +
      `  "recommendations": ["qué hacer para mejorar el encaje o el CV"]\n` +
      `}`,
      MATCH_SYS
    )
  } catch {
    ai = {}
  }

  const aiScore = typeof ai.aiScore === 'number' ? ai.aiScore / 100 : skillScore
  // Score final: mezcla solapamiento de skills (40%) + juicio IA (60%).
  const score = Math.round((skillScore * 0.4 + aiScore * 0.6) * 100)

  return {
    score,
    verdict: ai.verdict || (score >= 70 ? 'Buen encaje general.' : score >= 45 ? 'Encaje parcial.' : 'Encaje bajo.'),
    matchedSkills: matched,
    missingSkills: missing,
    metQualifications: toArr(ai.metQualifications),
    unmetQualifications: toArr(ai.unmetQualifications),
    strengths: toArr(ai.strengths),
    gaps: toArr(ai.gaps),
    recommendations: toArr(ai.recommendations),
  }
}

// ── Adaptación del CV a una oferta ───────────────────────────────────────────

export interface TailorResult {
  ok: boolean
  resume?: Resume
  changes?: string[]
  error?: string
}

/**
 * Reescribe/reordena el CV para resaltar lo relevante a la oferta. NO inventa
 * experiencia; reordena, reformula titulares/resumen y prioriza highlights.
 */
export async function tailorResume(resume: Resume, job: JobPosting): Promise<TailorResult> {
  try {
    const parsed = await chatJSON(
      `Adapta este CV a la oferta SIN inventar experiencia. Puedes: reescribir el "summary" para alinearlo al puesto, reordenar y reformular "highlights" para destacar lo relevante, ajustar el "label". NO añadas trabajos, títulos ni skills que el candidato no tenga.\n\n` +
      `CV actual:\n${JSON.stringify(trimResume(resume)).slice(0, 8000)}\n\n` +
      `OFERTA:\nTítulo: ${job.title}\nRequisitos: ${(job.qualifications || []).join(' | ')}\nSkills: ${jobSkills(job).join(', ')}\n\n` +
      `Responde SOLO con JSON:\n{ "resume": { …CV adaptado, misma forma… }, "changes": ["qué cambiaste y por qué"] }`,
      'Eres un experto en optimización de CVs. Adaptas sin mentir: reordenas, reformulas y resaltas, nunca inventas. Respondes SOLO en JSON.',
      undefined,
      8000
    )
    if (!parsed?.resume) return { ok: false, error: 'No se pudo adaptar el CV.' }
    return { ok: true, resume: parsed.resume as Resume, changes: toArr(parsed.changes) }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'La adaptación falló.' }
  }
}

// ── Carta de presentación ─────────────────────────────────────────────────────

export async function coverLetter(
  resume: Resume,
  job: JobPosting,
  opts: { tone?: 'formal' | 'cercano' | 'entusiasta'; language?: string } = {}
): Promise<{ ok: boolean; letter?: string; error?: string }> {
  try {
    const tone = opts.tone || 'formal'
    const letter = await chatSingle(
      [{
        role: 'user',
        content:
          `Escribe una carta de presentación en ${opts.language || 'español'}, tono ${tone}, para esta candidatura. ` +
          `Concreta y honesta: conecta la experiencia real del candidato con lo que pide la oferta. Sin clichés vacíos. Máx 250 palabras.\n\n` +
          `CANDIDATO:\n${resumeDigest(resume)}\n\nOFERTA:\n${job.title} en ${job.company || 'la empresa'}\nRequisitos: ${(job.qualifications || []).join(' | ')}`,
      }],
      'claude',
      'Eres un coach de carrera que escribe cartas de presentación persuasivas pero honestas y específicas. No inventas datos del candidato.'
    )
    return { ok: true, letter }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'No se pudo generar la carta.' }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toArr(v: any): string[] {
  return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, 20) : []
}

// Resumen compacto del CV para meterlo en prompts sin gastar contexto.
function resumeDigest(r: Resume): string {
  const work = (r.work || []).slice(0, 5).map(w => `${w.position || ''} en ${w.name} (${w.startDate || ''}–${w.endDate || 'actual'})`).join('; ')
  const edu = (r.education || []).slice(0, 3).map(e => `${e.studyType || ''} ${e.area || ''} (${e.institution})`).join('; ')
  const skills = (r.skills || []).slice(0, 20).map(s => s.name).join(', ')
  return [
    `Nombre: ${r.basics?.name || 'n/d'}${r.basics?.label ? ` — ${r.basics.label}` : ''}`,
    r.basics?.summary ? `Resumen: ${r.basics.summary.slice(0, 400)}` : '',
    work ? `Experiencia: ${work}` : '',
    edu ? `Formación: ${edu}` : '',
    skills ? `Skills: ${skills}` : '',
  ].filter(Boolean).join('\n')
}

function trimResume(r: Resume): Resume {
  return {
    basics: r.basics,
    work: (r.work || []).slice(0, 8),
    education: (r.education || []).slice(0, 5),
    skills: (r.skills || []).slice(0, 30),
    projects: (r.projects || []).slice(0, 8),
    languages: r.languages,
  }
}
