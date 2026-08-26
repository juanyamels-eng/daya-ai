// ============================================
// DAYA IA — Lectura de URLs (sin agente)
// POST /api/read-url → lee una página web y responde el mensaje del usuario.
// Rescatado del readWebpageTool del agente para que el chat principal pueda
// "pegar un enlace → leerlo" sin depender de /api/agent/run.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { chatBurstLimiter } from '../../middleware/rateLimiter'
import { chatSingle } from '../../services/openrouter'
// OJO: jsdom se importa PEREZOSO (dentro de extractReadable), no aquí arriba. Sus
// dependencias internas ya tumbaron el servidor entero una vez (html-encoding-sniffer
// 6 + require(esm) en Node 20, jul-2026): si vuelven a romperse, que degrade solo la
// lectura de URLs, no el arranque de DAYA.
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { getBrowser } from '../../services/documents/pdfRenderer'

const router = Router()
router.use(requireAuth)

// Bloquea hosts internos/privados (copia self-contained: el original vivía en
// features/agent/tools.ts, que se elimina al quitar el agente).
function isUnsafeHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^::1$|^fe80:|^fc00:|^fd/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return false
}

// Extrae título + cuerpo legible de un HTML: Readability (artículo limpio) → Turndown
// (markdown con tablas) → fallback a stripper por regex. Compartido por la lectura
// estática (fetch) y la renderizada con navegador. jsdom NO ejecuta scripts (seguro).
async function extractReadable(html: string, baseUrl: string): Promise<{ title: string; text: string }> {
  let text = ''
  let title = ''
  try {
    const { JSDOM } = await import('jsdom')
    const dom = new JSDOM(html, { url: baseUrl })
    const article = new Readability(dom.window.document).parse()
    if (article) {
      title = (article.title || '').trim()
      // article.content = HTML del artículo ya limpio. Turndown lo pasa a markdown
      // (títulos, listas, enlaces, tablas) para que el modelo entienda la estructura.
      if (article.content) {
        try {
          const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
          td.use(gfm)        // sin esto, Turndown aplasta las tablas HTML a texto; gfm las pasa a markdown
          td.remove('img')   // fuera imágenes: al modelo le sirve el texto, no data-URIs gigantes
          const md = td.turndown(article.content).replace(/\n{3,}/g, '\n\n').trim()
          if (md.length > 200) text = md
        } catch {}
      }
      if (!text && article.textContent && article.textContent.trim().length > 200) {
        text = article.textContent.replace(/\s+/g, ' ').trim()
      }
    }
  } catch {}

  // Fallback: si no es un artículo (o Readability falla) → stripper por regex.
  if (!text) {
    text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#(\d+);/gi, (_, c) => String.fromCharCode(Number(c))).replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return { title, text }
}

// Renderiza una página con un navegador real (Puppeteer) para leer sitios con mucho
// JavaScript / SPAs que el fetch estático no puede. Reutiliza el Chromium ya compartido
// con el generador de PDF. Bloquea imágenes/media/fuentes (velocidad) y peticiones a
// hosts internos (defensa anti-SSRF extra, además de la validación de host de arriba).
async function renderWithBrowser(rawUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  let page: any = null
  try {
    // Guardia: si el arranque de Chromium se cuelga (contenedor frío, binario que no
    // responde), no esperamos indefinidamente — abortamos a los 12 s.
    const browser: any = await Promise.race([
      getBrowser(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout arrancando el navegador')), 12000)),
    ])
    page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    await page.setRequestInterception(true)
    page.on('request', (req: any) => {
      try {
        const rt = req.resourceType()
        if (rt === 'image' || rt === 'media' || rt === 'font') return req.abort()
        if (isUnsafeHost(new URL(req.url()).hostname)) return req.abort()
        req.continue()
      } catch { try { req.continue() } catch {} }
    })
    // Aunque el goto agote el tiempo (páginas que nunca "reposan"), leemos lo renderizado.
    try { await page.goto(rawUrl, { waitUntil: 'networkidle2', timeout: 15000 }) } catch {}
    const finalUrl = page.url()
    if (!finalUrl || finalUrl === 'about:blank') return null
    if (isUnsafeHost(new URL(finalUrl).hostname)) return null
    const html = await page.content()
    return { html, finalUrl }
  } catch {
    return null
  } finally {
    try { await page?.close() } catch {}
  }
}

// Descarga una URL y devuelve su texto legible. 1º intenta un fetch estático (rápido);
// si sale poco texto (típico de SPAs con JS), reintenta renderizando con navegador real.
// Exportada para que el modo Agente pueda usarla como herramienta.
export async function readPageText(rawUrl: string): Promise<{ text: string } | { error: string }> {
  let parsed: URL
  try { parsed = new URL(rawUrl) } catch { return { error: 'URL no válida.' } }
  if (!/^https?:$/.test(parsed.protocol)) return { error: 'Solo se permiten URLs http/https.' }
  if (isUnsafeHost(parsed.hostname)) return { error: 'No se permite acceder a esa dirección.' }

  let title = ''
  let text = ''
  let allowBrowser = true // se apaga si el contenido es binario (pdf, imagen…)

  // 1º intento: fetch estático.
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    const res = await fetch(parsed.toString(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DAYA/1.0' },
      redirect: 'follow',
    }).finally(() => clearTimeout(timer))
    // Anti-SSRF: revalidar el host FINAL tras posibles redirecciones.
    try { if (isUnsafeHost(new URL(res.url).hostname)) return { error: 'No se permite acceder a esa dirección.' } } catch {}
    if (res.ok) {
      const ct = res.headers.get('content-type') || ''
      if (/text|html|json|xml/.test(ct)) {
        const r = await extractReadable(await res.text(), parsed.toString())
        title = r.title; text = r.text
      } else {
        allowBrowser = false // binario/no legible: no tiene sentido renderizarlo
      }
    }
  } catch {}

  // 2º intento: si salió poco texto y no era binario, renderizamos con navegador real
  // y nos quedamos con el resultado más completo.
  if (allowBrowser && text.length < 400) {
    // Guardia dura de tiempo: si el render con navegador se cuelga, NO bloqueamos el
    // chat — a los 20 s abortamos y respondemos con el texto estático que ya tengamos.
    const rendered = await Promise.race([
      renderWithBrowser(parsed.toString()),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
    ])
    if (rendered) {
      const r = await extractReadable(rendered.html, rendered.finalUrl)
      if (r.text.length > text.length) { title = r.title || title; text = r.text }
    }
  }

  if (!text) return { error: 'La página no tiene texto legible.' }
  const full = title ? `${title}\n\n${text}` : text
  return { text: full.slice(0, 8000) }
}

// POST /api/read-url — { message } con una URL dentro → respuesta sobre la página
router.post('/', chatBurstLimiter, async (req: Request, res: Response) => {
  const message = String(req.body?.message || '').trim()
  if (!message) return res.status(400).json({ error: 'Falta el mensaje.' })

  const urlMatch = message.match(/https?:\/\/[^\s]+/i)
  if (!urlMatch) return res.status(400).json({ error: 'No se encontró ninguna URL en el mensaje.' })

  const page = await readPageText(urlMatch[0])
  if ('error' in page) return res.status(200).json({ answer: `No pude leer esa página: ${page.error}` })

  try {
    const system = 'Eres DAYA. El usuario te compartió un enlace y lo leíste por él. Responde a su mensaje usando SOLO el contenido de la página que se te da. Si la página no contiene la respuesta, dilo con claridad. Sé claro y directo, y no inventes datos que no estén en el texto.'
    const userPrompt = `Mensaje del usuario:\n${message}\n\nContenido de la página (${urlMatch[0]}):\n"""\n${page.text}\n"""`
    const answer = await chatSingle([{ role: 'user', content: userPrompt }], 'claude', system, undefined, 1500)
    res.json({ answer: answer?.trim() || 'No pude generar una respuesta sobre esa página.' })
  } catch (e) {
    console.error('[read-url] error al responder sobre la página:', e instanceof Error ? e.message : e)
    res.status(200).json({ answer: 'Leí la página pero hubo un error al redactar la respuesta. Intenta de nuevo.' })
  }
})

export default router
