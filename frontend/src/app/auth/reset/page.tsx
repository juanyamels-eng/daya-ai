'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { AxiosError } from 'axios'
import { authAPI } from '../../../lib/api'
import { useAuthStore } from '../../../store'
import { AuthBackground, AuthStyles, Spinner, Eye, EyeOff, DayaLogo } from '../../../components/auth/AuthChrome'

function ResetContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { setUser, setToken } = useAuthStore()
  const token = params.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!token) setError('Enlace inválido o incompleto. Solicita uno nuevo.')
  }, [])

  const handleSubmit = async () => {
    setError('')
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    try {
      const res = await authAPI.reset(token!, password)
      setToken(res.data.token)
      setUser(res.data.user)
      router.replace('/dashboard')
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      setError(err.response?.data?.error || 'El enlace expiró o no es válido.')
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
          <h1 className="lxa-h1 lxa-h1--sm">Crea tu nueva contraseña</h1>
          <p className="lxa-lead">Elige una contraseña segura para tu cuenta.</p>

          {!token ? (
            <>
              <div role="alert" className="lxa-alert" style={{ marginBottom: 20 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
              <Link href="/auth/forgot" className="lxa-btn lxa-btn-lg lxa-submit">
                Solicitar un enlace nuevo
              </Link>
            </>
          ) : (
            <div className="lxa-fields">
              <div>
                <label htmlFor="reset-pw" className="lxa-label">Nueva contraseña</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-pw"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    className="lxa-input lxa-input--pw"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="lxa-eye"
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reset-confirm" className="lxa-label">Confirmar contraseña</label>
                <input
                  id="reset-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repite tu contraseña"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  className="lxa-input"
                />
              </div>

              {error && (
                <div role="alert" className="lxa-alert">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {error}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading || !password || !confirm}
                className="lxa-btn lxa-btn-lg lxa-submit" aria-busy={loading}>
                {loading && <Spinner color="rgba(19,19,20,0.55)" />}
                {loading ? 'Guardando...' : 'Guardar y entrar'}
              </button>
            </div>
          )}
        </div>
      </div>

      <AuthStyles />
    </div>
  )
}

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetContent />
    </Suspense>
  )
}
