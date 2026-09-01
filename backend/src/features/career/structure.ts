// ============================================
// DAYA IA — Estructuración (texto libre → esquema canónico)
// --------------------------------------------------------------------------
// Convierte un CV en texto libre (pegado, extraído de un PDF, de LinkedIn…) o
// una oferta de empleo (texto o de una URL) en el esquema canónico de career.
// Usa IA para el parsing y la normalización/validación local para garantizar
// la forma. Fiel al contenido: no inventa datos que no estén en el texto.
// ============================================

import { chatJSON } from '../../services/openrouter'
import {
  Resume, JobPosting, normalizeResume, validateResume, validateJob,
} from './schema'

// ── CV ───────────────────────────────────────────────────────────────────────

const RESUME_SYS = `Eres un parser de currículums. Conviertes texto libre en JSON estructurado siguiendo el estándar JSON Resume. Eres FIEL: no inventas datos, fechas ni logros que no aparezcan. Si algo no está, lo omites. Respondes SOLO en JSON válido.`

export interface StructureResult<T> {
  ok: boolean
  data?: T
  errors?: string[]
  error?: string
}

/** Estructura un CV en texto libre al esquema canónico. */
export async function structureResume(rawText: string): Promise<StructureResult<Resume>> {
  if (!rawText || rawText.trim().length < 20) {
    return { ok: false, error: 'El texto del CV es demasiado corto.' }
  }
  try {
    const parsed = await chatJSON(
      `Convierte este CV en JSON Resume. Texto:\n"""${rawText.slice(0, 12000)}"""\n\n` +
      `Responde SOLO con JSON con esta forma (omite secciones sin datos):\n` +
      `{\n` +
      `  "basics": { "name", "label", "email", "phone", "url", "summary", "location": {"city","region","countryCode"}, "profiles":[{"network","username","url"}] },\n` +
      `  "work": [ { "name","position","location","startDate","endDate","summary","highlights":[] } ],\n` +
      `  "education": [ { "institution","area","studyType","startDate","endDate" } ],\n` +
      `  "skills": [ { "name","level","keywords":[] } ],\n` +
      `  "projects": [ { "name","description","highlights":[],"keywords":[],"url" } ],\n` +
      `  "languages": [ { "language","fluency" } ]\n` +
      `}\nFechas en formato YYYY-MM-DD o YYYY-MM. No inventes nada.`,
      RESUME_SYS,
      undefined,
      6000
    )
    const data = normalizeResume(parsed)
    const v = validateResume(data)
    if (!v.valid) return { ok: false, errors: v.errors, data }
    return { ok: true, data }
  } catch (e: unknown) {
    return { ok: false, error: (e instanceof Error && e.message) || 'No se pudo estructurar el CV.' }
  }
}

// ── Oferta de empleo ───────────────────────────────────────────────────────────

const JOB_SYS = `Eres un parser de ofertas de empleo. Conviertes una descripción de puesto en JSON estructurado. Eres fiel al texto: separas responsabilidades de requisitos, extraes skills concretas. No inventas. Respondes SOLO en JSON válido.`

/** Estructura una oferta en texto libre al esquema canónico de job. */
export async function structureJob(rawText: string): Promise<StructureResult<JobPosting>> {
  if (!rawText || rawText.trim().length < 20) {
    return { ok: false, error: 'El texto de la oferta es demasiado corto.' }
  }
  try {
    const parsed = await chatJSON(
      `Convierte esta oferta de empleo en JSON estructurado. Texto:\n"""${rawText.slice(0, 10000)}"""\n\n` +
      `Responde SOLO con JSON:\n` +
      `{\n` +
      `  "title", "company", "type", "location": {"city","region","countryCode"}, "remote", "salary", "experience",\n` +
      `  "description": "resumen breve",\n` +
      `  "responsibilities": ["..."],\n` +
      `  "qualifications": ["requisitos: estudios, experiencia, must-haves"],\n` +
      `  "skills": [ { "name", "level", "keywords":[] } ]\n` +
      `}\nSepara bien responsabilidades (qué harás) de qualifications (qué piden). No inventes.`,
      JOB_SYS,
      undefined,
      4000
    )
    const data = parsed as unknown as JobPosting
    const v = validateJob(data)
    if (!v.valid) return { ok: false, errors: v.errors, data }
    return { ok: true, data }
  } catch (e: unknown) {
    return { ok: false, error: (e instanceof Error && e.message) || 'No se pudo estructurar la oferta.' }
  }
}

/**
 * Estructura una oferta a partir de una URL (la descarga de forma segura con el
 * Oracle Connector si está disponible, y luego la parsea).
 */
export async function structureJobFromUrl(url: string): Promise<StructureResult<JobPosting>> {
  try {
    let text = ''
    try {
      const { fetchJSON } = await import('../oracle/oracleConnector')
      // El oracle valida anti-SSRF; aquí la mayoría de ofertas son HTML, así que
      // si no es JSON el oracle devuelve { __raw_text }.
      const data: any = await fetchJSON(url, { timeoutMs: 12000 })
      text = typeof data?.__raw_text === 'string' ? data.__raw_text : JSON.stringify(data)
    } catch {
      // Fallback: fetch directo con saneo de HTML.
      const res = await fetch(url, { headers: { 'User-Agent': 'DAYA-Career/1.0' } })
      if (!res.ok) return { ok: false, error: `No se pudo leer la URL (${res.status}).` }
      text = (await res.text()).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    }
    if (!text || text.length < 40) return { ok: false, error: 'No se obtuvo contenido útil de la URL.' }
    return structureJob(text.slice(0, 10000))
  } catch (e: unknown) {
    return { ok: false, error: (e instanceof Error && e.message) || 'No se pudo procesar la URL.' }
  }
}
