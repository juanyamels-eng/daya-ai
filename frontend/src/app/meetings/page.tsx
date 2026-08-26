'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'

interface Meeting {
  id: string
  title: string
  platform: string
  status: string
  participants: string[]
  summary: string | null
  createdAt: string
}

const platformIcons: Record<string, string> = {
  zoom: '📹',
  teams: '💼',
  'google-meet': '🎥',
  manual: '📝',
}

export default function MeetingsPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    title: '',
    platform: 'manual',
    participants: '',
  })

  // Guard: sin sesión, a login (antes la página se quedaba cargando para siempre)
  useEffect(() => {
    if (hasHydrated && !token) router.push('/auth/login')
  }, [hasHydrated, token, router])

  useEffect(() => {
    if (!token) return
    fetch('/api/meetings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setMeetings(data.meetings || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token])

  const createMeeting = async () => {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: form.title,
        platform: form.platform,
        participants: form.participants.split(',').map(p => p.trim()).filter(Boolean),
      }),
    })
    const data = await res.json()
    if (data.meeting) {
      router.push(`/meetings/${data.meeting.id}`)
    }
  }

  const deleteMeeting = async (id: string) => {
    await fetch(`/api/meetings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setMeetings(meetings.filter(m => m.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Meeting Assistant</h1>
          <p className="text-muted-foreground">Notas en tiempo real, transcripción y tareas pendientes</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Nueva Reunión</Button>
      </div>

      {meetings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <p className="text-lg mb-2">📝</p>
            <p>No hay reuniones registradas. Crea una nueva para empezar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <Card key={meeting.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => router.push(`/meetings/${meeting.id}`)}>
              <CardContent className="p-4 flex items-center gap-4">
                <span className="text-2xl">{platformIcons[meeting.platform] || '📝'}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{meeting.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>{new Date(meeting.createdAt).toLocaleDateString('es-ES')}</span>
                    <span>•</span>
                    <span>{meeting.platform}</span>
                    {meeting.participants.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{meeting.participants.length} participantes</span>
                      </>
                    )}
                  </div>
                </div>
                <Badge variant={meeting.status === 'completed' ? 'success' : meeting.status === 'active' ? 'primary' : 'neutral'}>
                  {meeting.status}
                </Badge>
                <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); deleteMeeting(meeting.id) }}>
                  ✕
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Nueva Reunión</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Título</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Reunión de equipo"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Plataforma</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                >
                  <option value="manual">Manual</option>
                  <option value="zoom">Zoom</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="google-meet">Google Meet</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Participantes (separados por coma)</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={form.participants}
                  onChange={(e) => setForm({ ...form, participants: e.target.value })}
                  placeholder="Juan, María, Pedro"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button onClick={createMeeting} disabled={!form.title}>Crear Reunión</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
