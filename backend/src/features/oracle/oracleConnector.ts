// ============================================
// DAYA IA — Oracle Connector (intérprete universal de APIs y JSON)
// --------------------------------------------------------------------------
// Capacidad NUEVA: le da al agente la habilidad de consultar CUALQUIER API
// pública (o pegar un JSON gigante) y obtener de vuelta datos LIMPIOS y
// resumidos, listos para decidir — sin ahogarse en la respuesta cruda.
//
// Qué resuelve:
//   • Trae JSON de una URL (GET/POST) de forma SEGURA (anti-SSRF: bloquea IPs
//     internas, localhost, metadata de la nube, etc.).
//   • "Aplana" y resume estructuras enormes: detecta el esquema, recorta arrays
//     gigantes a una muestra, y produce un mapa legible de qué hay dentro.
//   • Extracción por ruta tipo JSONPath simple ("data.items[].name") sin librerías.
//   • Conectores de conveniencia ya listos: GitHub (repos/usuarios) y precios de
//     criptomonedas (CoinGecko), ambos sin API key.
//
// Pensado para usarse como herramienta del agente (features/agent/tools.ts):
// el modelo decide la URL/ruta y recibe texto compacto que sí cabe en contexto.
// Implementación propia en TypeScript, sin librerías externas.
// ============================================

// ── Seguridad: anti-SSRF ────────────────────────────────────────────────────
// Sin esto, un atacante podría pedirle al servidor que lea su propia red interna
// o el endpoint de metadata de la nube (robo de credenciales). Bloqueamos hosts
// peligrosos ANTES de hacer la petición.

function isUnsafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  // Metadata de proveedores cloud (AWS/GCP/Azure) — nunca accesible desde aquí.
  if (h === '169.254.169.254' || h === 'metadata.google.internal') return true
  // IPv4 privadas / loopback / link-local
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  if (/^0\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  // IPv6 loopback / link-local / unique-local
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true
  return false
}

function assertSafeUrl(rawUrl: string): URL {
  let u: URL
  try { u = new URL(rawUrl) } catch { throw new Error('URL no válida.') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Solo se permiten URLs http(s).')
  }
  if (isUnsafeHost(u.hostname)) {
    throw new Error('Acceso bloqueado a una dirección interna o privada.')
  }
  return u
}

// ── Fetch de JSON con límites de tamaño y tiempo ─────────────────────────────

export interface FetchOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
  timeoutMs?: number
  maxBytes?: number
}

export async function fetchJSON<T = unknown>(rawUrl: string, opts: FetchOptions = {}): Promise<T> {
  const u = assertSafeUrl(rawUrl)
  const timeoutMs = Math.min(opts.timeoutMs ?? 15000, 30000)
  const maxBytes = Math.min(opts.maxBytes ?? 4_000_000, 10_000_000) // 4 MB por defecto

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(u.toString(), {
      method: opts.method || 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DAYA-Oracle/1.0 (+https://daya.ia)',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`La API respondió ${res.status} ${res.statusText}.`)

    // Lee con tope de tamaño para no reventar la memoria con respuestas enormes.
    const text = await readCapped(res, maxBytes)
    try {
      return JSON.parse(text) as T
    } catch {
      // No era JSON: devolvemos el texto recortado para que el agente lo vea igual.
      return { __raw_text: text.slice(0, 20000), __note: 'La respuesta no era JSON válido.' } as T
    }
  } finally {
    clearTimeout(timer)
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return await res.text()
  const decoder = new TextDecoder('utf-8')
  let out = ''
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value?.length || 0
    if (value) out += decoder.decode(value, { stream: true })
    if (total > maxBytes) { try { await reader.cancel() } catch {}; break }
  }
  return out
}

// ── Inspección de esquema: "¿qué hay dentro de este JSON?" ───────────────────

export interface SchemaNode {
  type: string
  // Para objetos: claves y su tipo. Para arrays: tipo de los elementos + longitud.
  keys?: Record<string, string>
  itemType?: string
  length?: number
  sample?: unknown
}

// Describe la forma de un valor sin volcar todo su contenido.
export function describeSchema(value: unknown, depth = 0): SchemaNode {
  if (value === null) return { type: 'null' }
  if (Array.isArray(value)) {
    const itemType = value.length ? typeOf(value[0]) : 'unknown'
    return {
      type: 'array',
      length: value.length,
      itemType,
      sample: value.length ? trimValue(value[0], depth) : undefined,
    }
  }
  if (typeof value === 'object') {
    const keys: Record<string, string> = {}
    const rec = value as Record<string, unknown>
    for (const k of Object.keys(rec).slice(0, 40)) keys[k] = typeOf(rec[k])
    return { type: 'object', keys }
  }
  return { type: typeOf(value), sample: value }
}

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `array[${v.length}]`
  return typeof v
}

// Recorta un valor para muestra: arrays a 3 items, strings largos, anidación.
function trimValue(v: unknown, depth: number): unknown {
  if (depth > 3) return '…'
  if (Array.isArray(v)) return v.slice(0, 3).map(x => trimValue(x, depth + 1))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    const rec = v as Record<string, unknown>
    for (const k of Object.keys(rec).slice(0, 12)) out[k] = trimValue(rec[k], depth + 1)
    return out
  }
  if (typeof v === 'string' && v.length > 200) return v.slice(0, 200) + '…'
  return v
}

