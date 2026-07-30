import Link from 'next/link'

export default function CodePage() {
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
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-500)' }}>CLI</span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.1, margin: '8px 0 12px' }}>
          Daya Code
        </h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.95rem', marginBottom: 48, maxWidth: '55ch', lineHeight: 1.7 }}>
          Un agente de programación en tu terminal. Daya Code lee, escribe, busca y ejecuta comandos dentro de tu proyecto.
          El cerebro vive en Daya; tú solo necesitas un token.
        </p>

        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)', marginBottom: 48, background: '#0d0d0e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#1a1a1c', borderBottom: '1px solid #26262f' }}>
            <div style={{ display: 'flex', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#fc5753', display: 'block' }} /><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#fdbc40', display: 'block' }} /><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#33c748', display: 'block' }} /></div>
            <span style={{ fontSize: '0.72rem', color: '#8b8b98', fontFamily: 'ui-monospace,monospace' }}>daya-code — terminal</span>
          </div>
          <div style={{ padding: '16px 18px', fontFamily: 'ui-monospace,SF Mono,Menlo,monospace', fontSize: '0.82rem', lineHeight: 1.8, color: '#c4c7c5' }}>
            <div><span style={{ color: '#34d399', fontWeight: 700 }}>$</span> cd mi-proyecto</div>
            <div><span style={{ color: '#34d399', fontWeight: 700 }}>$</span> daya-code &ldquo;refactoriza el login y a&ntilde;ade tests&rdquo;</div>
            <div style={{ color: '#a5b4fc' }}>▸ read_file <span style={{ color: '#f2f2f8' }}>src/auth/login.ts</span></div>
            <div style={{ color: '#a5b4fc' }}>▸ write_file <span style={{ color: '#f2f2f8' }}>src/auth/login.ts</span></div>
            <div style={{ color: '#a5b4fc' }}>▸ run_command <span style={{ color: '#f2f2f8' }}>npm test</span></div>
            <div style={{ color: '#6e6e7a' }}>{'{ "passed": 12, "failed": 0 }'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#34d399', fontWeight: 700 }}>✓ Listo. 3 archivos modificados, tests pasando.</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Instalación</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: '0 0 16px' }}>Descarga el script, hazlo ejecutable y correlo desde cualquier proyecto:</p>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '14px 16px', fontFamily: 'ui-monospace,monospace', fontSize: '0.82rem', lineHeight: 1.8, marginBottom: 12, overflowX: 'auto', whiteSpace: 'nowrap' }}>
              <div><span style={{ color: 'var(--text-tertiary)' }}># Opción 1 — Descarga directa</span></div>
              <div>curl -Lo /usr/local/bin/daya-code https://daya-ai.com/daya-code.mjs</div>
              <div>chmod +x /usr/local/bin/daya-code</div>
              <div style={{ marginTop: 8 }}><span style={{ color: 'var(--text-tertiary)' }}># Opción 2 — npm (si está publicado)</span></div>
              <div>npm install -g daya-code</div>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
              También puedes descargar el <a href="/daya-code.mjs" download style={{ color: 'var(--accent-500)' }}>script directo</a> o clonar el <a href="https://github.com/juanyamels-eng/daya-ia" target="_blank" rel="noopener" style={{ color: 'var(--accent-500)' }}>repositorio</a> y usar <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>node cli/daya-code.mjs</code>.
            </p>
          </section>

          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Primeros pasos</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-500)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Inicia sesión</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 0 32px' }}>Corre <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>daya-code login</code> una sola vez. Te pedirá tu token de Daya (lo encuentras en Ajustes → Cuenta).</p>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-500)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Abre tu código</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 0 32px' }}>
                  Ubícate en la raíz de tu proyecto y corre <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>daya-code</code> sin argumentos para el modo interactivo, o pídele algo directo:
                </p>
                <div style={{ margin: '8px 0 0 32px', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '12px 14px', fontFamily: 'ui-monospace,monospace', fontSize: '0.8rem', lineHeight: 1.8, overflowX: 'auto', whiteSpace: 'nowrap' }}>
                  <div><span style={{ color: '#34d399' }}>$</span> daya-code &ldquo;explícame este proyecto&rdquo;</div>
                  <div><span style={{ color: '#34d399' }}>$</span> daya-code &ldquo;encuentra el bug en el login&rdquo;</div>
                  <div><span style={{ color: '#34d399' }}>$</span> daya-code &ldquo;añade tests para la API de usuarios&rdquo;</div>
                  <div><span style={{ color: '#34d399' }}>$</span> daya-code &ldquo;migra esto de JavaScript a TypeScript&rdquo;</div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-500)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Reanuda sesiones</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 0 32px' }}>
                  Usa <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>daya-code --continue</code> para retomar la última sesión en esta carpeta. Daya Code recuerda el contexto anterior.
                </p>
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Cómo funciona</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: '0 0 16px' }}>
              Daya Code corre en <strong>tu máquina</strong>, dentro de <strong>tu proyecto</strong>. Lee archivos, los modifica, busca código, ejecuta comandos y crea nuevos archivos. Cada acción la confirmas tú antes de que ocurra (o usa <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>--yes</code> para saltar la confirmación).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Leer archivos', desc: 'Entiende tu código antes de tocarlo' },
                { label: 'Escribir y editar', desc: 'Modifica archivos existentes o crea nuevos' },
                { label: 'Buscar en el código', desc: 'Encuentra funciones, clases, errores' },
                { label: 'Ejecutar comandos', desc: 'Corre tests, linters, builds' },
              ].map(f => (
                <div key={f.label} style={{ padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: 4 }}>{f.label}</div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <div style={{ padding: '24px 0', textAlign: 'center', borderTop: '1px solid var(--border-default)' }}>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', margin: '0 0 16px', lineHeight: 1.6 }}>
              ¿Listo para que Daya trabaje con tu código?
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Link href="/auth/register" style={{ display: 'inline-flex', padding: '10px 22px', borderRadius: 999, background: 'var(--accent-500)', color: '#fff', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>Crear cuenta gratis</Link>
              <a href="/daya-code.mjs" download style={{ display: 'inline-flex', padding: '10px 22px', borderRadius: 999, border: '1px solid var(--border-strong)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>Descargar Daya Code</a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
