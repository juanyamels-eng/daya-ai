import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import path from 'path'

export const VOICE_CONFIG = {
  voices: [
    { id: 'es-MX-DaliaNeural', label: 'Dalia (Español MX)', lang: 'es', gender: 'female' },
    { id: 'es-MX-JorgeNeural', label: 'Jorge (Español MX)', lang: 'es', gender: 'male' },
    { id: 'en-US-AriaNeural', label: 'Aria (English US)', lang: 'en', gender: 'female' },
    { id: 'en-US-GuyNeural', label: 'Guy (English US)', lang: 'en', gender: 'male' },
    { id: 'pt-BR-FranciscaNeural', label: 'Francisca (Português BR)', lang: 'pt', gender: 'female' },
    { id: 'fr-FR-DeniseNeural', label: 'Denise (Français FR)', lang: 'fr', gender: 'female' },
    { id: 'de-DE-KatjaNeural', label: 'Katja (Deutsch DE)', lang: 'de', gender: 'female' },
  ],
  defaultVoice: 'es-MX-DaliaNeural',
} as const

export type VoiceId = typeof VOICE_CONFIG.voices[number]['id']

function audioDir(): string {
  return path.join(__dirname, '..', '..', '..', '..', 'public', 'audio')
}

/**
 * Generate TTS audio and return the URL. Used for both streaming (chunks) and batch.
 */
export async function generateTtsAudio(text: string, voiceId: VoiceId = VOICE_CONFIG.defaultVoice): Promise<Buffer> {
  const mod: any = await import('msedge-tts')
  const tts = new mod.MsEdgeTTS()
  await tts.setMetadata(voiceId, mod.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text)
  const buf = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const timer = setTimeout(() => reject(new Error('TTS timeout')), 30000)
    audioStream.on('data', (c: Buffer) => chunks.push(c))
    audioStream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)) })
    audioStream.on('error', (e: any) => { clearTimeout(timer); reject(e) })
  })
  try { tts.close?.() } catch {}
  return buf
}

/**
 * Save audio buffer to disk and return public URL.
 */
export function saveAudioFile(buf: Buffer): string {
  const dir = audioDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}.mp3`
  writeFileSync(path.join(dir, id), buf)
  const base = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${process.env.PORT || 4000}`
  return `${base}/audio/${id}`
}

/**
 * Stream TTS audio chunks via callback. Used for real-time voice mode.
 */
export async function streamTts(
  text: string,
  voiceId: VoiceId,
  onChunk: (chunk: Buffer) => void,
  onEnd: () => void,
  onError: (err: Error) => void
): Promise<void> {
  try {
    const mod: any = await import('msedge-tts')
    const tts = new mod.MsEdgeTTS()
    await tts.setMetadata(voiceId, mod.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(text)
    audioStream.on('data', (chunk: Buffer) => onChunk(chunk))
    audioStream.on('end', () => {
      try { tts.close?.() } catch {}
      onEnd()
    })
    audioStream.on('error', (e: Error) => {
      try { tts.close?.() } catch {}
      onError(e)
    })
  } catch (e) {
    onError(e instanceof Error ? e : new Error(String(e)))
  }
}