// ── Extracción por ruta (JSONPath simplificado) ─────────────────────────────
// Soporta: "a.b.c", índices "a.0.b", y "a[].b" (mapea sobre cada elemento).

export function extractPath(data: unknown, path: string): unknown {
  if (!path) return data
  const parts = path.replace(/\[(\d+)\]/g, '.$1').replace(/\[\]/g, '.[]').split('.').filter(Boolean)
  let cur: unknown = data
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (cur == null) return undefined
    if (p === '[]') {
      if (!Array.isArray(cur)) return undefined
      const rest = parts.slice(i + 1).join('.')
      return cur.map(item => (rest ? extractPath(item, rest) : item))
    }
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

// ── Resumen "listo para decidir" ─────────────────────────────────────────────
// Produce un texto compacto que un modelo puede consumir sin desbordarse.

export function summarizeForAgent(data: unknown, opts: { path?: string; maxChars?: number } = {}): string {
  const maxChars = opts.maxChars ?? 4000
  const target = opts.path ? extractPath(data, opts.path) : data
  const schema = describeSchema(target)

  let out = ''
  if (schema.type === 'array') {
    out += `Lista de ${schema.length} elementos (tipo: ${schema.itemType}).\n`
    out += `Ejemplo del primer elemento:\n${JSON.stringify(schema.sample, null, 2)}\n`
  } else if (schema.type === 'object') {
    out += `Objeto con campos: ${Object.entries(schema.keys || {}).map(([k, t]) => `${k} (${t})`).join(', ')}.\n`
    out += `Contenido (recortado):\n${JSON.stringify(trimValue(target, 0), null, 2)}\n`
  } else {
    out += `Valor (${schema.type}): ${JSON.stringify(schema.sample)}\n`
  }
  return out.length > maxChars ? out.slice(0, maxChars) + '\n…(recortado)' : out
}

// ── Conectores de conveniencia (sin API key) ─────────────────────────────────

// GitHub: info de un repositorio "owner/name" o de un usuario "@usuario".
interface GithubData {
  full_name?: string
  description?: string
  stargazers_count?: number
  forks_count?: number
  open_issues_count?: number
  language?: string
  updated_at?: string
  license?: { name?: string }
  login?: string
  name?: string
  bio?: string
  public_repos?: number
  followers?: number
  company?: string
  location?: string
}

export async function github(query: string): Promise<string> {
  const q = query.trim().replace(/^@/, '')
  const isRepo = q.includes('/')
  const url = isRepo
    ? `https://api.github.com/repos/${encodeURIComponent(q.split('/')[0])}/${encodeURIComponent(q.split('/')[1])}`
    : `https://api.github.com/users/${encodeURIComponent(q)}`
  const data = await fetchJSON<GithubData>(url)
  if (isRepo) {
    return [
      `Repositorio: ${data.full_name}`,
      data.description ? `Descripción: ${data.description}` : '',
      `⭐ Estrellas: ${data.stargazers_count} · Forks: ${data.forks_count} · Issues abiertos: ${data.open_issues_count}`,
      `Lenguaje principal: ${data.language || 'n/d'}`,
      `Última actualización: ${data.updated_at}`,
      data.license?.name ? `Licencia: ${data.license.name}` : '',
    ].filter(Boolean).join('\n')
  }
  return [
    `Usuario: ${data.login}${data.name ? ` (${data.name})` : ''}`,
    data.bio ? `Bio: ${data.bio}` : '',
    `Repos públicos: ${data.public_repos} · Seguidores: ${data.followers}`,
    data.company ? `Empresa: ${data.company}` : '',
    data.location ? `Ubicación: ${data.location}` : '',
  ].filter(Boolean).join('\n')
}

// Precio de criptomonedas (CoinGecko, gratuito). ids: "bitcoin,ethereum".
export async function cryptoPrice(ids: string, vs = 'usd'): Promise<string> {
  const safeIds = ids.split(',').map(s => encodeURIComponent(s.trim())).join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${safeIds}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`
  const data = await fetchJSON<Record<string, Record<string, number>>>(url)
  const lines: string[] = []
  for (const [id, info] of Object.entries(data)) {
    const price = info[vs]
    const change = info[`${vs}_24h_change`]
    lines.push(`${id}: ${price} ${vs.toUpperCase()}${typeof change === 'number' ? ` (${change >= 0 ? '+' : ''}${change.toFixed(2)}% 24h)` : ''}`)
  }
  return lines.length ? lines.join('\n') : 'No se encontraron precios para esos identificadores.'
}

// ── Punto de entrada genérico para el agente ─────────────────────────────────
// Una sola función que el agente puede llamar con una intención de alto nivel.

export interface OracleQuery {
  url?: string                 // API arbitraria
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
  path?: string                // ruta de extracción opcional
  connector?: 'github' | 'crypto'
  arg?: string                 // argumento para el conector
}

export async function ask(query: OracleQuery): Promise<string> {
  // Conectores con formato bonito
  if (query.connector === 'github') return github(query.arg || '')
  if (query.connector === 'crypto') return cryptoPrice(query.arg || '')

  // API genérica
  if (!query.url) throw new Error('Falta la URL o el conector.')
  const data = await fetchJSON(query.url, { method: query.method, headers: query.headers, body: query.body })
  return summarizeForAgent(data, { path: query.path })
}
