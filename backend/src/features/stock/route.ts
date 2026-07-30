import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'

// Banco de fotos vía Openverse (https://api.openverse.org): fotos con licencia
// abierta, búsqueda gratuita y SIN API key. Dos rutas:
//  - GET /api/stock?q=…      → búsqueda (requiere sesión)
//  - GET /api/stock/img?url= → proxy de la imagen con CORS abierto, para que el
//    lienzo Konva pueda exportar sin teñirse. Sin auth (el <img> del navegador
//    no puede mandar el token), pero acotado: solo https, solo content-type
//    image/*, sin hosts locales/IP y con tope de 12 MB.

const router = Router()
const UA = process.env.USER_AGENT || 'DayaIA/1.0'

// ── Generación de imagen IA (fal.ai multi-modelo) con fallback a Pollinations ──
// GET /api/stock/gen?prompt=&w=&h=&model= → genera (o recupera de cache) y devuelve
// la imagen con CORS abierto, para que el <img> del lienzo la cargue y exporte
// limpio. Publica (el <img> no manda token) pero protegida: throttle por IP +
// cache por modelo+prompt+tamaño (reabrir un diseño NO vuelve a pagar) + tope.
// MODELOS (cada uno su especialidad, todos en fal.ai con la misma FAL_KEY):
//   flux      → fotos y fondos (rápido y barato, por defecto)
//   recraft   → logos, iconos e ilustración vectorial/flat con marca coherente
//   ideogram  → carteles/imágenes con TEXTO legible dentro
// Si no hay FAL_KEY o el modelo falla, cae a Pollinations → nunca se rompe.
const genCache = new Map<string, { url: string; t: number }>()
const GEN_TTL = 6 * 60 * 60 * 1000   // 6 h: dentro de la ventana, misma imagen sin re-generar
const genHits = new Map<string, { n: number; t: number }>()
function genThrottle(ip: string, max = 40, win = 60_000): boolean {
  const now = Date.now(); const h = genHits.get(ip)
  if (!h || now - h.t > win) { genHits.set(ip, { n: 1, t: now }); return true }
  if (h.n >= max) return false
  h.n++; return true
}
// Throttle extra, más estricto, para los modelos CAROS (protege créditos).
const genHitsPro = new Map<string, { n: number; t: number }>()
function genThrottlePro(ip: string, max = 15, win = 60_000): boolean {
  const now = Date.now(); const h = genHitsPro.get(ip)
  if (!h || now - h.t > win) { genHitsPro.set(ip, { n: 1, t: now }); return true }
  if (h.n >= max) return false
  h.n++; return true
}

// Aproxima el aspect ratio (ancho×alto) al enum admitido por Ideogram.
function nearestAspect(w: number, h: number): string {
  const r = w / h
  const opts: [string, number][] = [['1:1', 1], ['16:9', 16 / 9], ['9:16', 9 / 16], ['4:3', 4 / 3], ['3:4', 3 / 4], ['3:2', 3 / 2], ['2:3', 2 / 3]]
  return opts.reduce((best, o) => Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best, opts[0])[0]
}

// Llama a fal.ai según el modelo elegido y devuelve la URL de la imagen (o '').
async function falGenerate(model: string, prompt: string, w: number, h: number, falKey: string): Promise<string> {
  let endpoint = 'https://fal.run/fal-ai/flux/schnell'
  let body: any = { prompt, image_size: { width: w, height: h }, num_images: 1, num_inference_steps: 4, enable_safety_checker: true }
  if (model === 'recraft') {
    endpoint = 'https://fal.run/fal-ai/recraft-v3'
    body = { prompt, image_size: { width: w, height: h }, style: 'digital_illustration' }
  } else if (model === 'ideogram') {
    endpoint = 'https://fal.run/fal-ai/ideogram/v2'
    body = { prompt, aspect_ratio: nearestAspect(w, h), expand_prompt: true, style: 'design' }
  }
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) { const j: any = await r.json(); const u = j?.images?.[0]?.url; return typeof u === 'string' ? u : '' }
    console.warn(`[fal.gen:${model}] status`, r.status)
  } catch (e: any) { console.warn(`[fal.gen:${model}] error`, e?.message) }
  return ''
}

router.get('/gen', async (req, res) => {
  try {
    const ip = String((req as any).ip || req.socket.remoteAddress || 'x')
    if (!genThrottle(ip)) return res.status(429).end()
    const prompt = String(req.query.prompt || '').slice(0, 700).trim()
    if (!prompt) return res.status(400).end()
    const w = Math.min(1440, Math.max(256, Math.round(Number(req.query.w) || 1024)))
    const h = Math.min(1440, Math.max(256, Math.round(Number(req.query.h) || 1024)))
    const reqModel = String(req.query.model || '')
    const model = ['flux', 'recraft', 'ideogram'].includes(reqModel) ? reqModel : 'flux'
    const expensive = model === 'recraft' || model === 'ideogram'
    if (expensive && !genThrottlePro(ip)) return res.status(429).end()
    const key = `${model}:${w}x${h}:${prompt}`

    let outUrl = ''
    const cached = genCache.get(key)
    if (cached && Date.now() - cached.t < GEN_TTL) outUrl = cached.url

    if (!outUrl) {
      const falKey = process.env.FAL_KEY
      if (falKey) outUrl = await falGenerate(model, prompt, w, h, falKey)
      if (!outUrl) {
        const seed = Math.floor(Math.random() * 9999999)
        outUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`
      }
      genCache.set(key, { url: outUrl, t: Date.now() })
      if (genCache.size > 500) { for (const k of genCache.keys()) { genCache.delete(k); if (genCache.size <= 400) break } }
    }

    const ir = await fetch(outUrl, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    if (!ir.ok) return res.status(502).end()
    const ct = ir.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) return res.status(502).end()
    const buf = Buffer.from(await ir.arrayBuffer())
    res.setHeader('Content-Type', ct)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(buf)
  } catch { res.status(500).end() }
})

router.get('/img', async (req, res) => {
  try {
    const url = String(req.query.url || '')
    let parsed: URL
    try { parsed = new URL(url) } catch { return res.status(400).end() }
    const host = parsed.hostname.toLowerCase()
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')
    if (parsed.protocol !== 'https:' || isIp || host === 'localhost' || host.endsWith('.local') || (parsed.port && parsed.port !== '443')) {
      return res.status(400).end()
    }
    const r = await fetch(parsed.href, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    if (!r.ok) return res.status(502).end()
    const ct = r.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) return res.status(400).end()
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 12_000_000) return res.status(413).end()
    res.setHeader('Content-Type', ct)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(buf)
  } catch { res.status(500).end() }
})

router.get('/', requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80)
    if (!q) return res.json({ results: [] })
    const u = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=24&license_type=commercial&filter_dead=true`
    const r = await fetch(u, { headers: { 'User-Agent': UA } })
    if (!r.ok) return res.status(502).json({ error: 'stock_failed' })
    const j: any = await r.json()
    const results = (Array.isArray(j?.results) ? j.results : []).map((x: any) => ({
      id: x.id,
      thumb: x.thumbnail || x.url,
      url: x.url,
      title: x.title || '',
      creator: x.creator || '',
      license: x.license ? String(x.license).toUpperCase() : '',
    })).filter((x: any) => x.url)
    res.json({ results })
  } catch (e: any) {
    console.error('[stock GET] error:', e?.message || e)
    res.status(500).json({ error: 'stock_failed' })
  }
})

export default router
