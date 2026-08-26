'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Badge } from '@/components/ui'
import { Activity, RefreshCw, TrendingUp, Zap, Database } from 'lucide-react'

interface ToolAnalytics {
  tool: string
  totalCalls: number
  successCount: number
  failCount: number
  successRate: number
  avgDurationMs: number
  p95DurationMs: number
  lastUsed: number
  uniqueUsers: number
}

export default function CostDashboardPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const [analytics, setAnalytics] = useState<ToolAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [cacheStats, setCacheStats] = useState({ entries: 0, totalHits: 0 })

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated()) loadAll()
  }, [hasHydrated, isAuthenticated])

  async function loadAll() {
    try {
      setLoading(true)
      const [analyticsRes, cacheRes] = await Promise.all([
        api.get('/analytics/tools').catch(() => ({ data: { analytics: [] } })),
        api.get('/analytics/cache').catch(() => ({ data: { cache: { entries: 0, totalHits: 0 } } })),
      ])
      setAnalytics(analyticsRes.data.analytics || [])
      setCacheStats(cacheRes.data.cache || { entries: 0, totalHits: 0 })
    } catch { toast.error('Error cargando datos') }
    finally { setLoading(false) }
  }

  const totalCalls = analytics.reduce((s, a) => s + a.totalCalls, 0)
  const totalSuccess = analytics.reduce((s, a) => s + a.successCount, 0)
  const totalFails = analytics.reduce((s, a) => s + a.failCount, 0)
  const avgSuccessRate = totalCalls ? totalSuccess / totalCalls : 0

  if (!hasHydrated) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Dashboard de Costos y Uso</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              Analítica de herramientas, caché y consumo de tokens
            </p>
          </div>
          <Button variant="ghost" onClick={loadAll} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: '1.5rem' }}>
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Zap size={16} style={{ color: 'var(--accent-500)' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Llamadas</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalCalls.toLocaleString()}</div>
          </Card>
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TrendingUp size={16} style={{ color: '#10b981' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tasa de Éxito</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{(avgSuccessRate * 100).toFixed(1)}%</div>
          </Card>
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Activity size={16} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Errores</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalFails.toLocaleString()}</div>
          </Card>
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Database size={16} style={{ color: '#6366f1' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Caché</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{cacheStats.totalHits} hits</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{cacheStats.entries} entries</div>
          </Card>
        </div>

        {/* Tool analytics table */}
        <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
          <h3 style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>Uso por Herramienta</h3>
          {analytics.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>Sin datos aún — usa herramientas para ver analítica</p>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Herramienta</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Llamadas</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Éxito</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Fallo</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Tasa</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Latencia Avg</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>P95</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Usuarios</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map(a => (
                    <tr key={a.tool} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500, fontFamily: 'monospace' }}>{a.tool}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{a.totalCalls}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>{a.successCount}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: a.failCount > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>{a.failCount}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <Badge variant={a.successRate > 0.9 ? 'success' : a.successRate > 0.7 ? 'primary' : 'danger'}>
                          {(a.successRate * 100).toFixed(0)}%
                        </Badge>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{a.avgDurationMs.toFixed(0)}ms</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{a.p95DurationMs.toFixed(0)}ms</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{a.uniqueUsers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
