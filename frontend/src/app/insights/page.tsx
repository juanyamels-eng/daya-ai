'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Badge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { Brain, Lightbulb, Calendar, Mail, RefreshCw, ChevronRight, Sparkles, Target, X } from 'lucide-react'

interface Suggestion {
  id: string
  type: string
  title: string
  description: string
  confidence: number
  priority: string
  icon: string
  actionable: boolean
  suggestedAction?: string
}

interface Profile {
  summary: string
  factCount: number
}

interface CalendarInsight {
  title: string
}

export default function DashboardPage() {
  const { hasHydrated, isAuthenticated, user } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [calendarInsights, setCalendarInsights] = useState<CalendarInsight[]>([])
  const [emailSummary, setEmailSummary] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated()) loadAll()
  }, [hasHydrated, isAuthenticated])

  async function loadAll() {
    try {
      setLoading(true)
      const [sugRes, profileRes, calRes, emailRes] = await Promise.all([
        api.get('/memory/suggestions').catch(() => ({ data: { suggestions: [] } })),
        api.get('/memory/profile').catch(() => ({ data: { summary: '', factCount: 0 } })),
        api.get('/memory/calendar').catch(() => ({ data: { insights: [] } })),
        api.get('/memory/email').catch(() => ({ data: { summary: '' } })),
      ])
      setSuggestions(sugRes.data.suggestions || [])
      setProfile(profileRes.data)
      setCalendarInsights(calRes.data.insights || [])
      setEmailSummary(emailRes.data.summary || '')
    } catch { toast.error('Error cargando dashboard') }
    finally { setLoading(false) }
  }

  async function dismissSuggestion(id: string) {
    await api.post('/memory/suggestions/dismiss', { suggestionId: id })
    setSuggestions(prev => prev.filter(s => s.id !== id))
  }

  const priorityColor = (p: string) => p === 'high' ? '#ef4444' : p === 'medium' ? '#f59e0b' : '#6b7280'

  if (!hasHydrated) return null

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ marginBottom: '2rem' }}>
            <div className="skeleton-line skeleton-line--title" style={{ width: 200, height: 24 }} />
            <div className="skeleton-line skeleton-line--text-sm" style={{ width: 320, marginTop: 8 }} />
          </div>
          <div className="skeleton-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div className="skeleton-avatar" />
              <div style={{ flex: 1 }}>
                <div className="skeleton-line skeleton-line--text" style={{ width: '40%' }} />
                <div className="skeleton-line skeleton-line--text" />
                <div className="skeleton-line skeleton-line--text-sm" style={{ width: 100, marginTop: 8 }} />
              </div>
            </div>
          </div>
          <div className="skeleton-grid">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-line skeleton-line--title" />
                <div className="skeleton-line skeleton-line--text" />
                <div className="skeleton-line skeleton-line--text-sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Sparkles size={28} style={{ color: 'var(--accent-500)' }} />
            Hola, {user?.name || 'Daya User'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            Tu asistente inteligente ÔÇö Daya piensa por ti antes de que le pidas
          </p>
        </div>

        {/* Profile summary */}
        {profile && profile.summary && (
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-default)', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-base))' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <Brain size={24} style={{ color: 'var(--accent-500)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3 style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>Lo que s├® de ti</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>{profile.summary}</p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: 8 }}>{profile.factCount} datos conocidos</p>
              </div>
            </div>
          </Card>
        )}

        {/* Proactive suggestions */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lightbulb size={20} style={{ color: '#f59e0b' }} />
            Sugerencias para ti
          </h2>
          {suggestions.length === 0 ? (
            <Card style={{ border: '1px solid var(--border-default)' }}>
              <EmptyState
                icon="chat"
                title="Daya está aprendiendo sobre ti"
                description="Cuéntame más en el chat para recibir sugerencias personalizadas."
                action={<Button size="sm" onClick={() => router.push('/dashboard')}>Ir al chat</Button>}
              />
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {suggestions.map(s => (
                <Card key={s.id} style={{ padding: '1.25rem', border: '1px solid var(--border-default)', position: 'relative' }}>
                  <button
                    onClick={() => dismissSuggestion(s.id)}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                  >
                    <X size={14} />
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.2rem' }}>{s.icon}</span>
                    <Badge style={{ fontSize: '0.7rem', background: priorityColor(s.priority), color: '#fff' }}>
                      {s.priority}
                    </Badge>
                  </div>
                  <h4 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{s.title}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>{s.description}</p>
                  {s.suggestedAction && (
                    <button
                      style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--accent-500)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {s.suggestedAction} <ChevronRight size={14} />
                    </button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Quick insights grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {/* Calendar */}
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Calendar size={18} style={{ color: '#6366f1' }} />
              <h3 style={{ fontWeight: 600, fontSize: '0.9rem' }}>Calendario</h3>
            </div>
            {calendarInsights.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Sin insights disponibles</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {calendarInsights.slice(0, 3).map((insight, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 500 }}>{insight.title}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Email */}
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Mail size={18} style={{ color: '#10b981' }} />
              <h3 style={{ fontWeight: 600, fontSize: '0.9rem' }}>Email</h3>
            </div>
            {emailSummary ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>{emailSummary}</p>
            ) : (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Sin emails analizados</p>
            )}
          </Card>

          {/* Quick actions */}
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Target size={18} style={{ color: '#f59e0b' }} />
              <h3 style={{ fontWeight: 600, fontSize: '0.9rem' }}>Acciones r├ípidas</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Button variant="ghost" size="sm" style={{ justifyContent: 'flex-start', fontSize: '0.8rem' }} onClick={() => router.push('/orchestrator')}>
                ­ƒñû Ejecutar tarea compleja
              </Button>
              <Button variant="ghost" size="sm" style={{ justifyContent: 'flex-start', fontSize: '0.8rem' }} onClick={() => router.push('/mcp')}>
                ­ƒöî Gestionar MCP servers
              </Button>
              <Button variant="ghost" size="sm" style={{ justifyContent: 'flex-start', fontSize: '0.8rem' }} onClick={() => router.push('/costs')}>
                ­ƒôè Ver analytics
              </Button>
            </div>
          </Card>
        </div>

        {/* Refresh */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Button variant="ghost" onClick={loadAll} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} style={{ marginRight: 8 }} />
            Actualizar
          </Button>
        </div>
      </div>
    </div>
  )
}
