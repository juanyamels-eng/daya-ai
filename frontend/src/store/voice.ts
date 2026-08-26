import { create } from 'zustand'

export type VoiceMode = 'idle' | 'listening' | 'thinking' | 'speaking'

interface VoiceState {
  mode: VoiceMode
  isMuted: boolean
  voice: string
  language: string
  transcript: string
  responseText: string
  audioLevel: number
  sessionId: string | null
  error: string | null

  setMode: (mode: VoiceMode) => void
  setMuted: (muted: boolean) => void
  setVoice: (voice: string) => void
  setLanguage: (lang: string) => void
  setTranscript: (text: string) => void
  setResponseText: (text: string) => void
  setAudioLevel: (level: number) => void
  setSessionId: (id: string | null) => void
  setError: (error: string | null) => void
  reset: () => void
}

const initialState = {
  mode: 'idle' as VoiceMode,
  isMuted: false,
  voice: 'es-MX-DaliaNeural',
  language: 'es',
  transcript: '',
  responseText: '',
  audioLevel: 0,
  sessionId: null as string | null,
  error: null as string | null,
}

export const useVoiceStore = create<VoiceState>((set) => ({
  ...initialState,

  setMode: (mode) => set({ mode }),
  setMuted: (isMuted) => set({ isMuted }),
  setVoice: (voice) => set({ voice }),
  setLanguage: (language) => set({ language }),
  setTranscript: (transcript) => set({ transcript }),
  setResponseText: (responseText) => set({ responseText }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setSessionId: (sessionId) => set({ sessionId }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}))
