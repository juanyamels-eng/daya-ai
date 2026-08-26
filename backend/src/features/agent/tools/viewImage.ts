import { DayaTool } from './types'
import getClient, { MODELS } from '../../../services/openrouter'

export const viewImage: DayaTool = {
  name: 'ver_imagen',
  description: 'Analiza o describe el contenido de una imagen a partir de su URL: fotos, capturas de pantalla, gráficos, diagramas, texto en imágenes. Úsalo cuando el usuario comparta una URL de imagen o pida analizar una.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL de la imagen (http/https)' },
      pregunta: { type: 'string', description: 'Qué quieres saber de la imagen (opcional)' },
    },
    required: ['url'],
  },
  async run(_userId, args) {
    const url = String(args?.url || '').trim()
    let host = ''
    try { const u = new URL(url); host = u.hostname; if (!/^https?:$/.test(u.protocol)) return 'La URL debe ser http/https.' } catch { return 'URL de imagen no válida.' }
    // Anti-SSRF básico: nada de hosts internos.
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|fe80:|fc00:|fd)/i.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'No se permite esa dirección.'
    const q = String(args?.pregunta || '').slice(0, 500) || 'Describe con detalle qué hay en esta imagen.'
    // Descargamos la imagen y la mandamos en base64 (como el chat): los proveedores
    // fallan al buscar URLs externas ellos mismos, y así evitamos bloqueos por UA.
    let dataUrl: string
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 12000)
      const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'image/*,*/*' } }).finally(() => clearTimeout(timer))
      if (!resp.ok) return `No pude descargar la imagen (HTTP ${resp.status}).`
      const ct = resp.headers.get('content-type') || 'image/jpeg'
      if (!/^image\//.test(ct)) return 'Esa URL no apunta a una imagen.'
      const buf = Buffer.from(await resp.arrayBuffer())
      if (buf.length > 8 * 1024 * 1024) return 'La imagen es demasiado grande (máx 8 MB).'
      dataUrl = `data:${ct};base64,${buf.toString('base64')}`
    } catch { return 'No pude descargar la imagen (¿enlace directo a un archivo de imagen?).' }
    const askVision = (model: string) => getClient().chat.completions.create({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: q }, { type: 'image_url', image_url: { url: dataUrl } }] as any }],
      max_tokens: 800,
    })
    let res
    try { res = await askVision(MODELS.flash) }
    catch { res = await askVision(MODELS.claude) }
    return (res.choices?.[0]?.message?.content || '').trim() || 'No pude analizar la imagen.'
  },
}
