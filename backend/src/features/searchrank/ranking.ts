// ============================================
// DAYA IA — Re-ranking de resultados de búsqueda (híbrido)
// --------------------------------------------------------------------------
// Capacidad NUEVA y propia de DAYA. Toma los resultados crudos que ya
// devuelve `services/webSearch.ts` (Tavily / DuckDuckGo / Wikipedia) y los
// REORDENA por una puntuación combinada:
//
//     score = título·0.45 + snippet·0.25 + dominio·0.20 + recencia·0.10
//
// La idea (relevancia + autoridad de dominio + frescura) es un patrón clásico
// de recuperación de información; esta implementación está escrita desde cero
// en TypeScript para DAYA, sin tomar código de terceros (clean-room).
//
// NO modifica webSearch.ts: es una capa OPCIONAL que se aplica encima.
// Si algo falla, devuelve los resultados en su orden original (nunca rompe).
// ============================================

import type { SearchResult } from '../../services/webSearch'
import { tokenize } from '../../utils/nlp'
import { domainOf } from '../../utils/url'

// Resultado enriquecido: SearchResult + metadatos de puntuación (para depurar/UI)
export interface RankedResult extends SearchResult {
  score: number
  // Desglose, útil para mostrar "por qué" subió un resultado (opcional en UI)
  breakdown?: {
    title: number
    snippet: number
    domain: number
    recency: number
  }
  publishedAt?: string // fecha ISO si la fuente la trae
}

// Opciones de re-ranking
export interface RankOptions {
  // Pesos personalizables (deben sumar ~1; se normalizan igualmente)
  weights?: Partial<{ title: number; snippet: number; domain: number; recency: number }>
  // Si true, conserva el desglose por resultado (útil para depurar/UI)
  withBreakdown?: boolean
  // "now" inyectable para tests deterministas
  now?: Date
}

const DEFAULT_WEIGHTS = { title: 0.45, snippet: 0.25, domain: 0.20, recency: 0.10 }

// ── Léxicos de apoyo ──────────────────────────────────────────────────────
// Pistas de que la consulta es de NOTICIAS (es/en) → prioriza recencia/dominios news.
const NEWS_HINTS = new Set([
  'noticia', 'noticias', 'última', 'ultimas', 'últimas', 'hoy', 'reciente', 'recientes',
  'actualidad', 'breaking', 'news', 'latest', 'today', 'headlines',
])

// Dominios de noticias de confianza (es + internacionales). Suman autoridad.
const TRUSTED_NEWS = new Set([
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'elpais.com', 'elmundo.es',
  'lavanguardia.com', 'clarin.com', 'lanacion.com.ar', 'eluniversal.com.mx',
  'theguardian.com', 'nytimes.com', 'dw.com', 'euronews.com', 'france24.com',
])

// Dominios de poco valor para consultas informativas (contenido ligero/SEO).
const LOW_VALUE = new Set([
  'facebook.com', 'm.facebook.com', 'pinterest.com', 'quora.com',
  'yahoo.com', 'msn.com',
])

// TLDs académicos/gubernamentales de varios países → máxima autoridad.
const GOV_EDU_SUFFIXES = [
  '.gov', '.edu', '.mil', '.int',
  '.gob.es', '.gob.mx', '.gob.pe', '.gob.ar', '.gov.co', '.gov.uk',
  '.edu.pe', '.edu.mx', '.edu.co', '.edu.ar', '.ac.uk', '.edu.es',
]

function isGovEdu(domain: string): boolean {
  return GOV_EDU_SUFFIXES.some(s => domain === s.slice(1) || domain.endsWith(s))
}


// ¿`term` aparece en `text` como palabra completa? (evita "sport" dentro de "transport")
function hasWord(haystackTokens: Set<string>, term: string): boolean {
  return haystackTokens.has(term)
}

// Puntúa cuántos términos de la consulta aparecen en el título (0..1).
function titleScore(queryTerms: string[], title: string): number {
  if (!title || !queryTerms.length) return 0
  const titleTokens = new Set(tokenize(title, 2))
  const hits = queryTerms.filter(t => hasWord(titleTokens, t)).length
  return hits / queryTerms.length
}

