import Link from 'next/link'

// Página 404 — reemplaza la de Next.js (que sale en inglés y sin estilo).
export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: 'var(--bg-base)', padding: 24, textAlign: 'center',
    }}>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: '4.5rem', lineHeight: 1, color: 'var(--text-primary)' }}>404</p>
      <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        Esta página no existe
      </h1>
      <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', maxWidth: 380 }}>
        Puede que el enlace esté mal escrito o que la página se haya movido.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 10, padding: '11px 24px', borderRadius: 999,
          background: 'var(--text-primary)', color: 'var(--bg-base)',
          fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
        }}
      >
        Volver al inicio
      </Link>
    </div>
  )
}
