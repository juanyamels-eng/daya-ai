'use client'
import { useState } from 'react'
import Link from 'next/link'
import { authAPI } from '../../../lib/api'
import { AuthBackground, AuthStyles, Spinner, DayaLogo } from '../../../components/auth/AuthChrome'

export default function ForgotPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    if (!email.trim()) { setError('Ingresa tu email'); return }
    setLoading(true)
    try {
      await authAPI.forgot(email.toLowerCase().trim())
      setSent(true)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally { setLoading(false) }
  }

  return (
    <div className="lxa">
      <AuthBackground />

      <div className="lxa-solo">
        <div className="lxa-topbar">
          <Link href="/" className="lxa-logo">
            <DayaLogo size={26} />
            <span>Daya</span>
          </Link>
          <Link href="/auth/login" className="lxa-navlink">Iniciar sesión</Link>
        </div>

        <div className="lxa-card lxa-card--narrow">
          {!sent ? (
            <>
              <h1 className="lxa-h1 lxa-h1--sm">Recupera tu acceso</h1>
              <p className="lxa-lead">
                Escribe tu email y te enviamos un enlace para volver a entrar en tu cuenta.
              </p>

              <div className="lxa-fields">
                <div>
                  <label htmlFor="forgot-email" className="lxa-label">Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    placeholder="tu@email.com"
                    autoFocus
                    className="lxa-input"
                  />
                </div>

                {error && (
                  <div role="alert" className="lxa-alert">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {error}
                  </div>
                )}

                <button onClick={handleSubmit} disabled={loading || !email.trim()}
                  className="lxa-btn lxa-btn-lg lxa-submit" aria-busy={loading}>
                  {loading && <Spinner color="rgba(19,19,20,0.55)" />}
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div className="lxa-badge">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <h1 className="lxa-h1 lxa-h1--sm">Revisa tu correo</h1>
              <p className="lxa-lead" style={{ marginBottom: 0 }}>
                Si <strong style={{ color: 'var(--lxa-text)' }}>{email}</strong> tiene una cuenta, recibirás un enlace para recuperar tu acceso. Caduca en 1 hora.
              </p>
            </div>
          )}

          <div className="lxa-foot">
            <Link href="/auth/login">← Volver a iniciar sesión</Link>
          </div>
        </div>
      </div>

      <AuthStyles />
    </div>
  )
}
