'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || ''

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
  { href: '/admin/entrenamiento', label: 'Entrenamiento', icon: '🧠' },
  { href: '/admin/sistema', label: 'Sistema', icon: '⚙️' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('daya-admin-auth')
    if (saved === 'true') setAuthorized(true)
  }, [])

  const handleAuth = () => {
    if (keyInput === ADMIN_KEY) {
      sessionStorage.setItem('daya-admin-auth', 'true')
      setAuthorized(true)
    } else {
      setError(true)
      setTimeout(() => setError(false), 2000)
    }
  }

  if (!authorized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', fontFamily: 'var(--font-body)' }}>
        <div style={{ width: 360, animation: 'fadeUp 0.4s ease' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
              <span style={{ fontSize: 22 }}>🔐</span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--text-primary)', marginBottom: 6 }}>Panel de Administración</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Acceso restringido · Solo para administradores</p>
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: 24 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Clave de administrador</label>
            <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAuth()}
              placeholder="••••••••••••••••"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: `1px solid ${error ? 'var(--red)' : 'var(--border-default)'}`, color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--font-body)', marginBottom: 12, transition: 'border 0.15s' }} />
            {error && <p style={{ fontSize: '0.78rem', color: 'var(--red)', marginBottom: 10 }}>⚠ Clave incorrecta</p>}
            <button onClick={handleAuth} style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
              Acceder →
            </button>
          </div>
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            <Link href="/dashboard" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>← Volver a Daya</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-base)', fontFamily: 'var(--font-body)' }}>
      {/* Admin Sidebar */}
      <div style={{ width: 220, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Header */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3L4 7.5V16.5L12 21L20 16.5V7.5L12 3Z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 3V21" stroke="white" strokeWidth="1.5" strokeLinecap="round"/><path d="M4 7.5L12 12L20 7.5" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Daya AI</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--red)', fontWeight: 700, letterSpacing: '0.06em' }}>ADMIN</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {NAV.map(item => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, marginBottom: 2, textDecoration: 'none', fontSize: '0.83rem', fontWeight: active ? 600 : 400, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', background: active ? 'var(--bg-elevated)' : 'transparent', borderLeft: `2px solid ${active ? 'var(--accent-500)' : 'transparent'}`, transition: 'all 0.15s' }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-default)' }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--text-tertiary)', textDecoration: 'none', padding: '6px 8px', borderRadius: 8, transition: 'all 0.15s' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Volver a Daya
          </Link>
          <button onClick={() => { sessionStorage.removeItem('daya-admin-auth'); setAuthorized(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, marginTop: 2, width: '100%', textAlign: 'left' }}>
            🔐 Cerrar sesión admin
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
    </div>
  )
}
