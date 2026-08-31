import { Response } from 'express'

export interface ImageDetectionResult {
  isImageRequest: boolean
  prompt: string | null
}

const NOT_IMAGE = /\b(informe|reporte|resumen|texto|lista|carta|email|correo|ensayo|art[ií]culo|poema|cuento|c[oó]digo|funci[oó]n|script|tabla|f[oó]rmula|pdf|word|docx|excel|powerpoint|presentaci[oó]n)\b/i

export function detectImageRequest(message: string): string | null {
  const m = message.trim()
  if (m.split(/\s+/).length > 60) return null
  if (NOT_IMAGE.test(m)) return null

  const r1 = m.match(
    /^(?:gen[eé]ra(?:me|dme)?|cr[eé]a(?:me|dme)?|dib[uú]j[ao](?:me)?|h[aá]z(?:me)?|p[ií]nta(?:me|dme)?|dis[eé][ñn]a(?:me|dme)?|imagina|make|create|draw|generate|d[aá]me|quiero|mu[eé]strame|ponme|necesito)\s+(?:(?:un[ao]?|el|la)\s+)?(?:imagen|foto|fotograf[ií]a|ilustraci[oó]n|dibujo|arte|dise[ñn]o|image|picture|photo|artwork|wallpaper|poster|logo|icono)\s*(?:de|del?|sobre|of|con|with|:)?\s*[:\-]?\s*(.+)/i
  )
  if (r1?.[1]?.trim()) return r1[1].trim().slice(0, 600)

  const r3 = m.match(/^(?:imagen|foto(?:graf[ií]a)?|ilustraci[oó]n|wallpaper|fondo\s+de\s+pantalla|retrato|arte)\s+(?:de|del?|sobre|con)\s+(.+)/i)
  if (r3?.[1]?.trim()) return r3[1].trim().slice(0, 600)

  return null
}

export function handleImageFallback(
  prompt: string,
  res: Response
): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform, no-store')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  res.write(`data: ${JSON.stringify({ imageRequest: true, prompt })}\n\n`)
  res.end()
}