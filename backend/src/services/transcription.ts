// ============================================
// DAYA IA — Servicio de transcripción de voz
// Usa Whisper vía Groq (gratis/rápido) o OpenAI como fallback
// ============================================

import { childLogger } from './logger'
import { withRetry } from './retry'
import { CircuitBreaker } from './circuitBreaker'

const log = childLogger('transcription')
const transcriptionCircuit = new CircuitBreaker('transcription', { failureThreshold: 3, recoveryTimeoutMs: 45000 })

// Detecta qué proveedor está configurado
function getProvider(): { url: string; key: string; model: string } | null {
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey && !groqKey.includes('PON-TU') && groqKey.trim()) {
    return {
      url: 'https://api.groq.com/openai/v1/audio/transcriptions',
      key: groqKey,
      model: 'whisper-large-v3-turbo',
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey && !openaiKey.includes('PON-TU') && openaiKey.trim()) {
    return {
      url: 'https://api.openai.com/v1/audio/transcriptions',
      key: openaiKey,
      model: 'whisper-1',
    }
  }

  return null
}

export function isTranscriptionConfigured(): boolean {
  return getProvider() !== null
}

// Transcribe un buffer de audio a texto
export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName = 'audio.webm'
): Promise<{ success: boolean; text?: string; error?: string }> {
  const provider = getProvider()
  if (!provider) {
    return { success: false, error: 'Transcripción no configurada. Falta GROQ_API_KEY u OPENAI_API_KEY.' }
  }

  try {
    const result = await transcriptionCircuit.execute(() => withRetry(async () => {
      const form = new FormData()
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' })
      form.append('file', blob, fileName)
      form.append('model', provider.model)
      form.append('language', 'es')

      const res = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${provider.key}` },
        body: form,
      })

      const data = (await res.json()) as { text?: string; error?: { message?: string } }

      if (res.ok && data.text) {
        return { success: true, text: data.text.trim() }
      }
      return { success: false, error: data.error?.message || 'No se pudo transcribir el audio.' }
    }, { maxRetries: 2, baseDelayMs: 1500 }))

    return result
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Transcription failed')
    return { success: false, error: 'Error al procesar el audio.' }
  }
}
