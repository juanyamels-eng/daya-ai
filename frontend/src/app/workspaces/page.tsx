'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import type { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input, Badge } from '@/components/ui'
import { Plus, Users, FolderOpen, Trash2, ChevronRight, Building2 } from 'lucide-react'

interface Organization {
  id: string
  name: string
  slug: string
  logoUrl?: string
  plan: string
  myRole: string
  memberCount: number
  teamCount: number
  createdAt: string
}

export default function WorkspacesPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '' })

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated()) loadOrgs()
  }, [hasHydrated, isAuthenticated])

  async function loadOrgs() {
    try {
      setLoading(true)
      const res = await api.get('/workspaces/orgs')
      setOrgs(res.data.orgs || [])
    } catch { toast.error('Error cargando organizaciones') }
    finally { setLoading(false) }
  }

  async function createOrg() {
    if (!form.name || !form.slug) return toast.error('Nombre y slug requeridos')
    if (!/^[a-z0-9-]+$/.test(form.slug)) return toast.error('Slug: solo minúsculas, números y guiones')

    try {
      await api.post('/workspaces/orgs', form)
      toast.success('Organización creada')
      setForm({ name: '', slug: '' })
      setShowCreate(false)
      loadOrgs()
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error creando organización')
    }
  }

  async function deleteOrg(orgId: string) {
    if (!confirm('¿Eliminar esta organización? Esta acción no se puede deshacer.')) return
    try {
      await api.delete(`/workspaces/orgs/${orgId}`)
      toast.success('Organización eliminada')
      loadOrgs()
    } catch { toast.error('Error eliminando organización') }
  }

  if (!hasHydrated) return null

  const roleColors: Record<string, string> = {
    OWNER: '#8b5cf6',
    ADMIN: '#3b82f6',
    MEMBER: '#10b981',
    VIEWER: '#6b7280',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Building2 size={24} style={{ color: 'var(--accent-500)' }} />
              Workspaces
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              Organizaciones, equipos y proyectos para tu equipo
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Nueva Organización
          </Button>
        </div>

        {showCreate && (
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Crear Organización</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input placeholder="Nombre (ej: Mi Empresa)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Slug (ej: mi-empresa)" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button onClick={createOrg}>Crear</Button>
              </div>
            </div>
          </Card>
        )}

        {orgs.length === 0 && !loading && (
          <Card style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
            <Building2 size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>No tienes organizaciones aún</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 8 }}>
              Crea una organización para colaborar con tu equipo
            </p>
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {orgs.map(org => (
            <Card key={org.id} style={{ padding: '1.5rem', border: '1px solid var(--border-default)', cursor: 'pointer' }}
              onClick={() => router.push(`/workspaces/${org.slug}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {org.logoUrl ? (
                    <img src={org.logoUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--accent-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>{org.name}</h3>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>/{org.slug}</p>
                  </div>
                </div>
                <Badge variant="neutral" style={{ fontSize: '0.7rem' }}>{org.plan}</Badge>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={14} /> {org.memberCount} miembros
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FolderOpen size={14} /> {org.teamCount} equipos
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Badge variant="neutral" style={{ fontSize: '0.7rem', background: roleColors[org.myRole], color: '#fff' }}>
                  {org.myRole}
                </Badge>
                <div style={{ display: 'flex', gap: 4 }}>
                  {org.myRole === 'OWNER' && (
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); deleteOrg(org.id) }}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                  <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
