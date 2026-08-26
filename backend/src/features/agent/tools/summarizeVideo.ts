import { DayaTool } from './types'
import { YoutubeTranscript } from 'youtube-transcript'
import getClient, { MODELS } from '../../../services/openrouter'

// Extrae el ID de un video de YouTube desde varios formatos de URL.
function videoIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/') || u.pathname.startsWith('/live/')) {
        return u.pathname.split('/')[2] || null
      }
      return u.searchParams.get('v')
    }
    return null
  } catch { return null }
}

export const summarizeVideo: DayaTool = {
  name: 'resumir_video_youtube',
  description: 'Obtiene la transcripción de un video de YouTube y la resume en puntos claros. Úsalo cuando pidan resumir, sintetizar o entender un video de YouTube.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'URL del video de YouTube' } },
    required: ['url'],
  },
  safeForAct: true,
  async run(_userId, args) {
    const url = String(args?.url || '').trim()
    const videoId = videoIdFromUrl(url)
    if (!videoId) return 'No pude reconocer un video de YouTube en esa URL.'

    let chunks: { text: string }[]
    try {
      chunks = await YoutubeTranscript.fetchTranscript(videoId)
    } catch {
      return 'No pude obtener la transcripción del video (¿tiene subtítulos desactivados o está en vivo?).'
    }
    if (!chunks?.length) return 'El video no tiene transcripción disponible.'
    const transcript = chunks.map(c => c.text).join(' ').slice(0, 15000)
    if (transcript.length < 40) return 'El video no tiene transcripción disponible.'

    try {
      const res = await getClient().chat.completions.create({
        model: MODELS.flash,
        messages: [
          { role: 'system', content: 'Resumes transcripciones de videos en español. Entregas un resumen claro con los puntos principales en viñetas, sin relleno. Respondes SOLO con el resumen.' },
          { role: 'user', content: `Resume este video de YouTube:\n\n${transcript}` },
        ],
        max_tokens: 900,
      })
      const summary = (res.choices?.[0]?.message?.content || '').trim()
      return `Resumen del video (${url}):\n${summary}`
    } catch (e: any) {
      // Sin modelo disponible: entrega la transcripción cruda, mejor que nada.
      return `No pude generar el resumen automático (${e?.message || e}). Transcripción del video:\n${transcript.slice(0, 4000)}`
    }
  },
}
