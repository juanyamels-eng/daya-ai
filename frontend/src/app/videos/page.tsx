'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import type { AxiosError } from 'axios'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Badge, Select } from '@/components/ui'
import { Video, Trash2, Clock, Film, Sparkles } from 'lucide-react'

interface GeneratedVideo {
  id: string
  prompt: string
  model: string
  url: string
  thumbnailUrl?: string
  duration: number
  resolution: string
  status: string
  createdAt: string
}

const MODEL_OPTIONS = [
  { value: 'kling-turbo', label: 'Kling 2.5 Turbo (Rápido)' },
  { value: 'kling-pro', label: 'Kling 3.0 Pro (Premium)' },
  { value: 'wan', label: 'Wan 2.6 (Económico)' },
]

const DURATION_OPTIONS = [
  { value: '5', label: '5 segundos' },
  { value: '10', label: '10 segundos' },
  { value: '15', label: '15 segundos' },
]

export default function VideosPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('kling-turbo')
  const [duration, setDuration] = useState('5')
  const [selectedVideo, setSelectedVideo] = useState<GeneratedVideo | null>(null)

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated()) loadVideos()
  }, [hasHydrated, isAuthenticated])

  async function loadVideos() {
    try {
      const res = await api.get('/videos')
      setVideos(res.data.videos || [])
    } catch {}
    finally { setLoading(false) }
  }

  async function generateVideo() {
    if (!prompt.trim()) return
    setGenerating(true)
    try {
      const res = await api.post('/videos/generate', {
        prompt: prompt.trim(),
        model,
        duration: parseInt(duration),
        resolution: '720p',
      })
      const video = res.data.video
      setVideos([video, ...videos])
      toast.success('Video en cola de generación')
      // Start polling
      pollStatus(video.id)
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error generando video')
    } finally { setGenerating(false) }
  }

  async function pollStatus(id: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const res = await api.get(`/videos/${id}/status`)
        if (res.data.status === 'completed') {
          setVideos(prev => prev.map(v => v.id === id ? { ...v, status: 'completed', url: res.data.url, thumbnailUrl: res.data.thumbnailUrl } : v))
          toast.success('Video listo')
          return
        }
        if (res.data.status === 'failed') {
          setVideos(prev => prev.map(v => v.id === id ? { ...v, status: 'failed' } : v))
          toast.error('Video falló')
          return
        }
      } catch {}
    }
  }

  async function deleteVideo(id: string) {
    try {
      await api.delete(`/videos/${id}`)
      setVideos(videos.filter(v => v.id !== id))
      if (selectedVideo?.id === id) setSelectedVideo(null)
    } catch {}
  }

  if (!hasHydrated) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Film size={24} style={{ color: 'var(--accent-500)' }} />
            AI Video Generator
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
            Genera videos con IA desde texto o imágenes
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Generation Panel */}
          <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} style={{ color: 'var(--brand)' }} />
              Generar Video
            </h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Prompt</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Un gato astronauta caminando en la luna, cinematográfico, 4K..."
                style={{
                  width: '100%', minHeight: 100, padding: 12, borderRadius: 10,
                  border: '1px solid var(--border-default)', background: 'var(--bg-base)',
                  color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 14,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Modelo</label>
                <Select options={MODEL_OPTIONS} value={model} onValueChange={setModel} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Duración</label>
                <Select options={DURATION_OPTIONS} value={duration} onValueChange={setDuration} />
              </div>
            </div>

            <Button onClick={generateVideo} disabled={!prompt.trim() || generating} loading={generating} style={{ width: '100%' }}>
              <Video size={16} /> Generar Video
            </Button>
          </Card>

          {/* Preview / Video Player */}
          <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column' }}>
            {selectedVideo && selectedVideo.status === 'completed' && selectedVideo.url ? (
              <>
                <video
                  src={selectedVideo.url}
                  controls
                  style={{ width: '100%', borderRadius: 10, marginBottom: 12 }}
                />
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{selectedVideo.prompt}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Badge variant="neutral">{selectedVideo.model}</Badge>
                  <Badge variant="neutral">{selectedVideo.duration}s</Badge>
                  <Badge variant="neutral">{selectedVideo.resolution}</Badge>
                </div>
              </>
            ) : selectedVideo ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Clock size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Video en procesamiento...</p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>Esto puede tomar 1-3 minutos</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Film size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 12, opacity: 0.3 }} />
                <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Selecciona un video para previsualizar</p>
              </div>
            )}
          </Card>
        </div>

        {/* Video Library */}
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Mis Videos ({videos.length})</h2>
          {loading ? (
            <div className="skeleton-grid">
              {[1,2,3].map(i => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton-line" style={{ height: 140, borderRadius: 10, marginBottom: 10 }} />
                  <div className="skeleton-line skeleton-line--title" />
                  <div className="skeleton-line skeleton-line--text-sm" />
                </div>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <Card style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
              <Video size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Aún no has generado videos</p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 8 }}>
                Escribe un prompt y genera tu primer video con IA
              </p>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {videos.map(video => (
                <Card key={video.id} style={{ padding: 0, border: '1px solid var(--border-default)', cursor: 'pointer', overflow: 'hidden' }}
                  className="hover-lift" onClick={() => setSelectedVideo(video)}>
                  {video.status === 'completed' && video.url ? (
                    <video src={video.url} muted style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                  ) : video.status === 'failed' ? (
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)' }}>
                      <span style={{ color: 'var(--red)', fontSize: 13 }}>Error</span>
                    </div>
                  ) : (
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)' }}>
                      <Clock size={24} style={{ color: 'var(--text-tertiary)' }} />
                    </div>
                  )}
                  <div style={{ padding: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {video.prompt}
                    </p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <Badge variant="neutral" style={{ fontSize: 10 }}>{video.model}</Badge>
                      <Badge variant="neutral" style={{ fontSize: 10 }}>{video.duration}s</Badge>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button onClick={e => { e.stopPropagation(); deleteVideo(video.id) }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
