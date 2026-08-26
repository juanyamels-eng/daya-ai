'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'

interface Meeting {
  id: string
  title: string
  platform: string
  status: string
  participants: string[]
  summary: string | null
  decisions: string | null
  createdAt: string
  transcripts: Array<{ id: string; speaker: string; text: string; timestamp: number }>
  actionItems: Array<{ id: string; title: string; status: string; assignee: string | null }>
}

export default function MeetingDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [summarizing, setSummarizing] = useState(false)
  const [newTranscript, setNewTranscript] = useState({ speaker: '', text: '' })

  // Guard: sin sesión, a login (antes la página se quedaba cargando para siempre)
  useEffect(() => {
    if (hasHydrated && !token) router.push('/auth/login')
  }, [hasHydrated, token, router])

  useEffect(() => {
    if (!token || !id) return
    fetch(`/api/meetings/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setMeeting(data.meeting)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token, id])

  const addTranscript = async () => {
    if (!newTranscript.text.trim()) return
    await fetch(`/api/meetings/${id}/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        speaker: newTranscript.speaker || 'Anónimo',
        text: newTranscript.text,
        timestamp: meeting?.transcripts?.length ? meeting.transcripts[meeting.transcripts.length - 1].timestamp + 30 : 0,
      }),
    })
    setNewTranscript({ speaker: '', text: '' })
    // Reload
    const res = await fetch(`/api/meetings/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setMeeting(data.meeting)
  }

  const summarize = async () => {
    setSummarizing(true)
    try {
      const res = await fetch(`/api/meetings/${id}/summarize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.summary) {
        const res2 = await fetch(`/api/meetings/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        const data2 = await res2.json()
        setMeeting(data2.meeting)
      }
    } finally {
      setSummarizing(false)
    }
  }

  const toggleAction = async (actionId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    await fetch(`/api/meetings/${id}/actions/${actionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    })
    const res = await fetch(`/api/meetings/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setMeeting(data.meeting)
  }

  const completeMeeting = async () => {
    await fetch(`/api/meetings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'completed' }),
    })
    const res = await fetch(`/api/meetings/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setMeeting(data.meeting)
  }

  const exportMarkdown = () => {
    window.open(`/api/meetings/${id}/export?format=markdown`, '_blank')
  }

  if (loading || !meeting) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/meetings')}>← Volver</Button>
          <div>
            <h1 className="text-xl font-bold">{meeting.title}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(meeting.createdAt).toLocaleDateString('es-ES')} • {meeting.platform} • {meeting.participants.join(', ') || 'Sin participantes'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={meeting.status === 'completed' ? 'success' : 'primary'}>{meeting.status}</Badge>
          {meeting.status === 'active' && <Button size="sm" onClick={completeMeeting}>Finalizar</Button>}
          <Button size="sm" variant="secondary" onClick={exportMarkdown}>Exportar MD</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Transcript */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transcripción ({meeting.transcripts.length} segmentos)</CardTitle>
            </CardHeader>
            <CardContent>
              {meeting.transcripts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay transcripción aún. Agrega segmentos manualmente o conecta la transcripción automática.</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {meeting.transcripts.map((t) => (
                    <div key={t.id} className="flex gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">{Math.floor(t.timestamp / 60)}:{String(t.timestamp % 60).padStart(2, '0')}</span>
                      <div>
                        <span className="text-sm font-medium">{t.speaker}: </span>
                        <span className="text-sm">{t.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Add segment */}
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <input
                  className="w-24 px-2 py-1 rounded border border-input bg-background text-xs"
                  value={newTranscript.speaker}
                  onChange={(e) => setNewTranscript({ ...newTranscript, speaker: e.target.value })}
                  placeholder="Hablante"
                />
                <input
                  className="flex-1 px-2 py-1 rounded border border-input bg-background text-xs"
                  value={newTranscript.text}
                  onChange={(e) => setNewTranscript({ ...newTranscript, text: e.target.value })}
                  placeholder="Escribe o pega un segmento..."
                  onKeyDown={(e) => e.key === 'Enter' && addTranscript()}
                />
                <Button size="sm" onClick={addTranscript}>+</Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Resumen IA</CardTitle>
              <Button size="sm" onClick={summarize} disabled={summarizing || meeting.transcripts.length === 0}>
                {summarizing ? 'Generando...' : '🔄 Generar Resumen'}
              </Button>
            </CardHeader>
            <CardContent>
              {meeting.summary ? (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{meeting.summary}</div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {meeting.transcripts.length === 0
                    ? 'Agrega transcripción primero para generar un resumen.'
                    : 'Haz clic en "Generar Resumen" para crear un resumen IA de la reunión.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Action Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones ({meeting.actionItems.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {meeting.actionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Las acciones se extraen automáticamente al generar el resumen.</p>
              ) : (
                <div className="space-y-2">
                  {meeting.actionItems.map((action) => (
                    <div key={action.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={action.status === 'completed'}
                        onChange={() => toggleAction(action.id, action.status)}
                        className="mt-0.5 rounded"
                      />
                      <div className="flex-1">
                        <p className={`text-sm ${action.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                          {action.title}
                        </p>
                        {action.assignee && (
                          <p className="text-xs text-muted-foreground">→ {action.assignee}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Participants */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Participantes</CardTitle>
            </CardHeader>
            <CardContent>
              {meeting.participants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay participantes registrados.</p>
              ) : (
                <div className="space-y-1">
                  {meeting.participants.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs">
                        {p.charAt(0).toUpperCase()}
                      </div>
                      {p}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
