'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input, Badge } from '@/components/ui'
import { Plus, Trash2, RefreshCw, Webhook, ExternalLink } from 'lucide-react'

const VALID_EVENTS = [
  { value: 'document.indexed', label: 'Documento indexado' },
  { value: 'document.removed', label: 'Documento eliminado' },
  { value: 'task.completed', label: 'Tarea completada' },
  { value: 'orchestrator.done', label: 'Orquestador terminado' },
  { value: 'graphrag.synced', label: 'GraphRAG sincronizado' },
  { value: 'browser.screenshot', label: 'Screenshot del navegador' },
]

interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  createdAt: number
}

export default function WebhooksPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ url: '', events: [] as string[] })

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated()) loadWebhooks()
  }, [hasHydrated, isAuthenticated])

  async function loadWebhooks() {
    try {
      setLoading(true)
      const res = await api.get('/webhooks')
      setWebhooks(res.data.webhooks || [])
    } catch { toast.error('Error cargando webhooks') }
    finally { setLoading(false) }
  }

  async function addWebhook() {
    if (!form.url || form.events.length === 0) return toast.error('URL y al menos un evento requeridos')
    try {
      await api.post('/webhooks', form)
      toast.success('Webhook registrado')
      setForm({ url: '', events: [] })
      setShowAdd(false)
      loadWebhooks()
    } catch { toast.error('Error registrando webhook') }
  }

  async function removeWebhook(id: string) {
    try {
      await api.delete(`/webhooks/${id}`)
      toast.success('Webhook eliminado')
      loadWebhooks()
    } catch { toast.error('Error eliminando webhook') }
  }

  function toggleEvent(event: string) {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }))
  }

  if (!hasHydrated) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Webhooks</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              Notificaciones push a servicios externos cuando ocurren eventos
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={loadWebhooks} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus size={16} /> Agregar
            </Button>
          </div>
        </div>

        {showAdd && (
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Nuevo Webhook</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input
                placeholder="URL de destino (https://tu-servicio.com/webhook)"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Eventos:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {VALID_EVENTS.map(ev => (
                    <button
                      key={ev.value}
                      onClick={() => toggleEvent(ev.value)}
                      style={{
                        padding: '4px 12px', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer',
                        border: `1px solid ${form.events.includes(ev.value) ? 'var(--accent-500)' : 'var(--border-default)'}`,
                        background: form.events.includes(ev.value) ? 'var(--accent-500)' : 'transparent',
                        color: form.events.includes(ev.value) ? '#fff' : 'var(--text-primary)',
                      }}
                    >
                      {ev.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancelar</Button>
                <Button onClick={addWebhook}>Registrar</Button>
              </div>
            </div>
          </Card>
        )}

        {webhooks.length === 0 && !loading && (
          <Card style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
            <Webhook size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>No hay webhooks configurados</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 8 }}>
              Registra un webhook para recibir notificaciones en tu servicio
            </p>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {webhooks.map(wh => (
            <Card key={wh.id} style={{ padding: '1rem 1.5rem', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ExternalLink size={14} style={{ color: 'var(--accent-500)' }} />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{wh.url}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {wh.events.map(e => (
                      <Badge key={e} variant="neutral" style={{ fontSize: '0.7rem' }}>{e}</Badge>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeWebhook(wh.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
