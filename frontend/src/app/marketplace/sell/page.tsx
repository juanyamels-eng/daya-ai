'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card } from '@/components/ui'
import { BarChart3, DollarSign, Download, Star, Package, ArrowLeft } from 'lucide-react'

interface SellerStats {
  totalItems: number
  totalInstalls: number
  totalRevenue: number
  avgRating: number
}

interface SellerItem {
  id: string
  name: string
  installCount: number
  rating: number
  ratingCount: number
  priceCents: number
  createdAt: string
}

interface Purchase {
  id: string
  amountCents: number
  status: string
  createdAt: string
  item: { name: string }
  user: { name: string; email: string }
}

interface Review {
  id: string
  rating: number
  title: string
  content: string
  createdAt: string
  item: { name: string }
  user: { name: string }
}

export default function SellerDashboard() {
  const router = useRouter()
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const toast = useToast()

  const [stats, setStats] = useState<SellerStats | null>(null)
  const [items, setItems] = useState<SellerItem[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated()) { router.push('/auth/login'); return }
    loadAnalytics()
  }, [hasHydrated])

  async function loadAnalytics() {
    try {
      setLoading(true)
      const res = await api.get('/agent-builder/seller/analytics')
      setStats(res.data.stats)
      setItems(res.data.items || [])
      setPurchases(res.data.recentPurchases || [])
      setReviews(res.data.recentReviews || [])
    } catch {
      toast.error('Error cargando analytics')
    } finally {
      setLoading(false)
    }
  }

  if (!hasHydrated || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><p style={{ color: 'var(--text-tertiary)' }}>Cargando dashboard...</p></div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
          <Button variant="ghost" size="sm" onClick={() => router.push('/marketplace')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
              <BarChart3 size={24} style={{ color: 'var(--accent-500)' }} />
              Seller Dashboard
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              Analytics, revenue y feedback de tus agentes
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: '2rem' }}>
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Package size={16} style={{ color: 'var(--accent-500)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agentes</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats?.totalItems || 0}</div>
          </Card>
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Download size={16} style={{ color: 'var(--accent-500)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Instalaciones</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats?.totalInstalls || 0}</div>
          </Card>
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <DollarSign size={16} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>${((stats?.totalRevenue || 0) / 100).toFixed(2)}</div>
          </Card>
          <Card style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Star size={16} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rating Prom.</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{(stats?.avgRating || 0).toFixed(1)}</div>
          </Card>
        </div>

        {/* My Items */}
        <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Mis Agentes Publicados</h2>
          {items.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>
              Aún no has publicado ningún agente.{' '}
              <Link href="/agents" style={{ color: 'var(--accent-500)', textDecoration: 'underline' }}>Crea uno</Link> y publícalo.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 8, background: 'var(--bg-elevated)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {item.installCount} instalaciones · {item.ratingCount} reseñas
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Star size={12} style={{ color: '#f59e0b' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.rating.toFixed(1)}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        ${((item.installCount * item.priceCents) / 100).toFixed(2)} earned
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Recent Purchases */}
          <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Compras Recientes</h2>
            {purchases.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '1rem' }}>Sin compras aún</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {purchases.slice(0, 8).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, background: 'var(--bg-elevated)', fontSize: '0.8rem' }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{p.user?.name || 'Anon'}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}> instaló </span>
                      <span style={{ fontWeight: 500 }}>{p.item?.name}</span>
                    </div>
                    <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent Reviews */}
          <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Reseñas Recientes</h2>
            {reviews.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '1rem' }}>Sin reseñas aún</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {reviews.slice(0, 8).map(r => (
                  <div key={r.id} style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg-elevated)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{r.user?.name}</span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={10} style={{ color: s <= r.rating ? '#f59e0b' : 'var(--text-tertiary)', fill: s <= r.rating ? '#f59e0b' : 'none' }} />
                        ))}
                      </div>
                    </div>
                    {r.title && <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{r.title}</div>}
                    {r.content && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{r.content.slice(0, 100)}</div>}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4 }}>{r.item?.name}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
