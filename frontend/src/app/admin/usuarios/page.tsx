'use client'
import { useEffect, useState } from 'react'

import { ADMIN_KEY, API } from '../../../lib/config'

const PLANS = ['FREE', 'PRO']
const PLAN_COLORS: Record<string, string> = { FREE: '#6b7280', PRO: '#27272a' }

export default function AdminUsuarios() {
  const [users, setUsers] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    let result = users
    if (search) result = result.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
    if (planFilter !== 'ALL') result = result.filter(u => u.plan === planFilter)
    setFiltered(result)
  }, [users, search, planFilter])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/system/users`, { headers: { 'x-admin-key': ADMIN_KEY } })
      const data = await res.json()
      setUsers(data.users || [])
    } catch { setUsers([]) }
    setLoading(false)
  }

  const updateUser = async (userId: string, changes: any) => {
    setSaving(true)
    try {
      await fetch(`${API}/api/system/users/${userId}`, {
        method: 'PATCH',
        headers: { 'x-admin-key': ADMIN_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      })
      showToast('✓ Usuario actualizado')
      loadUsers()
      setSelected(null)
    } catch { showToast('✗ Error al actualizar') }
    setSaving(false)
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('¿Seguro que quieres eliminar este usuario? Esta acción no se puede deshacer.')) return
    try {
      await fetch(`${API}/api/system/users/${userId}`, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } })
      showToast('✓ Usuario eliminado')
      loadUsers()
      setSelected(null)
    } catch { showToast('✗ Error al eliminar') }
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)', position: 'relative' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toast.startsWith('✓') ? 'rgba(16,185,129,0.9)' : 'rgba(248,113,113,0.9)', color: 'white', padding: '10px 18px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600, zIndex: 1000, animation: 'fadeIn 0.2s ease' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Gestión</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Usuarios</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 4 }}>{users.length} usuarios registrados</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar por nombre o email..."
          style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['ALL', ...PLANS].map(p => (
            <button key={p} onClick={() => setPlanFilter(p)}
              style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${planFilter === p ? 'var(--accent-500)' : 'var(--border-default)'}`, background: planFilter === p ? 'var(--bg-elevated)' : 'var(--bg-surface)', color: planFilter === p ? 'var(--accent-400)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
              {p === 'ALL' ? 'Todos' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 100px 80px 80px', padding: '10px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
          {['Usuario', 'Email', 'Plan', 'Mensajes', 'Creado', 'Acción'].map(h => (
            <span key={h} style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Cargando usuarios...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No se encontraron usuarios</div>
        ) : (
          filtered.map((user, i) => (
            <div key={user.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 100px 80px 80px', padding: '12px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border-default)' : 'none', alignItems: 'center', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: `hsl(${(user.name?.charCodeAt(0) || 200) * 5}, 55%, 50%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                  {user.name?.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '0.83rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: PLAN_COLORS[user.plan] + '20', color: PLAN_COLORS[user.plan] }}>{user.plan}</span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{user.messagesUsed}/{user.messagesLimit}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{new Date(user.createdAt).toLocaleDateString('es', { month: 'short', day: 'numeric' })}</span>
              <button onClick={() => setSelected(user)}
                style={{ padding: '5px 10px', borderRadius: 7, background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Editar
              </button>
            </div>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 28, width: 420, animation: 'scaleIn 0.2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, color: 'var(--text-primary)', marginBottom: 4 }}>Editar usuario</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Plan</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {PLANS.map(p => (
                    <button key={p} onClick={() => setSelected({ ...selected, plan: p })}
                      style={{ padding: '9px', borderRadius: 9, border: `1px solid ${selected.plan === p ? PLAN_COLORS[p] : 'var(--border-default)'}`, background: selected.plan === p ? PLAN_COLORS[p] + '15' : 'var(--bg-elevated)', color: selected.plan === p ? PLAN_COLORS[p] : 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Límite de mensajes</label>
                <input type="number" value={selected.messagesLimit}
                  onChange={e => setSelected({ ...selected, messagesLimit: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => updateUser(selected.id, { plan: selected.plan, messagesLimit: selected.messagesLimit })} disabled={saving}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button onClick={() => deleteUser(selected.id)}
                  style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font-body)' }}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
