// ============================================
// DAYA IA — GitHub Scout
// --------------------------------------------------------------------------
// Busca soluciones de código abierto en GitHub, extrae fragmentos útiles o
// librerías, y los adapta al entorno de DAYA (TypeScript + Express + Prisma).
//
// Flujo:
//   1) Busca repos por consulta (GitHub Search API, sin key → con rate limit;
//      si configuras GITHUB_TOKEN sube el límite y se usa automáticamente).
//   2) Para un repo elegido, lista archivos de código relevantes y trae el
//      contenido de uno (vía API raw).
//   3) "Adapta" un fragmento al entorno local con IA: corrige imports, estilo
//      y tipos para que encaje en el stack de DAYA.
//
// IMPORTANTE (licencias): el código que se encuentra en GitHub tiene SU PROPIA
// licencia. Scout NO copia a ciegas: cada resultado incluye la licencia detectada
// y una advertencia. La adaptación es una AYUDA para entender/portar, no una
// autorización para reusar sin respetar la licencia de origen.
//
// Todas las funciones devuelven JSON. Implementación propia en TypeScript.
// ============================================

import { chatJSON } from '../../services/openrouter'

const GH_API = 'https://api.github.com'

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DAYA-Scout/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  // Si hay token en el entorno, se usa (más cuota). Nunca se expone al cliente.
  const token = process.env.GITHUB_TOKEN
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function ghFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: ghHeaders() })
  if (res.status === 403) {
    throw new Error('Límite de la API de GitHub alcanzado. Configura GITHUB_TOKEN para más cuota.')
  }
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}.`)
  return res.json()
}

// ── 1) Búsqueda de repositorios ──────────────────────────────────────────────

export interface ScoutRepo {
  fullName: string
  description: string
  stars: number
  language: string | null
  license: string | null
  url: string
  updatedAt: string
  topics?: string[]
}

export interface SearchResult {
  ok: boolean
  error?: string
  query: string
  repos: ScoutRepo[]
}

/**
 * Busca repos por una consulta. `lang` opcional acota por lenguaje.
 * Ordena por estrellas (calidad/confianza como proxy).
 */
export async function searchRepos(query: string, lang = '', limit = 8): Promise<SearchResult> {
  if (!query || !query.trim()) return { ok: false, error: 'Falta la consulta.', query, repos: [] }
  try {
    const q = encodeURIComponent(query.trim() + (lang ? ` language:${lang}` : ''))
    const data = await ghFetch(`${GH_API}/search/repositories?q=${q}&sort=stars&order=desc&per_page=${Math.min(limit, 15)}`)
    const repos: ScoutRepo[] = (data.items || []).map((r: any) => ({
      fullName: r.full_name,
      description: r.description || '',
      stars: r.stargazers_count,
      language: r.language,
      license: r.license?.spdx_id || r.license?.name || null,
      url: r.html_url,
      updatedAt: r.updated_at,
      topics: r.topics || [],
    }))
    return { ok: true, query, repos }
  } catch (e: unknown) {
    return { ok: false, error: (e instanceof Error && e.message) || 'La búsqueda falló.', query, repos: [] }
  }
}

// ── 2) Explorar archivos de un repo y traer contenido ────────────────────────

export interface RepoFile { path: string; type: 'file' | 'dir'; size?: number }

export interface TreeResult { ok: boolean; error?: string; files: RepoFile[]; defaultBranch?: string }

// Lista los archivos del repo (árbol recursivo), filtrando a código relevante.
export async function listFiles(fullName: string, maxFiles = 60): Promise<TreeResult> {
  try {
    const meta = await ghFetch(`${GH_API}/repos/${fullName}`)
    const branch = meta.default_branch || 'main'
    const tree = await ghFetch(`${GH_API}/repos/${fullName}/git/trees/${branch}?recursive=1`)
    const CODE = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|c|cpp|h|cs|md)$/i
    const files: RepoFile[] = (tree.tree || [])
      .filter((n: any) => n.type === 'blob' && CODE.test(n.path) && !/node_modules\//.test(n.path))
      .slice(0, maxFiles)
      .map((n: any) => ({ path: n.path, type: 'file' as const, size: n.size }))
    return { ok: true, files, defaultBranch: branch }
  } catch (e: unknown) {
    return { ok: false, error: (e instanceof Error && e.message) || 'No se pudo leer el repositorio.', files: [] }
  }
}

export interface FileContent { ok: boolean; error?: string; path?: string; content?: string; license?: string | null }

// Trae el contenido de un archivo concreto (vía raw, con tope de tamaño).
export async function getFile(fullName: string, filePath: string, branch = ''): Promise<FileContent> {
  try {
    const meta = branch ? { default_branch: branch } : await ghFetch(`${GH_API}/repos/${fullName}`)
    const ref = branch || meta.default_branch || 'main'
    const rawUrl = `https://raw.githubusercontent.com/${fullName}/${ref}/${filePath}`
    const res = await fetch(rawUrl, { headers: { 'User-Agent': 'DAYA-Scout/1.0' } })
    if (!res.ok) throw new Error(`No se pudo descargar el archivo (${res.status}).`)
    const buf = await res.text()
    if (buf.length > 200_000) {
      return { ok: false, error: 'El archivo es demasiado grande para inspeccionarlo aquí.' }
    }
    // Licencia del repo (para la advertencia)
    let license: string | null = null
    try { const m = await ghFetch(`${GH_API}/repos/${fullName}`); license = m.license?.spdx_id || null } catch {}
    return { ok: true, path: filePath, content: buf, license }
  } catch (e: unknown) {
    return { ok: false, error: (e instanceof Error && e.message) || 'No se pudo obtener el archivo.' }
  }
}

