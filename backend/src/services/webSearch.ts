// ============================================
// DAYA IA — Web search service (Deep Research)
// Uses Tavily (generous free plan, ideal for research)
// ============================================

export interface SearchResult {
  title: string
  url: string
  content: string
}

function getTavilyKey(): string | null {
  const key = process.env.TAVILY_API_KEY
  if (key && !key.includes('PON-TU') && key.trim()) return key
  return null
}

function getBraveKey(): string | null {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (key && !key.includes('PON-TU') && key.trim()) return key
  return null
}

export function isWebSearchConfigured(): boolean {
  return true
}

// In-memory cache: avoids repeated searches (valid for 1 hour)
const searchCache = new Map<string, { results: SearchResult[]; expires: number }>()
const CACHE_TTL = 60 * 60 * 1000

// Strips HTML tags and normalizes whitespace
function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

// ── Brave Search API (2 000 búsquedas/mes gratis; el proveedor más fiable sin Tavily) ──
async function braveSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const key = getBraveKey()
  if (!key) return []
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(maxResults, 20)}&search_lang=es&ui_lang=es-ES`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
    })
    if (!res.ok) return []
    const data: any = await res.json()
    return (data?.web?.results || []).slice(0, maxResults).map((r: any) => ({
      title: String(r.title || ''),
      url: String(r.url || ''),
      content: String(r.description || '').slice(0, 800),
    }))
  } catch { return [] }
}

// ── FREE fallback without API key: DuckDuckGo Lite + Instant Answer + Wikipedia ──
async function freeSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const out: SearchResult[] = []

  // 1) DuckDuckGo Lite (more scraping-friendly than the main HTML)
  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
    })
    if (res.ok) {
      const html = await res.text()
      // DDG Lite: <a class="result-link" href="...">título</a> seguido de <td class="result-snippet">
      const rowRe = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi
      let m: RegExpExecArray | null
      while ((m = rowRe.exec(html)) && out.length < maxResults) {
        let url = m[1]
        const ud = url.match(/[?&]uddg=([^&]+)/)
        if (ud) { try { url = decodeURIComponent(ud[1]) } catch {} }
        if (!url.startsWith('http')) continue
        const title = stripHtml(m[2]).trim()
        const snippet = stripHtml(m[3]).trim()
        if (title) out.push({ title, url, content: snippet })
      }
    }
  } catch { /* sigue */ }

  // 2) Classic DuckDuckGo HTML as a second attempt
  if (!out.length) {
    try {
      const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
      })
      if (res.ok) {
        const html = await res.text()
        const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis
        const snipRe = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gis
        const snippets: string[] = []
        let sm: RegExpExecArray | null
        while ((sm = snipRe.exec(html))) snippets.push(stripHtml(sm[1]))
        let lm: RegExpExecArray | null; let idx = 0
        while ((lm = linkRe.exec(html)) && out.length < maxResults) {
          let url = lm[1]
          const ud = url.match(/[?&]uddg=([^&]+)/)
          if (ud) { try { url = decodeURIComponent(ud[1]) } catch {} }
          else if (url.startsWith('//')) url = 'https:' + url
          const title = stripHtml(lm[2])
          if (title && url.startsWith('http')) out.push({ title, url, content: snippets[idx] || '' })
          idx++
        }
      }
  } catch { /* continue */ }
  }

  if (out.length) return out.slice(0, maxResults)

  // 3) DuckDuckGo Instant Answer (official JSON, no API key)
  try {
    const res = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&no_redirect=1&skip_disambig=1')
    const data: any = await res.json()
    if (data.AbstractText) out.push({ title: data.Heading || query, url: data.AbstractURL || '', content: data.AbstractText })
    for (const t of (data.RelatedTopics || [])) {
      if (out.length >= maxResults) break
      if (t.Text && t.FirstURL) out.push({ title: stripHtml(t.Text).slice(0, 90), url: t.FirstURL, content: stripHtml(t.Text) })
    }
  } catch { /* sigue */ }
  if (out.length) return out.slice(0, maxResults)

  // 4) Wikipedia (es + en) — very reliable for topics and entities
  try {
    const esRes = await fetch('https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(query) + '&format=json&srlimit=' + maxResults + '&origin=*')
    const esData: any = await esRes.json()
    for (const s of (esData?.query?.search || [])) {
      out.push({ title: s.title, url: 'https://es.wikipedia.org/wiki/' + encodeURIComponent(String(s.title).replace(/ /g, '_')), content: stripHtml(s.snippet) })
    }
  } catch { /* no results */ }
  return out.slice(0, maxResults)
}

// Runs a web search and returns clean results
export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  const q = String(query || '').trim()
  if (!q) return []

  // Check cache first
  const cacheKey = q.toLowerCase()
  const cached = searchCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.results

  const tavilyKey = getTavilyKey()
  let results: SearchResult[] = []

  // 1) Tavily (best quality) if key is available
  if (tavilyKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query: q, search_depth: 'basic', max_results: maxResults, include_answer: false }),
      })
      const data: any = await res.json()
      if (data.results?.length) {
        results = data.results.map((r: any) => ({
          title: r.title || 'Sin título',
          url: r.url || '',
          content: (r.content || '').slice(0, 2000),
        }))
      }
    } catch (err: any) {
      console.error('❌ Error Tavily, intentando Brave:', err.message)
    }
  }

  // 2) Brave Search (2 000/mes gratis; requiere BRAVE_SEARCH_API_KEY en .env)
  if (!results.length) {
    results = await braveSearch(q, maxResults).catch(() => [])
  }

  // 3) Free fallback (DuckDuckGo Lite + Instant Answer + Wikipedia)
  if (!results.length) {
    results = await freeSearch(q, maxResults).catch(() => [])
  }

  if (results.length) searchCache.set(cacheKey, { results, expires: Date.now() + CACHE_TTL })
  return results
}

// Fallback sub-queries (if the AI does not respond)
export function buildSubQueries(topic: string): string[] {
  return [
    topic,
    `${topic} datos estadísticas recientes`,
    `${topic} análisis tendencias actuales`,
  ]
}

// Generates smart sub-queries from a topic using AI.
// Breaks the topic into 4-5 distinct and specific search angles.
// If AI fails, falls back to generic sub-queries.
export async function buildSmartSubQueries(topic: string): Promise<string[]> {
  try {
    const { chatJSON } = await import('./openrouter')
    const systemPrompt = `Eres un estratega de investigación. Dado un tema, generas sub-consultas de búsqueda web precisas y complementarias que cubren distintos ángulos (datos/estadísticas, contexto actual, casos o ejemplos, perspectivas opuestas, marco regulatorio si aplica). Respondes SOLO en JSON.`
    const prompt = `Tema: "${topic}"

Genera entre 4 y 5 sub-consultas de búsqueda web en español, cortas y específicas, que al combinarse den una visión completa del tema. Cada una debe enfocar un ángulo distinto. Responde SOLO con JSON:
{ "queries": ["consulta 1", "consulta 2", "consulta 3", "consulta 4"] }`

    const parsed = await chatJSON(prompt, systemPrompt, 'deepseek/deepseek-v4-pro')
    const queries = Array.isArray(parsed?.queries)
      ? parsed.queries.filter((q: any) => typeof q === 'string' && q.trim()).slice(0, 5)
      : []
    // Siempre incluir el tema original como primera consulta
    const unique = Array.from(new Set([topic, ...queries]))
    return unique.length >= 2 ? unique : buildSubQueries(topic)
  } catch {
    return buildSubQueries(topic)
  }
}
