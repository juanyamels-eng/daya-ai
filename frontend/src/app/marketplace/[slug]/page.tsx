'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '@/store'
import type { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Badge, Input } from '@/components/ui'
import { ArrowLeft, Star, Download, ShoppingCart, Check, GitBranch, Globe } from 'lucide-react'

interface ItemDetail {
  id: string
  name: string
  slug: string
  description: string
  longDesc: string
  category: string
  type: string
  priceCents: number
  currency: string
  version: string
  rating: number
  ratingCount: number
  installCount: number
  icon?: string
  tags: string[]
  homepage?: string
  repository?: string
  sellerId: string
  createdAt: string
  reviews: { id: string; rating: number; title: string; content: string; createdAt: string; user: { name: string } }[]
  _count: { reviews: number; purchases: number }
}

export default function ItemDetailPage() {
  const { isAuthenticated } = useAuthStore()
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const toast = useToast()

  const [item, setItem] = useState<ItemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [owned, setOwned] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', content: '' })

  useEffect(() => {
    if (slug) loadItem()
  }, [slug])

  async function loadItem() {
    try {
      setLoading(true)
      const res = await api.get(`/marketplace/${slug}`)
      setItem(res.data.item)

      if (isAuthenticated()) {
        const ownRes = await api.get(`/marketplace/${res.data.item.id}/ownership`)
        setOwned(ownRes.data.owned)
      }
    } catch { toast.error('Item no encontrado') }
    finally { setLoading(false) }
  }

  async function purchaseItem() {
    if (!item) return
    if (!isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    try {
      await api.post(`/marketplace/${item.id}/purchase`)
      toast.success(`"${item.name}" instalado`)
      setOwned(true)
      loadItem()
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error instalando')
    }
  }

  async function submitReview() {
    if (!item) return
    try {
      await api.post(`/marketplace/${item.id}/reviews`, reviewForm)
      toast.success('Reseña publicada')
      setShowReview(false)
      setReviewForm({ rating: 5, title: '', content: '' })
      loadItem()
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error publicando reseña')
    }
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>
  if (!item) return <div style={{ padding: '2rem', textAlign: 'center' }}>Item no encontrado</div>

  const typeLabels: Record<string, string> = { TOOL: 'Tool', PLUGIN: 'Plugin', TEMPLATE: 'Template', FLOW: 'Flow' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
          <Button variant="ghost" size="sm" onClick={() => router.push('/marketplace')}>
            <ArrowLeft size={16} />
          </Button>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Marketplace</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', gap: 20, marginBottom: '2rem' }}>
          <div style={{ width: 80, height: 80, borderRadius: 16, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 }}>
            {item.icon || '🔧'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{item.name}</h1>
              <Badge variant="neutral" style={{ fontSize: '0.7rem' }}>{typeLabels[item.type]}</Badge>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 8 }}>{item.description}</p>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--text-tertiary)', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Star size={14} style={{ color: '#f59e0b' }} /> {item.rating.toFixed(1)} ({item.ratingCount} reseñas)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Download size={14} /> {item.installCount} instalaciones
              </span>
              <span>v{item.version}</span>
              <Badge variant="neutral" style={{ fontSize: '0.65rem' }}>{item.category}</Badge>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>
              {item.priceCents === 0 ? 'Gratis' : `$${(item.priceCents / 100).toFixed(2)}`}
            </div>
            {owned ? (
              <Badge variant="success" style={{ fontSize: '0.8rem', padding: '6px 16px' }}>
                <Check size={14} style={{ marginRight: 4 }} /> Instalado
              </Badge>
            ) : (
              <Button onClick={purchaseItem}>
                <ShoppingCart size={16} /> {item.priceCents === 0 ? 'Instalar' : 'Comprar'}
              </Button>
            )}
          </div>
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {item.tags.map(tag => (
              <Badge key={tag} variant="outline" style={{ fontSize: '0.75rem' }}>{tag}</Badge>
            ))}
          </div>
        )}

        {/* Links */}
        {(item.homepage || item.repository) && (
          <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem' }}>
            {item.homepage && (
              <a href={item.homepage} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-500)', fontSize: '0.85rem', textDecoration: 'none' }}>
                <Globe size={14} /> Homepage
              </a>
            )}
            {item.repository && (
              <a href={item.repository} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-500)', fontSize: '0.85rem', textDecoration: 'none' }}>
                <GitBranch size={14} /> Repository
              </a>
            )}
          </div>
        )}

        {/* Long Description */}
        {item.longDesc && (
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Descripción</h3>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {item.longDesc}
            </div>
          </Card>
        )}

        {/* Reviews */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontWeight: 600 }}>Reseñas ({item.reviews.length})</h3>
          {owned && !showReview && (
            <Button variant="ghost" size="sm" onClick={() => setShowReview(true)}>Escribir reseña</Button>
          )}
        </div>

        {showReview && (
          <Card style={{ padding: '1.25rem', marginBottom: 16, border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(r => (
                  <button key={r} onClick={() => setReviewForm(f => ({ ...f, rating: r }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                    <Star size={20} style={{ color: r <= reviewForm.rating ? '#f59e0b' : 'var(--text-tertiary)', fill: r <= reviewForm.rating ? '#f59e0b' : 'none' }} />
                  </button>
                ))}
              </div>
              <Input placeholder="Título" value={reviewForm.title} onChange={e => setReviewForm(f => ({ ...f, title: e.target.value }))} />
              <textarea placeholder="Tu reseña" value={reviewForm.content}
                onChange={e => setReviewForm(f => ({ ...f, content: e.target.value }))}
                rows={3}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setShowReview(false)}>Cancelar</Button>
                <Button onClick={submitReview}>Publicar</Button>
              </div>
            </div>
          </Card>
        )}

        {item.reviews.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
            No hay reseñas aún
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {item.reviews.map(review => (
              <Card key={review.id} style={{ padding: '1rem 1.25rem', border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{review.user.name}</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1, 2, 3, 4, 5].map(r => (
                        <Star key={r} size={12} style={{ color: r <= review.rating ? '#f59e0b' : 'var(--text-tertiary)', fill: r <= review.rating ? '#f59e0b' : 'none' }} />
                      ))}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {review.title && <h4 style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{review.title}</h4>}
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{review.content}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
