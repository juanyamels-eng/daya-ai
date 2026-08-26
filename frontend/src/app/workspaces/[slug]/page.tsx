'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '@/store'
import type { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input, Badge } from '@/components/ui'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'

interface OrgDetails {
  id: string
  name: string
  slug: string
  myRole: string
  members: { userId: string; role: string; user: { id: string; name: string; email: string; avatarUrl?: string } }[]
  teams: { id: string; name: string; _count: { members: number } }[]
  projects: { id: string; name: string; status: string; _count: { tasks: number } }[]
  settings?: { defaultModel: string; ssoEnabled: boolean }
}

export default function OrgDetailPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const toast = useToast()

  const [org, setOrg] = useState<OrgDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'members' | 'teams' | 'projects'>('members')

  // Forms
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [projectForm, setProjectForm] = useState({ name: '', description: '' })

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated() && slug) loadOrg()
  }, [hasHydrated, isAuthenticated, slug])

  async function loadOrg() {
    try {
      setLoading(true)
      const res = await api.get(`/workspaces/orgs/${slug}`)
      setOrg(res.data.org)
    } catch { toast.error('Error cargando organización') }
    finally { setLoading(false) }
  }

  async function inviteMember() {
    if (!inviteEmail) return toast.error('Email requerido')
    try {
      await api.post(`/workspaces/orgs/${org!.id}/members`, { email: inviteEmail, role: inviteRole })
      toast.success('Miembro invitado')
      setInviteEmail(''); setShowInvite(false); loadOrg()
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error invitando')
    }
  }

  async function removeMember(userId: string) {
    if (!confirm('¿Eliminar este miembro?')) return
    try {
      await api.delete(`/workspaces/orgs/${org!.id}/members/${userId}`)
      toast.success('Miembro eliminado')
      loadOrg()
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error eliminando')
    }
  }

  async function updateMemberRole(userId: string, role: string) {
    try {
      await api.put(`/workspaces/orgs/${org!.id}/members/${userId}`, { role })
      toast.success('Rol actualizado')
      loadOrg()
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error actualizando rol')
    }
  }

  async function createTeam() {
    if (!teamName) return toast.error('Nombre requerido')
    try {
      await api.post(`/workspaces/orgs/${org!.id}/teams`, { name: teamName })
      toast.success('Equipo creado')
      setTeamName(''); setShowCreateTeam(false); loadOrg()
    } catch { toast.error('Error creando equipo') }
  }

  async function createProject() {
    if (!projectForm.name) return toast.error('Nombre requerido')
    try {
      await api.post(`/workspaces/orgs/${org!.id}/projects`, projectForm)
      toast.success('Proyecto creado')
      setProjectForm({ name: '', description: '' }); setShowCreateProject(false); loadOrg()
    } catch { toast.error('Error creando proyecto') }
  }

  if (!hasHydrated || loading) return null
  if (!org) return <div style={{ padding: '2rem', textAlign: 'center' }}>Organización no encontrada</div>

  const canManage = ['OWNER', 'ADMIN'].includes(org.myRole)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
          <Button variant="ghost" size="sm" onClick={() => router.push('/workspaces')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{org.name}</h1>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>/{org.slug} · {org.members.length} miembros</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: 8 }}>
          {(['members', 'teams', 'projects'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: '0.85rem', fontWeight: tab === t ? 600 : 400,
                background: tab === t ? 'var(--accent-500)' : 'transparent', color: tab === t ? '#fff' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer' }}>
              {t === 'members' ? 'Miembros' : t === 'teams' ? 'Equipos' : 'Proyectos'}
              <span style={{ marginLeft: 6, fontSize: '0.75rem' }}>
                {t === 'members' ? org.members.length : t === 'teams' ? org.teams.length : org.projects.length}
              </span>
            </button>
          ))}
        </div>

        {/* Members Tab */}
        {tab === 'members' && (
          <div>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <Button onClick={() => setShowInvite(true)}><Plus size={16} /> Invitar Miembro</Button>
              </div>
            )}

            {showInvite && (
              <Card style={{ padding: '1rem', marginBottom: 16, border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input placeholder="email@ejemplo.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ flex: 1 }} />
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                    <option value="MEMBER">Miembro</option>
                    <option value="ADMIN">Admin</option>
                    <option value="VIEWER">Observador</option>
                  </select>
                  <Button onClick={inviteMember}>Invitar</Button>
                  <Button variant="ghost" onClick={() => setShowInvite(false)}>Cancelar</Button>
                </div>
              </Card>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {org.members.map(m => {
                return (
                  <Card key={m.userId} style={{ padding: '1rem 1.25rem', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                        {m.user.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.user.name}</div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{m.user.email}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {canManage && m.role !== 'OWNER' ? (
                        <select value={m.role} onChange={e => updateMemberRole(m.userId, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                          <option value="ADMIN">Admin</option>
                          <option value="MEMBER">Miembro</option>
                          <option value="VIEWER">Observador</option>
                        </select>
                      ) : (
                        <Badge variant="neutral" style={{ fontSize: '0.7rem' }}>{m.role}</Badge>
                      )}
                      {canManage && m.role !== 'OWNER' && (
                        <Button variant="ghost" size="sm" onClick={() => removeMember(m.userId)}>
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* Teams Tab */}
        {tab === 'teams' && (
          <div>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <Button onClick={() => setShowCreateTeam(true)}><Plus size={16} /> Nuevo Equipo</Button>
              </div>
            )}

            {showCreateTeam && (
              <Card style={{ padding: '1rem', marginBottom: 16, border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input placeholder="Nombre del equipo" value={teamName} onChange={e => setTeamName(e.target.value)} style={{ flex: 1 }} />
                  <Button onClick={createTeam}>Crear</Button>
                  <Button variant="ghost" onClick={() => setShowCreateTeam(false)}>Cancelar</Button>
                </div>
              </Card>
            )}

            {org.teams.length === 0 ? (
              <Card style={{ padding: '2rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
                <p style={{ color: 'var(--text-tertiary)' }}>No hay equipos creados</p>
              </Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {org.teams.map(team => (
                  <Card key={team.id} style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
                    <h4 style={{ fontWeight: 600, marginBottom: 8 }}>{team.name}</h4>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                      {team._count.members} miembros
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Projects Tab */}
        {tab === 'projects' && (
          <div>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <Button onClick={() => setShowCreateProject(true)}><Plus size={16} /> Nuevo Proyecto</Button>
              </div>
            )}

            {showCreateProject && (
              <Card style={{ padding: '1rem', marginBottom: 16, border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Input placeholder="Nombre del proyecto" value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} />
                  <Input placeholder="Descripción (opcional)" value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button variant="ghost" onClick={() => setShowCreateProject(false)}>Cancelar</Button>
                    <Button onClick={createProject}>Crear Proyecto</Button>
                  </div>
                </div>
              </Card>
            )}

            {org.projects.length === 0 ? (
              <Card style={{ padding: '2rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
                <p style={{ color: 'var(--text-tertiary)' }}>No hay proyectos creados</p>
              </Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {org.projects.map(project => (
                  <Card key={project.id} style={{ padding: '1.25rem', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontWeight: 600, marginBottom: 4 }}>{project.name}</h4>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{project._count.tasks} tareas</p>
                      </div>
                      <Badge variant={project.status === 'ACTIVE' ? 'success' : 'neutral'} style={{ fontSize: '0.7rem' }}>
                        {project.status}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
