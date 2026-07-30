// ============================================
// DAYA IA — Esquema canónico de CV y oferta
// --------------------------------------------------------------------------
// Tipos canónicos para representar un currículum y una oferta de empleo como
// datos estructurados.
//
// La idea clave: tener AMBOS en una forma canónica permite que la IA los
// compare, adapte y genere documentos de forma fiable.
// ============================================

// ── CV (basado en JSON Resume) ───────────────────────────────────────────────

export interface ResumeBasics {
  name: string
  label?: string                 // titular profesional (p. ej. "Desarrollador")
  email?: string
  phone?: string
  url?: string
  summary?: string
  location?: { city?: string; region?: string; countryCode?: string; address?: string; postalCode?: string }
  profiles?: { network: string; username?: string; url?: string }[]
}

export interface WorkItem {
  name: string                   // empresa
  position?: string
  url?: string
  location?: string
  startDate?: string             // ISO (YYYY-MM-DD o YYYY-MM)
  endDate?: string
  summary?: string
  highlights?: string[]
}

export interface EducationItem {
  institution: string
  area?: string
  studyType?: string             // grado/máster…
  startDate?: string
  endDate?: string
  score?: string
  courses?: string[]
}

export interface SkillItem {
  name: string
  level?: string
  keywords?: string[]
}

export interface ProjectItem {
  name: string
  description?: string
  highlights?: string[]
  keywords?: string[]
  url?: string
  startDate?: string
  endDate?: string
}

export interface Resume {
  basics: ResumeBasics
  work?: WorkItem[]
  volunteer?: { organization: string; position?: string; summary?: string; highlights?: string[]; startDate?: string; endDate?: string }[]
  education?: EducationItem[]
  awards?: { title: string; date?: string; awarder?: string; summary?: string }[]
  certificates?: { name: string; date?: string; issuer?: string; url?: string }[]
  publications?: { name: string; publisher?: string; releaseDate?: string; url?: string; summary?: string }[]
  skills?: SkillItem[]
  languages?: { language: string; fluency?: string }[]
  interests?: { name: string; keywords?: string[] }[]
  references?: { name: string; reference?: string }[]
  projects?: ProjectItem[]
  meta?: Record<string, any>
}

// ── Oferta de empleo (basado en job-schema de JSON Resume) ───────────────────

export interface JobPosting {
  title: string
  company?: string
  type?: string                  // full-time, contract…
  date?: string
  description?: string
  location?: { city?: string; region?: string; countryCode?: string; address?: string }
  remote?: string                // "full" | "hybrid" | "none" | texto
  salary?: string
  experience?: string            // nivel/años requeridos
  responsibilities?: string[]
  qualifications?: string[]      // requisitos
  skills?: { name: string; level?: string; keywords?: string[] }[]
  meta?: Record<string, any>
}

// ── Validación ligera (sin dependencias) ─────────────────────────────────────

export interface ValidationResult { valid: boolean; errors: string[] }

export function validateResume(data: any): ValidationResult {
  const errors: string[] = []
  if (!data || typeof data !== 'object') return { valid: false, errors: ['El CV no es un objeto.'] }
  if (!data.basics || typeof data.basics !== 'object') errors.push('Falta la sección "basics".')
  else if (!data.basics.name || typeof data.basics.name !== 'string') errors.push('Falta basics.name.')

  // Arrays opcionales deben ser arrays si vienen.
  for (const key of ['work', 'education', 'skills', 'projects', 'languages']) {
    if (data[key] != null && !Array.isArray(data[key])) errors.push(`"${key}" debe ser una lista.`)
  }
  // Fechas en formato razonable (no estricto, solo aviso de forma).
  for (const w of data.work || []) {
    if (w.startDate && !isLooseDate(w.startDate)) errors.push(`Fecha inválida en work: "${w.startDate}".`)
  }
  return { valid: errors.length === 0, errors }
}

export function validateJob(data: any): ValidationResult {
  const errors: string[] = []
  if (!data || typeof data !== 'object') return { valid: false, errors: ['La oferta no es un objeto.'] }
  if (!data.title || typeof data.title !== 'string') errors.push('Falta el título de la oferta.')
  for (const key of ['responsibilities', 'qualifications', 'skills']) {
    if (data[key] != null && !Array.isArray(data[key])) errors.push(`"${key}" debe ser una lista.`)
  }
  return { valid: errors.length === 0, errors }
}

function isLooseDate(s: string): boolean {
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s) || /^\d{4}\/\d{1,2}/.test(s)
}

// Normaliza un CV: garantiza arrays presentes y recorta strings excesivos.
export function normalizeResume(data: any): Resume {
  const r: Resume = {
    basics: {
      name: String(data?.basics?.name || '').slice(0, 120),
      label: clip(data?.basics?.label, 120),
      email: clip(data?.basics?.email, 120),
      phone: clip(data?.basics?.phone, 40),
      url: clip(data?.basics?.url, 200),
      summary: clip(data?.basics?.summary, 2000),
      location: data?.basics?.location || undefined,
      profiles: Array.isArray(data?.basics?.profiles) ? data.basics.profiles.slice(0, 10) : undefined,
    },
    work: arr(data?.work),
    education: arr(data?.education),
    skills: arr(data?.skills),
    projects: arr(data?.projects),
    languages: arr(data?.languages),
    awards: arr(data?.awards),
    certificates: arr(data?.certificates),
    volunteer: arr(data?.volunteer),
    meta: data?.meta || undefined,
  }
  return r
}

function clip(v: any, n: number): string | undefined {
  if (v == null) return undefined
  return String(v).slice(0, n)
}
function arr<T>(v: any): T[] | undefined {
  return Array.isArray(v) ? v.slice(0, 50) : undefined
}
