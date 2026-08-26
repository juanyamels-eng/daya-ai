'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import type { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input, Badge } from '@/components/ui'
import { Search, Star, Download, Plus, Package } from 'lucide-react'

interface MarketplaceItem {
  id: string
  name: string
  slug: string
  description: string
  category: string
  type: string
  priceCents: number
  currency: string
  rating: number
  ratingCount: number
  installCount: number
  icon?: string
  tags: string[]
  version: string
  createdAt: string
}

interface Category {
  value: string
  label: string
  icon: string
}

export default function MarketplacePage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()

  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [sortBy, setSortBy] = useState('rating')

  useEffect(() => {
    loadCategories()
    loadItems()
  }, [selectedCategory, selectedType, sortBy])

  async function loadCategories() {
    try {
      const res = await api.get('/marketplace/meta/categories')
      setCategories(res.data.categories || [])
    } catch {}
  }

  async function loadItems() {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedCategory) params.set('category', selectedCategory)
      if (selectedType) params.set('type', selectedType)
      if (search) params.set('search', search)
      params.set('sort', sortBy)

      const res = await api.get(`/marketplace?${params}`)
      setItems(res.data.items || [])
    } catch { toast.error('Error cargando marketplace') }
    finally { setLoading(false) }
  }

  async function handleSearch() {
    loadItems()
  }

  async function purchaseItem(item: MarketplaceItem) {
    if (!isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    if (item.priceCents === 0) {
      try {
        await api.post(`/marketplace/${item.id}/purchase`)
        toast.success(`"${item.name}" instalado gratuitamente`)
        loadItems()
      } catch (e: unknown) {
        const err = e as AxiosError<{ error?: string }>
        toast.error(err.response?.data?.error || 'Error instalando')
      }
    } else {
      // Would integrate with PayPal/Stripe
      toast.info('Redirigiendo a pago...')
    }
  }

  if (!hasHydrated) return null

  const typeLabels: Record<string, string> = {
    TOOL: 'Tool',
    PLUGIN: 'Plugin',
    TEMPLATE: 'Template',
    FLOW: 'Flow',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Package size={24} style={{ color: 'var(--accent-500)' }} />
              Marketplace
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              Tools, plugins, templates y flows de la comunidad
            </p>
          </div>
          {isAuthenticated() && (
            <Button onClick={() => router.push('/marketplace/sell')}>
              <Plus size={16} /> Vender
            </Button>
          )}
        </div>

        {/* Search & Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 250, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <Input
              placeholder="Buscar tools, plugins, templates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ paddingLeft: 36 }}
            />
          </div>
          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
          </select>
          <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
            <option value="">Todos los tipos</option>
            <option value="TOOL">Tool</option>
            <option value="PLUGIN">Plugin</option>
            <option value="TEMPLATE">Template</option>
            <option value="FLOW">Flow</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
            <option value="rating">Mejor valorados</option>
            <option value="newest">Más recientes</option>
            <option value="installs">Más instalados</option>
            <option value="price">Precio (bajo a alto)</option>
          </select>
        </div>

        {/* Items Grid */}
        {loading ? (
          <div className="skeleton-grid">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="skeleton-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="skeleton-avatar" />
                    <div>
                      <div className="skeleton-line" style={{ width: 120, height: 14 }} />
                      <div className="skeleton-line skeleton-line--text-sm" style={{ width: 40, marginTop: 4 }} />
                    </div>
                  </div>
                  <div className="skeleton-line" style={{ width: 50, height: 20, borderRadius: 20 }} />
                </div>
                <div className="skeleton-line skeleton-line--text" />
                <div className="skeleton-line skeleton-line--text" style={{ width: '70%' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1,2].map(j => <div key={j} className="skeleton-line" style={{ width: 50, height: 18, borderRadius: 20 }} />)}
                </div>
                <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <div className="skeleton-line skeleton-line--text-sm" style={{ width: 80 }} />
                  <div className="skeleton-line" style={{ width: 60, height: 30, borderRadius: 8 }} />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
            <Package size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>No se encontraron items</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 8 }}>
              Sé el primero en publicar algo en el marketplace
            </p>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {items.map(item => (
              <Card key={item.id} style={{ padding: '1.5rem', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 12 }}
                onClick={() => router.push(`/marketplace/${item.slug}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                      {item.icon || '🔧'}
                    </div>
                    <div>
                      <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.name}</h3>
                      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>v{item.version}</p>
                    </div>
                  </div>
                  <Badge variant="neutral" style={{ fontSize: '0.65rem' }}>{typeLabels[item.type] || item.type}</Badge>
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, flex: 1 }}>
                  {item.description.length > 120 ? item.description.slice(0, 120) + '...' : item.description}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {item.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" style={{ fontSize: '0.65rem' }}>{tag}</Badge>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Star size={12} style={{ color: '#f59e0b' }} /> {item.rating.toFixed(1)} ({item.ratingCount})
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Download size={12} /> {item.installCount}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {item.priceCents === 0 ? 'Gratis' : `$${(item.priceCents / 100).toFixed(2)}`}
                    </span>
                    <Button size="sm" onClick={e => { e.stopPropagation(); purchaseItem(item) }}>
                      {item.priceCents === 0 ? 'Instalar' : 'Comprar'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
