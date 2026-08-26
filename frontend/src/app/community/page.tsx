'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toolsCatalogAPI, ToolCatalogEntry } from '@/lib/toolsApi'

const REPO_URL = 'https://github.com/juanyamels-eng/daya-ai'

const AUTHOR_LABEL: Record<string, string> = {
  daya: 'Daya',
  'daya-auto': 'Auto-mejora',
  comunidad: 'Comunidad',
}

const TAG_LABEL: Record<string, string> = {
  web: 'Web',
  imagen: 'Imagen',
  documentos: 'Documentos',
  productividad: 'Productividad',
  voz: 'Voz',
  automatizacion: 'Automatización',
  utilidades: 'Utilidades',
  general: 'General',
}

export default function CommunityPage() {
  const [tools, setTools] = useState<ToolCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    toolsCatalogAPI.get()
      .then((res) => { if (alive) setTools(res.data.tools || []) })
      .catch(() => { if (alive) setError('No se pudo cargar el catálogo ahora mismo.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const byAuthor = (a: string) => tools.filter(t => t.meta.author === a)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ borderBottom: '1px solid var(--border-default)', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <img src="/logo.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Daya</span>
        </Link>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/auth/login" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Iniciar sesión</Link>
          <Link href="/auth/register" style={{ fontSize: '0.82rem', color: '#fff', textDecoration: 'none', fontWeight: 600, background: 'var(--accent-500)', padding: '8px 16px', borderRadius: 999 }}>Empezar</Link>
        </div>
      </nav>
      <main style={{ flex: 1, maxWidth: 960, margin: '0 auto', padding: '80px 24px', width: '100%' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 12 }}>
          El catálogo de herramientas de Daya
        </h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.95rem', marginBottom: 48, maxWidth: '55ch', lineHeight: 1.7 }}>
          Daya es inteligencia abierta. Estas son las herramientas que hoy puede usar — las del núcleo, las que aporta la comunidad y las que Daya se construye a sí misma. Cada nueva herramienta aparece aquí automáticamente.
        </p>

        {/* Catálogo en vivo */}
        <section style={{ marginBottom: 56 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px', letterSpacing: '-0.01em' }}>
              {loading ? 'Cargando herramientas…' : `${tools.length} herramientas en vivo`}
            </h2>
            {!loading && !error && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                Núcleo {byAuthor('daya').length} · Comunidad {byAuthor('comunidad').length} · Auto-mejora {byAuthor('daya-auto').length}
              </span>
            )}
          </div>

          {error && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error}</p>}
          {!error && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {tools.map((t) => (
                <div key={t.name} style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: '18px 20px', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{t.meta.emoji || '🧰'}</span>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{t.name}</code>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55, flex: 1 }}>{t.description}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}>
                      {TAG_LABEL[t.meta.tag || 'general'] || t.meta.tag}
                    </span>
                    {t.meta.pro && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: 'var(--accent-500)', color: '#fff' }}>Pro</span>
                    )}
                    {t.meta.author !== 'daya' && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border-strong)', color: 'var(--accent-500)' }}>
                        {AUTHOR_LABEL[t.meta.author] || t.meta.author}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Cómo aportar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 48 }}>
          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-500)' }}>Aporta</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '8px 0 12px', letterSpacing: '-0.01em' }}>Crea una herramienta para el catálogo</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
              Cada herramienta del catálogo es una función con un schema OpenAPI que Daya usa cuando la necesita. Añade la tuya con un PR al repo, la auto-mejora la revisa, y si pasa la verificación (typecheck + tests + revisor IA) aparece aquí con tu etiqueta.
            </p>
          </section>

          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28, background: 'var(--bg-surface)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-500)' }}>Open-source</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '8px 0 12px', letterSpacing: '-0.01em' }}>Contribuye al código</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: '0 0 16px' }}>
              Todo Daya es MIT. El repositorio incluye frontend (Next.js), backend (Node + Express + Prisma), el CLI y los juegos. Las issues y PRs son bienvenidas.
            </p>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 999, background: 'var(--accent-500)', color: '#fff', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub
            </a>
          </section>
        </div>
      </main>
    </div>
  )
}
