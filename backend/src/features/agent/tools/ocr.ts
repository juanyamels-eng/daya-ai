import { DayaTool } from './types'

export const ocr: DayaTool = {
  name: 'extraer_texto_imagen',
  description: 'Extrae el TEXTO de una imagen mediante OCR: facturas, capturas de pantalla, fotos de documentos, PDFs escaneados, carteles. Dale la URL de la imagen y devuelve el texto que contiene.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'URL directa de la imagen (http/https)' } },
    required: ['url'],
  },
  async run(_userId, args) {
    const url = String(args?.url || '').trim()
    let host = ''
    try { const u = new URL(url); host = u.hostname; if (!/^https?:$/.test(u.protocol)) return 'La URL debe ser http/https.' } catch { return 'URL de imagen no válida.' }
    // Anti-SSRF básico: nada de hosts internos (mismo criterio que ver_imagen).
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|fe80:|fc00:|fd)/i.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'No se permite esa dirección.'

    let buf: Buffer
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 12000)
      const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'image/*,*/*' } }).finally(() => clearTimeout(timer))
      if (!resp.ok) return `No pude descargar la imagen (HTTP ${resp.status}).`
      const ct = resp.headers.get('content-type') || 'image/jpeg'
      if (!/^image\//.test(ct)) return 'Esa URL no apunta a una imagen.'
      buf = Buffer.from(await resp.arrayBuffer())
      if (buf.length > 8 * 1024 * 1024) return 'La imagen es demasiado grande (máx 8 MB).'
    } catch { return 'No pude descargar la imagen (¿enlace directo a un archivo de imagen?).' }

    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('spa+eng')
      try {
        const { data } = await worker.recognize(buf)
        const text = (data?.text || '').trim()
        return text ? `Texto extraído de la imagen:\n${text.slice(0, 4000)}` : 'No detecté texto legible en la imagen.'
      } finally {
        await worker.terminate().catch(() => {})
      }
    } catch (e: any) {
      return `El OCR falló: ${e?.message || e}`
    }
  },
}