// Puntúa el snippet: mezcla cobertura de términos + un factor de longitud (0..1).
function snippetScore(queryTerms: string[], snippet: string): number {
  if (!snippet) return 0
  const tokens = new Set(tokenize(snippet, 2))
  const termFactor = queryTerms.length
    ? queryTerms.filter(t => hasWord(tokens, t)).length / queryTerms.length
    : 0
  const lengthFactor = Math.min(snippet.length, 240) / 240 // snippets muy cortos valen menos
  return (termFactor * 0.7) + (lengthFactor * 0.3)
}

// Autoridad del dominio (0..1). .gov/.edu y news de confianza arriba; basura abajo.
function domainScore(url: string, isNewsQuery: boolean): number {
  const d = domainOf(url)
  if (!d) return 0.3
  if (LOW_VALUE.has(d)) return 0.15
  if (TRUSTED_NEWS.has(d)) return isNewsQuery ? 1.0 : 0.85
  if (isGovEdu(d)) return 1.0
  if (d.endsWith('.org')) return 0.7
  if (d.endsWith('wikipedia.org')) return 0.75 // sólida para entidades/temas
  return 0.45
}

// Recencia (0..1): 1.0 si ≤7 días, 0.0 si ≥45 días, lineal en medio.
// Sólo aplica si la fuente trae fecha; si no, devuelve 0 (neutro).
function recencyScore(publishedAt: string | undefined, now: Date): number {
  if (!publishedAt) return 0
  const t = Date.parse(publishedAt)
  if (Number.isNaN(t)) return 0
  const days = (now.getTime() - t) / (1000 * 60 * 60 * 24)
  if (days <= 7) return 1
  if (days >= 45) return 0
  return (45 - days) / 38
}

// Normaliza los pesos para que sumen 1 (tolera que el usuario pase pesos raros).
function normalizeWeights(w: typeof DEFAULT_WEIGHTS): typeof DEFAULT_WEIGHTS {
  const sum = w.title + w.snippet + w.domain + w.recency
  if (sum <= 0) return { ...DEFAULT_WEIGHTS }
  return {
    title: w.title / sum,
    snippet: w.snippet / sum,
    domain: w.domain / sum,
    recency: w.recency / sum,
  }
}

// ── API principal ─────────────────────────────────────────────────────────

/**
 * Reordena una lista de resultados de búsqueda por relevancia combinada.
 * Entrada y salida usan el MISMO tipo SearchResult de DAYA (más campos extra),
 * así que es 100% compatible con cualquier código que ya consuma searchWeb().
 */
export function rankResults(
  query: string,
  results: SearchResult[],
  opts: RankOptions = {}
): RankedResult[] {
  try {
    if (!Array.isArray(results) || results.length === 0) return []
    const now = opts.now ?? new Date()
    const weights = normalizeWeights({ ...DEFAULT_WEIGHTS, ...(opts.weights || {}) })

    const queryTerms = tokenize(query, 2)
    const isNewsQuery = queryTerms.some(t => NEWS_HINTS.has(t))

    const ranked: RankedResult[] = results.map(r => {
      const pub = (r as any).publishedAt as string | undefined
      const tScore = titleScore(queryTerms, r.title)
      const sScore = snippetScore(queryTerms, r.content)
      const dScore = domainScore(r.url, isNewsQuery)
      const rScore = recencyScore(pub, now)

      const score =
        tScore * weights.title +
        sScore * weights.snippet +
        dScore * weights.domain +
        rScore * weights.recency

      const out: RankedResult = { ...r, score, publishedAt: pub }
      if (opts.withBreakdown) {
        out.breakdown = { title: tScore, snippet: sScore, domain: dScore, recency: rScore }
      }
      return out
    })

    // Orden descendente por score; empate → conserva orden original (estable).
    return ranked
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (b.r.score - a.r.score) || (a.i - b.i))
      .map(x => x.r)
  } catch {
    // Ante cualquier error, no rompemos: devolvemos el orden original con score 0.
    return results.map(r => ({ ...r, score: 0 }))
  }
}

/**
 * Atajo: busca en la web (usando el servicio existente de DAYA) y devuelve
 * los resultados YA reordenados. Pensado para que el agente y el research
 * obtengan mejores fuentes sin cambiar su código de búsqueda.
 */
export async function searchAndRank(
  query: string,
  maxResults = 5,
  opts: RankOptions = {}
): Promise<RankedResult[]> {
  const { searchWeb } = await import('../../services/webSearch')
  const raw = await searchWeb(query, Math.max(maxResults, 8)).catch(() => [])
  const ranked = rankResults(query, raw, opts)
  return ranked.slice(0, maxResults)
}
