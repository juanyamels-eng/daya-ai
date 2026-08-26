'use client'
import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store'
import { useVoiceStore } from '@/store/voice'

interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: { transcript: string }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export function useVoiceSocket() {
  const token = useAuthStore((s) => s.token)
  const { setMode, setSessionId, setTranscript, setResponseText, setError } = useVoiceStore()
  const socketRef = useRef<Socket | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const getSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    const wsUrl = apiBase.replace(/\/api\/?$/, '')
    const socket = io(wsUrl, {
      path: '/ws',
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    // Voice events
    socket.on('voice:started', (data: { sessionId: string }) => {
      setSessionId(data.sessionId)
    })
    socket.on('voice:transcript', (data: { text: string; isFinal: boolean }) => {
      setTranscript(data.text)
    })
    socket.on('voice:thinking', () => setMode('thinking'))
    socket.on('voice:listening', () => setMode('listening'))
    socket.on('voice:response', (data: { text: string }) => {
      setResponseText(data.text)
      setMode('speaking')
    })
    socket.on('voice:audio', (data: { chunk: string }) => {
      // Decode base64 audio chunk and play via Web Audio API
      playAudioChunk(data.chunk)
    })
    socket.on('voice:audio:end', () => {
      setMode('listening')
    })
    socket.on('voice:error', (data: { message: string }) => {
      setError(data.message)
    })
    socket.on('voice:stopped', () => {
      setMode('idle')
      setSessionId(null)
    })
    socket.on('voice:interrupted', () => {
      setMode('listening')
    })

    return socket
  }, [token, setMode, setSessionId, setTranscript, setResponseText, setError])

  const startListening = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Tu navegador no soporta reconocimiento de voz')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = useVoiceStore.getState().language === 'es' ? 'es-ES' :
      useVoiceStore.getState().language === 'en' ? 'en-US' :
      useVoiceStore.getState().language

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalTranscript = ''
      let interimTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalTranscript += t
        else interimTranscript += t
      }
      if (finalTranscript) {
        setTranscript(finalTranscript)
        // Send to backend for LLM processing
        const socket = socketRef.current
        if (socket?.connected) {
          socket.emit('voice:transcript', { text: finalTranscript, isFinal: true })
        }
      } else if (interimTranscript) {
        setTranscript(interimTranscript)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error !== 'no-speech') {
        setError(`Error de reconocimiento: ${event.error}`)
      }
    }

    recognition.onend = () => {
      // Restart if still in listening mode
      if (useVoiceStore.getState().mode === 'listening') {
        try { recognition.start() } catch {}
      }
    }

    recognitionRef.current = recognition
    try { recognition.start() } catch {}
    setMode('listening')
  }, [setMode, setTranscript, setError])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
      recognitionRef.current = null
    }
  }, [])

  const startSession = useCallback((conversationId?: string) => {
    const socket = getSocket()
    const state = useVoiceStore.getState()
    socket.emit('voice:start', {
      conversationId,
      voice: state.voice,
      language: state.language,
    })
    startListening()
  }, [getSocket, startListening])

  const stopSession = useCallback(() => {
    stopListening()
    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit('voice:stop')
    }
    setMode('idle')
    setSessionId(null)
  }, [stopListening, setMode, setSessionId])

  const interrupt = useCallback(() => {
    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit('voice:interrupt')
    }
  }, [])

  const toggleMute = useCallback(() => {
    const { isMuted, setMuted } = useVoiceStore.getState()
    if (isMuted) {
      startListening()
    } else {
      stopListening()
    }
    setMuted(!isMuted)
  }, [startListening, stopListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [stopListening])

  return {
    startSession,
    stopSession,
    interrupt,
    toggleMute,
    isConnected: socketRef.current?.connected ?? false,
  }
}

// Audio playback queue for TTS chunks
let audioContext: AudioContext | null = null
const audioQueue: ArrayBuffer[] = []
let isPlaying = false

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

async function playAudioChunk(base64Chunk: string) {
  try {
    const binary = atob(base64Chunk)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    audioQueue.push(bytes.buffer)

    if (!isPlaying) {
      isPlaying = true
      await playNextChunk()
    }
  } catch (e) {
    console.error('[Voice] Audio decode error:', e)
  }
}

async function playNextChunk() {
  if (audioQueue.length === 0) {
    isPlaying = false
    return
  }

  const ctx = getAudioContext()
  const buffer = audioQueue.shift()!

  try {
    // Decode MP3 chunk — may need to concatenate for proper decoding
    const audioBuffer = await ctx.decodeAudioData(buffer)
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    source.onended = () => playNextChunk()
    source.start()
  } catch {
    // Partial MP3 data — skip and try next
    playNextChunk()
  }
}
