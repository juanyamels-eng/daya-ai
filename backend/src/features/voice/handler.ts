import { Server as SocketServer, Socket } from 'socket.io'
import { streamTts, VOICE_CONFIG, VoiceId } from './tts'
import { prisma } from '../../lib/prisma'

const db = prisma

interface VoiceSession {
  userId: string
  conversationId: string | null
  voice: VoiceId
  language: string
  mode: 'idle' | 'listening' | 'thinking' | 'speaking'
  startedAt: number
}

const sessions = new Map<string, VoiceSession>()

/**
 * Voice events handler. Extends the existing Socket.IO server with voice mode.
 */
export function setupVoiceHandler(io: SocketServer) {
  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId
    if (!userId) return

    // Start voice session
    socket.on('voice:start', (data: { conversationId?: string; voice?: string; language?: string }) => {
      const session: VoiceSession = {
        userId,
        conversationId: data.conversationId || null,
        voice: (data.voice as VoiceId) || VOICE_CONFIG.defaultVoice,
        language: data.language || 'es',
        mode: 'listening',
        startedAt: Date.now(),
      }
      sessions.set(socket.id, session)
      socket.emit('voice:started', {
        sessionId: socket.id,
        voice: session.voice,
        language: session.language,
      })
    })

    // Receive transcribed text from client (browser STT)
    socket.on('voice:transcript', async (data: { text: string; isFinal: boolean }) => {
      const session = sessions.get(socket.id)
      if (!session) return

      // Forward transcript to client for display
      socket.emit('voice:transcript', { text: data.text, isFinal: data.isFinal })

      if (!data.isFinal || !data.text.trim()) return

      // Switch to thinking mode
      session.mode = 'thinking'
      socket.emit('voice:thinking', {})

      try {
        // Call LLM for response
        const response = await generateVoiceResponse(data.text, session)

        // Switch to speaking mode
        session.mode = 'speaking'
        socket.emit('voice:response', { text: response })

        // Stream TTS audio
        await streamTts(
          response,
          session.voice,
          (chunk) => socket.emit('voice:audio', { chunk: chunk.toString('base64') }),
          () => {
            socket.emit('voice:audio:end', {})
            session.mode = 'listening'
            socket.emit('voice:listening', {})
          },
          (err) => {
            console.error('[Voice] TTS error:', err)
            socket.emit('voice:error', { message: 'Error generando audio' })
            session.mode = 'listening'
            socket.emit('voice:listening', {})
          }
        )
      } catch (err) {
        console.error('[Voice] Response error:', err)
        socket.emit('voice:error', { message: err instanceof Error ? err.message : 'Error procesando voz' })
        session.mode = 'listening'
        socket.emit('voice:listening', {})
      }
    })

    // Client interrupts AI speaking
    socket.on('voice:interrupt', () => {
      const session = sessions.get(socket.id)
      if (session && session.mode === 'speaking') {
        session.mode = 'listening'
        socket.emit('voice:interrupted', {})
        socket.emit('voice:listening', {})
      }
    })

    // Stop voice session
    socket.on('voice:stop', () => {
      const session = sessions.get(socket.id)
      if (session) {
        socket.emit('voice:stopped', { duration: Date.now() - session.startedAt })
        sessions.delete(socket.id)
      }
    })

    // Disconnect
    socket.on('disconnect', () => {
      sessions.delete(socket.id)
    })
  })
}

/**
 * Generate AI response for voice conversation.
 */
async function generateVoiceResponse(userMessage: string, session: VoiceSession): Promise<string> {
  const messages = [{ role: 'user', content: userMessage }]

  // If we have a conversation, load recent context
  if (session.conversationId) {
    try {
      const convMessages = await db.message.findMany({
        where: { conversationId: session.conversationId },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { role: true, content: true },
      })
      if (convMessages.length > 0) {
        messages.unshift(...convMessages.map((m: any) => ({ role: m.role, content: m.content })))
      }
    } catch {}
  }

  const systemPrompt = `Eres DAYA, un asistente de IA vocal. Responde de forma concisa y natural para conversación por voz.
Máximo 2-3 oraciones. Sé directo y útil. Habla como si fuera una conversación telefónica.
Idioma: ${session.language === 'es' ? 'español' : session.language === 'en' ? 'inglés' : session.language}.`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://daya.ai',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 300,
      }),
    })
    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'No pude procesar tu mensaje.'
  } catch {
    return 'Disculpa, tuve un problema procesando tu mensaje. Intenta de nuevo.'
  }
}
