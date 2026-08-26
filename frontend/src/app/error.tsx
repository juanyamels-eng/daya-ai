'use client'

import Link from 'next/link'

// Pantalla de error global — si algo revienta en producción, el usuario ve
// esto (con botón de reintentar) en vez de una pantalla blanca.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: 'var(--bg-base)', padding: 24, textAlign: 'center',
    }}>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', lineHeight: 1, color: 'var(--text-primary)' }}>
        Algo salió mal
      </p>
      <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', maxWidth: 400 }}>
        Ocurrió un error inesperado. Puedes intentarlo de nuevo; si persiste,
        recarga la página o vuelve en unos minutos.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '11px 24px', borderRadius: 999, border: 'none',
            background: 'var(--text-primary)', color: 'var(--bg-base)',
            fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
        <Link
          href="/"
          style={{
            padding: '11px 22px', borderRadius: 10,
            border: '1px solid var(--border-strong)',
            background: 'transparent', color: 'var(--text-primary)',
            fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
          }}
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  )
}
