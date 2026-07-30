'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { authAPI } from '../../../lib/api'
import { useAuthStore } from '../../../store'
import PageTitle from '../../../components/PageTitle'
import { LangSelector } from '../../../components/LangSelector'
import dynamic from 'next/dynamic'
import { AuthBackground, AuthStyles, Spinner, Eye, EyeOff, DayaLogo, GoogleIcon } from '../../../components/auth/AuthChrome'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

// El arcade son 125 KB de fuente que no tienen por qué retrasar el formulario,
// que es a lo que viene la gente: se carga aparte, después de pintar la
// pantalla. ssr:false porque es puro canvas — en el servidor no hay nada que
// dibujar. Mientras llega, el panel se queda en su color de fondo.
const LoginArcade = dynamic(() => import('../../../components/games/LoginArcade'), {
  ssr: false,
  loading: () => <div className="lxa-arena" />,
})

export default function LoginPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const { setUser, setToken, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)

  const emailError = emailTouched && email.length > 0 && !isValidEmail(email)
  const canSubmit = email.trim() && password && !emailError

  const handleSubmit = async () => {
    setError('')
    if (!isValidEmail(email)) { setError(t('invalidEmail')); return }
    setLoading(true)
    try {
      const res = await authAPI.login({ email: email.toLowerCase().trim(), password })
      setToken(res.data.token)
      setUser(res.data.user)
      router.push('/dashboard')
    } catch (e: any) {
      setError(e.response?.data?.error || t('networkError'))
    } finally { setLoading(false) }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storage: typeof window !== 'undefined' ? window.localStorage : undefined } }
      )
      // redirectTo DEBE ser el mismo origin donde corre esta página (aquí se guarda
      // el code_verifier de PKCE). Vercel sirve www como primario (apex hace 308→www),
      // así que window.location.origin = www para el usuario y el callback vuelve al
      // MISMO www, donde está el verifier. No forzar un origin distinto (apex): el
      // rebote apex→www descoloca PKCE ("code verifier not found in storage").
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` }
      })
    } catch {
      setError(t('googleError'))
      setGoogleLoading(false)
    }
  }

  return (
    <div className="lxa">
      <PageTitle title={t('signIn')} />

      {/* Mismo fondo vivo que la landing: estrellas en paralaje + aurora violeta */}
      <AuthBackground />

      {/* ── Columna formulario ─────────────────────────── */}
      <div className="lxa-form">
        <div className="lxa-topbar">
          <Link href="/" className="lxa-logo">
            <DayaLogo size={26} />
            <span>Daya</span>
          </Link>
          <div className="lxa-topright">
            <span className="lxa-lang"><LangSelector /></span>
            <Link href="/" className="lxa-navlink">{t('homeLink')}</Link>
            <Link href="/auth/register" className="lxa-btn lxa-btn-sm">{t('signUpFree')}</Link>
          </div>
        </div>

        <div className="lxa-card">
          <h1 className="lxa-h1">{t('welcomeBack')}</h1>
          <p className="lxa-lead">{t('signInToContinue')}</p>

          {/* Google */}
          <button onClick={handleGoogle} disabled={googleLoading} aria-label={t('continueGoogle')}
            className="lxa-btn-ghost lxa-google">
            {googleLoading ? <Spinner color="var(--lxa-text-2)" /> : <GoogleIcon />}
            {googleLoading ? t('connecting') : t('continueGoogle')}
          </button>

          {/* Divisor */}
          <div className="lxa-divider">
            <span>{t('orWithEmail')}</span>
          </div>

          {/* Campos */}
          <div className="lxa-fields">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="lxa-label">{t('email')}</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder={t('emailPh')}
                value={email}
                onChange={e => { setEmail(e.target.value); if (emailError) setEmailTouched(true) }}
                onBlur={() => setEmailTouched(true)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className={`lxa-input${emailError ? ' is-bad' : ''}`}
                aria-invalid={emailError ? 'true' : 'false'}
                aria-describedby={emailError ? 'email-error' : undefined}
              />
              {emailError && <p id="email-error" className="lxa-fielderr">{t('invalidEmail')}</p>}
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="login-password" className="lxa-label">{t('password')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('passwordPh')}
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

            {/* Error banner */}
            {error && (
              <div role="alert" className="lxa-alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
              className="lxa-btn lxa-btn-lg lxa-submit"
              aria-busy={loading}
            >
              {loading && <Spinner color="rgba(19,19,20,0.55)" />}
              {loading ? t('signingIn') : t('signIn')}
            </button>
          </div>

          {/* Links secundarios */}
          <div className="lxa-foot">
            <Link href="/auth/forgot">{t('forgotAccess')}</Link>
            <p>
              {t('noAccount')}{' '}
              <Link href="/auth/register" className="lxa-foot-strong">{t('signUpFree')}</Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── Columna lateral: el juego a pantalla completa ──
          Antes era una cajita 16:10 rodeada de logo, título y chips. Ahora el
          juego jugable es el protagonista y llena toda su mitad. */}
      <div className="lxa-brand">
        <LoginArcade />
      </div>

      <AuthStyles />
    </div>
  )
}

