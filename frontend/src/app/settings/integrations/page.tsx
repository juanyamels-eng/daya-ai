'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'

interface SlackIntegration {
  id: string
  teamId: string
  teamName: string
  channelId: string | null
  channelName: string | null
  isActive: boolean
  createdAt: string
}

export default function SlackIntegrationPage() {
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const router = useRouter()
  const [integrations, setIntegrations] = useState<SlackIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [installUrl, setInstallUrl] = useState('')

  // Guard: sin sesión, a login (antes la página se quedaba cargando para siempre)
  useEffect(() => {
    if (hasHydrated && !token) router.push('/auth/login')
  }, [hasHydrated, token, router])

  useEffect(() => {
    if (!token) return
    Promise.all([
      fetch('/api/slack/integrations', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/slack/install-url', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([intData, urlData]) => {
      setIntegrations(intData.integrations || [])
      setInstallUrl(urlData.url || '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [token])

  const disconnect = async (id: string) => {
    await fetch(`/api/slack/integrations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setIntegrations(integrations.filter(i => i.id !== id))
  }

  const toggleActive = async (id: string, current: boolean) => {
    const res = await fetch(`/api/slack/integrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: !current }),
    })
    await res.json()
    setIntegrations(integrations.map(i => i.id === id ? { ...i, isActive: !current } : i))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Slack Integration</h1>
        <p className="text-muted-foreground">Conecta DAYA a tus canales de Slack</p>
      </div>

      {/* Install */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Instalar DAYA en Slack</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            DAYA responderá menciones en canales de Slack donde sea invitado. Usa <code>@DAYA</code> para interactuar.
          </p>
          {installUrl ? (
            <a href={installUrl} target="_blank" rel="noopener noreferrer">
              <Button>
                <span className="mr-2">💬</span>
                Instalar en Slack
              </Button>
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              Configura SLACK_CLIENT_ID y SLACK_CLIENT_SECRET en el backend para habilitar la instalación.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspaces Conectados ({integrations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay workspaces de Slack conectados.</p>
          ) : (
            <div className="space-y-3">
              {integrations.map((int) => (
                <div key={int.id} className="flex items-center gap-4 p-3 rounded-lg border">
                  <span className="text-2xl">💬</span>
                  <div className="flex-1">
                    <h3 className="font-medium">{int.teamName}</h3>
                    <p className="text-xs text-muted-foreground">
                      {int.channelName ? `Canal: #${int.channelName}` : 'Todos los canales'} • ID: {int.teamId}
                    </p>
                  </div>
                  <Badge variant={int.isActive ? 'success' : 'neutral'}>
                    {int.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Button size="sm" variant="secondary" onClick={() => toggleActive(int.id, int.isActive)}>
                    {int.isActive ? 'Pausar' : 'Activar'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => disconnect(int.id)}>
                    Desconectar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
