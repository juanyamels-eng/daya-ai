import Link from 'next/link'

export default function CommunityPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ borderBottom: '1px solid var(--border-default)', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <img src="/logo.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Daya</span>
        </Link>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/auth/login" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Iniciar sesión</Link>
          <Link href="/auth/register" style={{ fontSize: '0.82rem', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, background: 'var(--accent-500)', padding: '8px 16px', borderRadius: 999 }}>Empezar</Link>
        </div>
      </nav>
      <main style={{ flex: 1, maxWidth: 800, margin: '0 auto', padding: '96px 24px', width: '100%' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 12 }}>
          Crea herramientas para Daya
        </h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.95rem', marginBottom: 48, maxWidth: '55ch', lineHeight: 1.7 }}>
          Daya es inteligencia abierta. Construye extensiones, conecta tus APIs, automatiza flujos de trabajo y haz que Daya haga lo que tú necesitas.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-500)' }}>Extiende Daya</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '8px 0 12px', letterSpacing: '-0.01em' }}>Tools API</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
              Daya tiene 10 herramientas integradas. Puedes añadir las tuyas propias conectándote a la Tools API.
              Crea una función, descríbesela a Daya con un schema OpenAPI, y ella la usará cuando el usuario la necesite — como si fuera una herramienta nativa.
            </p>
          </section>

          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-500)' }}>Automatiza</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '8px 0 12px', letterSpacing: '-0.01em' }}>Daya Code SDK</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
              El agente de programación en tu terminal. Daya Code planifica, escribe, prueba y documenta código.
              Está disponible como CLI (npm install -g daya-code) y como librería. Puedes extenderlo con prompts personalizados, plantillas y herramientas propias.
            </p>
          </section>

          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-500)' }}>Conecta</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '8px 0 12px', letterSpacing: '-0.01em' }}>Webhooks y APIs</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
              Daya expone una API compatible con OpenAI. Puedes conectarla a tus propios sistemas, enviar webhooks cuando se complete una tarea, o integrarla con Zapier / n8n / Make para automatizar flujos completos.
            </p>
          </section>

          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28, background: 'var(--bg-surface)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-500)' }}>Open-source</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '8px 0 12px', letterSpacing: '-0.01em' }}>Contribuye al código</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: '0 0 16px' }}>
              Todo Daya es MIT. El repositorio incluye frontend (Next.js), backend (Node + Express + Prisma), el CLI y los juegos. Las issues y PRs son bienvenidas.
            </p>
            <a href="https://github.com/daya-ai/daya-ia" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 999, background: 'var(--accent-500)', color: '#fff', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub
            </a>
          </section>
        </div>

        <div style={{ marginTop: 64, padding: '32px 0', borderTop: '1px solid var(--border-default)', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>Muchas herramientas, una sola IA</h2>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', maxWidth: '50ch', margin: '0 auto 24px', lineHeight: 1.6 }}>
            Daya no es solo un chat. Es un ecosistema: imágenes, documentos, código, web, calendario, notas, tareas, juegos, diseño visual y voz — todo en un solo lugar.
            Construye la pieza que falta.
          </p>
          <a href="https://github.com/daya-ai/daya-ia/issues" target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 999, border: '1px solid var(--border-strong)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
            Abre una issue →
          </a>
        </div>
      </main>
    </div>
  )
}
