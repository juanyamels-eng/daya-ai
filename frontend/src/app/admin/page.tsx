'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { Users, MessageSquare, Brain, Rocket, Zap, Dna, Lightbulb, type LucideIcon } from 'lucide-react'

import { ADMIN_KEY, API } from '../../lib/config'

interface AdminStats {
  users?: { total?: number; today?: number; byPlan?: { plan: string; _count: number }[] }
  conversations?: number
  training?: {
    total?: number
    highQuality?: number
    readyForFineTuning?: boolean
    message?: string
    recentInsights?: { type: string; data: string; date: string }[]
  }
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/system/stats`, { headers: { 'x-admin-key': ADMIN_KEY } })
      .then(r => r.json()).then(setStats).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingScreen />

  const plans = stats?.users?.byPlan || []
  const planMap: Record<string, number> = {}
  plans.forEach((p) => { planMap[p.plan] = p._count })

  return (
    <div style={{ padding: '32px 32px', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Panel de Control</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 4 }}>Vista general de Daya AI en tiempo real</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Usuarios totales', value: stats?.users?.total || 0, icon: Users, color: '#3f3f46', change: `+${stats?.users?.today || 0} hoy` },
          { label: 'Conversaciones', value: stats?.conversations || 0, icon: MessageSquare, color: '#27272a', change: 'Total histórico' },
          { label: 'Datos entrenamiento', value: stats?.training?.total || 0, icon: Brain, color: '#10b981', change: `${stats?.training?.highQuality || 0} alta calidad` },
          { label: 'Listo para fine-tuning', value: stats?.training?.readyForFineTuning ? '✓ Sí' : '✗ No', icon: Rocket, color: stats?.training?.readyForFineTuning ? '#10b981' : '#f59e0b', change: stats?.training?.readyForFineTuning ? '¡Puedes entrenar!' : `Faltan ${Math.max(0, 500 - (stats?.training?.total || 0))} datos` },
        ].map(card => (
          <KPICard key={card.label} {...card} />
        ))}
      </div>

      {/* Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>
        {/* Planes */}
        <Section title="Distribución de planes" icon={Zap}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { plan: 'FREE', color: '#6b7280', label: 'Gratis' },
              { plan: 'PRO', color: '#27272a', label: 'Pro $13' },
            ].map(p => {
              const count = planMap[p.plan] || 0
              const total = stats?.users?.total || 1
              const pct = Math.round((count / total) * 100)
              return (
                <div key={p.plan}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />{p.label}
                    </span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{count} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({pct}%)</span></span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: p.color, borderRadius: 3, transition: 'width 1s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Training status */}
        <Section title="Estado del entrenamiento" icon={Dna}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <StatRow label="Datos totales" value={stats?.training?.total || 0} />
            <StatRow label="Alta calidad (≥0.7)" value={stats?.training?.highQuality || 0} good />
            <StatRow label="Usuarios registrados" value={stats?.users?.total || 0} />
            <StatRow label="Nuevos hoy" value={stats?.users?.today || 0} />
            <div style={{ marginTop: 8, padding: '12px', borderRadius: 10, background: stats?.training?.readyForFineTuning ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${stats?.training?.readyForFineTuning ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
              <p style={{ fontSize: '0.8rem', color: stats?.training?.readyForFineTuning ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                {stats?.training?.message || 'Calculando...'}
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* Recent insights */}
      <Section title="Últimos insights de Daya" icon={Lightbulb}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {(stats?.training?.recentInsights || []).slice(0, 6).map((insight, i) => {
            let data: unknown = {}
            try { data = JSON.parse(insight.data) } catch {}
            return (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {insight.type.replace(/_/g, ' ')}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {typeof data === 'object' ? JSON.stringify(data).slice(0, 80) + '...' : String(data).slice(0, 80)}
                </p>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 6 }}>
                  {new Date(insight.date).toLocaleDateString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )
          })}
          {(!stats?.training?.recentInsights || stats.training.recentInsights.length === 0) && (
            <div style={{ gridColumn: '1/-1', padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              No hay insights aún. El sistema genera insights cada noche a las 3:00 AM.
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

interface KPICardProps {
  label: string
  value: string | number
  icon: LucideIcon
  color: string
  change: string
}

function KPICard({ label, value, icon: Icon, color, change }: KPICardProps) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.6 }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>{label}</span>
        <Icon size={20} color={color} />
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: 'var(--font-body)' }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: color, fontWeight: 500 }}>{change}</div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Icon size={16} strokeWidth={1.8} style={{ color: 'var(--text-tertiary)' }} />
        <h2 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function StatRow({ label, value, good }: { label: string; value: string | number; good?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-default)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: good ? '#10b981' : 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border-default)', borderTopColor: 'var(--accent-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Cargando datos...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