// ── 3) Adaptar un fragmento al entorno de DAYA ───────────────────────────────

export interface AdaptResult {
  ok: boolean
  error?: string
  adapted?: string
  notes?: string
  licenseWarning?: string
}

/**
 * Toma un fragmento de código externo y lo adapta al stack de DAYA
 * (TypeScript estricto, Express, Prisma, OpenRouter). Devuelve el código
 * portado + notas. SIEMPRE incluye la advertencia de licencia de origen.
 */
export async function adaptSnippet(
  code: string,
  sourceLicense: string | null = null,
  intent = ''
): Promise<AdaptResult> {
  if (!code || !code.trim()) return { ok: false, error: 'Falta el código a adaptar.' }
  try {
    const parsed = await chatJSON(
      `Adapta este fragmento al entorno de DAYA IA: TypeScript estricto, backend Express + Prisma, IA vía un helper \`chatJSON\`/\`chatStream\` (OpenRouter). ${intent ? `Objetivo: ${intent}.` : ''}\n\nCódigo original:\n\`\`\`\n${code.slice(0, 8000)}\n\`\`\`\n\nResponde SOLO con JSON:\n{ "adapted": "código TypeScript adaptado, idiomático y tipado", "notes": "qué cambiaste y cómo integrarlo, en español, breve" }`,
      'Eres un ingeniero senior de TypeScript. Adaptas código de otros lenguajes/estilos al stack del usuario, con tipos correctos e imports válidos. No inventas APIs. Respondes SOLO en JSON.',
      undefined,
      6000
    )
    const licenseWarning = sourceLicense
      ? `El código de origen está bajo licencia ${sourceLicense}. Respeta sus términos (atribución, copyleft, etc.) antes de reutilizarlo en producción.`
      : 'No se pudo determinar la licencia de origen. Verifícala en el repositorio antes de reutilizar el código.'
    return {
      ok: true,
      adapted: String(parsed?.adapted || ''),
      notes: String(parsed?.notes || ''),
      licenseWarning,
    }
  } catch (e: unknown) {
    return { ok: false, error: (e instanceof Error && e.message) || 'La adaptación falló.' }
  }
}
