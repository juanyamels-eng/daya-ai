'use client'
import { useVoiceStore } from '@/store/voice'
import { useVoiceSocket } from '@/hooks/useVoiceSocket'
import { AudioVisualizer } from './AudioVisualizer'
import { useEffect, useState } from 'react'

interface VoiceOverlayProps {
  onClose: () => void
  conversationId?: string
}

export function VoiceOverlay({ onClose, conversationId }: VoiceOverlayProps) {
  const { mode, transcript, responseText, voice, language, setVoice, setLanguage, error, setError } = useVoiceStore()
  const { startSession, stopSession, interrupt, toggleMute } = useVoiceSocket()
  const { isMuted } = useVoiceStore()
  const [showSettings, setShowSettings] = useState(false)
  const [voices, setVoices] = useState<Array<{ id: string; label: string; lang: string }>>([])

  useEffect(() => {
    startSession(conversationId)
    // Load voice config
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/voice/config`)
      .then(r => r.json())
      .then(data => setVoices(data.voices || []))
      .catch(() => {})
    return () => stopSession()
  }, [])

  const handleClose = () => {
    stopSession()
    onClose()
  }

  const modeColors: Record<string, string> = {
    idle: 'var(--text-tertiary)',
    listening: 'var(--brand)',
    thinking: '#f59e0b',
    speaking: 'var(--green)',
  }

  const modeLabels: Record<string, string> = {
    idle: 'Iniciando...',
    listening: 'Escuchando...',
    thinking: 'Pensando...',
    speaking: 'Hablando...',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.3s ease',
    }}>
      {/* Close button */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 24, right: 24,
        background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
        width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 20, cursor: 'pointer', transition: 'background 0.2s',
      }} onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
        onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}>
        ✕
      </button>

      {/* Settings button */}
      <button onClick={() => setShowSettings(!showSettings)} style={{
        position: 'absolute', top: 24, left: 24,
        background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
        width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, cursor: 'pointer',
      }}>
        ⚙
      </button>

      {/* Settings panel */}
      {showSettings && (
        <div style={{
          position: 'absolute', top: 80, left: 24,
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 16, padding: 20, width: 280, animation: 'dayaScaleIn 0.2s ease',
        }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Configuración de voz</h3>
          <label style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'block', marginBottom: 4 }}>Voz</label>
          <select value={voice} onChange={e => setVoice(e.target.value)} style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)',
            background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13, marginBottom: 12,
          }}>
            {voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <label style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'block', marginBottom: 4 }}>Idioma</label>
          <select value={language} onChange={e => setLanguage(e.target.value)} style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)',
            background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13,
          }}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
      )}

      {/* Status indicator */}
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: modeColors[mode] || modeColors.idle,
        boxShadow: mode === 'listening' ? `0 0 20px ${modeColors.listening}` :
          mode === 'speaking' ? `0 0 20px ${modeColors.speaking}` : 'none',
        marginBottom: 16,
        animation: mode === 'listening' ? 'micPulse 1.5s ease-in-out infinite' : undefined,
      }} />

      <p style={{ color: modeColors[mode], fontSize: 14, fontWeight: 500, marginBottom: 32, fontFamily: 'var(--font-body)' }}>
        {modeLabels[mode] || 'Iniciando...'}
      </p>

      {/* Visualizer */}
      <div style={{ width: '80%', maxWidth: 500, marginBottom: 32 }}>
        <AudioVisualizer isActive={mode === 'listening'} color={modeColors[mode] || '#fff'} />
      </div>

      {/* Transcript */}
      {(transcript || responseText) && (
        <div style={{
          width: '80%', maxWidth: 500, maxHeight: 200, overflowY: 'auto',
          background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20,
          marginBottom: 32,
        }}>
          {transcript && (
            <p style={{ color: '#fff', fontSize: 15, marginBottom: responseText ? 12 : 0, lineHeight: 1.6 }}>
              {transcript}
            </p>
          )}
          {responseText && (
            <p style={{ color: 'var(--green)', fontSize: 15, lineHeight: 1.6 }}>
              {responseText}
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12, padding: '10px 16px', marginBottom: 24, maxWidth: 400,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#ef4444', fontSize: 13 }}>{error}</span>
          <button onClick={() => setError(null)} style={{
            background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {/* Mute */}
        <button onClick={toggleMute} style={{
          width: 52, height: 52, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)',
          background: isMuted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
          color: isMuted ? '#ef4444' : '#fff', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
        }}>
          {isMuted ? '🔇' : '🎤'}
        </button>

        {/* Interrupt (only when AI is speaking) */}
        {mode === 'speaking' && (
          <button onClick={interrupt} style={{
            width: 52, height: 52, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)',
            background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
            animation: 'dayaPopIn 0.3s ease',
          }}>
            ✋
          </button>
        )}

        {/* End call */}
        <button onClick={handleClose} style={{
          width: 64, height: 64, borderRadius: '50%', border: 'none',
          background: '#ef4444', color: '#fff', fontSize: 24, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(239,68,68,0.4)', transition: 'transform 0.2s',
        }} onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}>
          📞
        </button>
      </div>

      {/* Hint */}
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 24 }}>
        {mode === 'listening' ? 'Habla cuando quieras...' : mode === 'speaking' ? 'Toca ✋ para interrumpir' : ''}
      </p>
    </div>
  )
}
