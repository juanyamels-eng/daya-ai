import { DayaTool } from './types'
import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import path from 'path'

const VOICES = ['es-MX-DaliaNeural', 'es-MX-JorgeNeural', 'en-US-AriaNeural', 'en-US-GuyNeural', 'pt-BR-FranciscaNeural', 'fr-FR-DeniseNeural', 'de-DE-KatjaNeural'] as const

// La carpeta pública se sirve estática desde index.ts (/audio/…). Gitignorada.
function audioDir(): string {
  return path.join(__dirname, '..', '..', '..', '..', 'public', 'audio')
}

export const speak: DayaTool = {
  name: 'hablar',
  description: 'Convierte texto en voz (audio MP3) y devuelve la URL del audio para reproducir. Úsalo cuando el usuario pida que le lea algo en voz alta, escuchar la respuesta, o una nota de voz.',
  parameters: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'El texto a leer en voz alta (máx 2000 caracteres)' },
      voz: { type: 'string', enum: VOICES, description: 'Voz (opcional). Ejemplos: es-MX-DaliaNeural (español), en-US-AriaNeural (inglés)' },
    },
    required: ['texto'],
  },
  async run(_userId, args) {
    const text = String(args?.texto || '').trim()
    if (!text) return 'Falta el texto a leer.'
    if (text.length > 2000) return 'El texto es demasiado largo (máx 2000 caracteres). Resúmelo en menos.'
    const voice = VOICES.includes(args?.voz) ? args.voz : 'es-MX-DaliaNeural'

    try {
      const mod: any = await import('msedge-tts')
      const tts = new mod.MsEdgeTTS()
      await tts.setMetadata(voice, mod.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      const { audioStream } = tts.toStream(text)
      const buf = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        const timer = setTimeout(() => reject(new Error('timeout de voz')), 45000)
        audioStream.on('data', (c: Buffer) => chunks.push(c))
        audioStream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)) })
        audioStream.on('error', (e: any) => { clearTimeout(timer); reject(e) })
      })
      try { tts.close?.() } catch {}

      if (!buf || buf.length < 1000) return 'No pude generar el audio.'
      const dir = audioDir()
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const id = `${Date.now()}-${randomUUID().slice(0, 8)}.mp3`
      writeFileSync(path.join(dir, id), buf)
      const base = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${process.env.PORT || 4000}`
      return `Audio generado (inclúyelo EN TU RESPUESTA como un enlace de audio para el usuario): ${base}/audio/${id}`
    } catch (e: any) {
      return `La síntesis de voz falló: ${e?.message || e}`
    }
  },
}
