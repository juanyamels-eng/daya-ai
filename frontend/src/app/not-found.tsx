import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 0,
      background: 'var(--bg-base)', padding: 24, textAlign: 'center',
    }}>
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true" style={{ marginBottom: 8 }}>
        <rect x="30" y="20" width="60" height="50" rx="8" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.15" />
        <rect x="36" y="26" width="48" height="12" rx="3" fill="currentColor" opacity="0.08" />
        <circle cx="48" cy="50" r="3" fill="currentColor" opacity="0.12" />
        <circle cx="60" cy="50" r="3" fill="currentColor" opacity="0.12" />
        <circle cx="72" cy="50" r="3" fill="currentColor" opacity="0.12" />
        <path d="M42 70l4 6 8-10M78 70l-4-6-8 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.15" />
        <circle cx="60" cy="80" r="20" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.1" />
        <path d="M52 88l16-16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.1" />
      </svg>
      <p style={{
        fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '4rem', lineHeight: 1,
        color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '-0.06em', margin: '8px 0 4px',
      }}>404</p>
      <h1 style={{
        fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)',
        margin: '0 0 6px',
      }}>
        Página no encontrada
      </h1>
      <p style={{
        fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: 360,
        lineHeight: 1.7, margin: '0 0 24px',
      }}>
        Esta ruta no existe o fue movida. Tal vez quisiste ir a:
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Inicio', href: '/' },
          { label: 'Chat', href: '/dashboard' },
          { label: 'Notas', href: '/notes' },
          { label: 'Settings', href: '/settings' },
        ].map(link => (
          <Link key={link.href} href={link.href} style={{
            padding: '9px 18px', borderRadius: 999,
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            fontWeight: 500, fontSize: '0.85rem', textDecoration: 'none',
            border: '1px solid var(--border-default)',
            transition: 'background 0.15s, color 0.15s',
          }}>{link.label}</Link>
        ))}
      </div>
    </div>
  )
}
