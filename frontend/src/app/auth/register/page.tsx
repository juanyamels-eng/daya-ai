'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import type { AxiosError } from 'axios'
import { authAPI } from '../../../lib/api'
import { useAuthStore } from '../../../store'
import { LangSelector } from '../../../components/LangSelector'
import { AuthBackground, AuthStyles, Spinner, Eye, EyeOff, DayaLogo, GoogleIcon, CheckMark } from '../../../components/auth/AuthChrome'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

function getPasswordStrength(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}
// Paleta de Google en oscuro: los rojos y verdes puros de antes vibraban
// demasiado sobre el negro #131314.
const strengthColor = ['', '#f28b82', '#fcc934', '#a8c7fa', '#81c995']

// Los bullets reflejan el plan GRATIS real de backend/src/config/plans.ts
type BrandData = { titlePre: string; titleEm: string; titlePost: string; subtitle: string; bulletsTitle: string; bullets: string[] }
const BRAND: Record<string, BrandData> = {
  es: { titlePre: 'Empieza ', titleEm: 'hoy', titlePost: ', gratis.', subtitle: 'Sin tarjeta de crédito · Cancela cuando quieras', bulletsTitle: 'Gratis cada día, sin pagar nada:', bullets: ['15 mensajes al día', '10 imágenes al día', '5 búsquedas web al día', '5 diseños en Studio al día', 'Selección automática del mejor modelo', 'Exporta a PDF, Word, Excel y presentaciones'] },
  en: { titlePre: '', titleEm: 'Start today', titlePost: ', free.', subtitle: 'No credit card · Cancel anytime', bulletsTitle: 'Free every day, nothing to pay:', bullets: ['15 messages a day', '10 images a day', '5 web searches a day', '5 Studio designs a day', 'Automatic best-model selection', 'Export to PDF, Word, Excel and slides'] },
  pt: { titlePre: 'Comece ', titleEm: 'hoje', titlePost: ', grátis.', subtitle: 'Sem cartão de crédito · Cancele quando quiser', bulletsTitle: 'Grátis todos os dias, sem pagar nada:', bullets: ['15 mensagens por dia', '10 imagens por dia', '5 pesquisas web por dia', '5 designs no Studio por dia', 'Seleção automática do melhor modelo', 'Exporta para PDF, Word, Excel e apresentações'] },
  fr: { titlePre: 'Commencez ', titleEm: "aujourd'hui", titlePost: ', gratuitement.', subtitle: 'Sans carte bancaire · Annulez à tout moment', bulletsTitle: 'Gratuit chaque jour, sans rien payer :', bullets: ['15 messages par jour', '10 images par jour', '5 recherches web par jour', '5 designs Studio par jour', 'Sélection automatique du meilleur modèle', 'Export en PDF, Word, Excel et présentations'] },
  de: { titlePre: 'Starten Sie ', titleEm: 'heute', titlePost: ', kostenlos.', subtitle: 'Keine Kreditkarte · Jederzeit kündbar', bulletsTitle: 'Täglich kostenlos, ohne zu zahlen:', bullets: ['15 Nachrichten pro Tag', '10 Bilder pro Tag', '5 Websuchen pro Tag', '5 Studio-Designs pro Tag', 'Automatische Auswahl des besten Modells', 'Export als PDF, Word, Excel und Präsentationen'] },
  it: { titlePre: 'Inizia ', titleEm: 'oggi', titlePost: ', gratis.', subtitle: 'Nessuna carta di credito · Annulla quando vuoi', bulletsTitle: 'Gratis ogni giorno, senza pagare nulla:', bullets: ['15 messaggi al giorno', '10 immagini al giorno', '5 ricerche web al giorno', '5 progetti in Studio al giorno', 'Selezione automatica del modello migliore', 'Esporta in PDF, Word, Excel e presentazioni'] },
}

export default function RegisterPage() {
  const t = useTranslations('auth')
  const locale = useLocale()
  const router = useRouter()
  const { setUser, setToken, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [])

  const strengthLabel = ['', t('strengthWeak'), t('strengthFair'), t('strengthGood'), t('strengthStrong')]

  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)

  const emailError = emailTouched && form.email.length > 0 && !isValidEmail(form.email)
  const pwStrength = getPasswordStrength(form.password)
  // Boolean() y no la cadena tal cual: canSubmit también decide si se pinta el
  // aviso legal, y un `'' && ...` mete un nodo de texto vacío en el árbol.
  const canSubmit = Boolean(form.name.trim() && form.email.trim() && form.password.length >= 8 && !emailError)

  const handleSubmit = async () => {
    setError('')
    if (!isValidEmail(form.email)) { setError(t('invalidEmail')); return }
    if (form.password.length < 8) { setError(t('min8')); return }
    setLoading(true)
    try {
      const res = await authAPI.register({ name: form.name, email: form.email.toLowerCase().trim(), password: form.password })
      setToken(res.data.token)
      setUser(res.data.user)
      router.push('/dashboard')
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      setError(err.response?.data?.error || t('networkError'))
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
      // redirectTo = mismo origin de esta página (donde se guarda el code_verifier
      // de PKCE). Vercel sirve www como primario, así que window.location.origin=www
      // y el callback vuelve al mismo origin. Forzar apex mete un rebote apex→www que
      // rompe PKCE ("code verifier not found in storage").
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
    } catch {
      setError(t('googleError'))
      setGoogleLoading(false)
    }
  }

  const brand = BRAND[locale] ?? BRAND.es

  return (
    <div className="lxa">
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
            <Link href="/auth/login" className="lxa-btn lxa-btn-sm">{t('signIn')}</Link>
          </div>
        </div>

        <div className="lxa-card">
          <h1 className="lxa-h1">{t('createAccount')}</h1>
          <p className="lxa-lead">{brand.subtitle}</p>

          {/* Google */}
          <button onClick={handleGoogle} disabled={googleLoading} aria-label={t('continueGoogle')}
            className="lxa-btn-ghost lxa-google">
            {googleLoading ? <Spinner color="var(--lxa-text-2)" /> : <GoogleIcon />}
            {googleLoading ? t('connecting') : t('continueGoogle')}
          </button>

          <div className="lxa-divider"><span>{t('orWithEmail')}</span></div>

          <div className="lxa-fields">
            {/* Nombre */}
            <div>
              <label htmlFor="reg-name" className="lxa-label">{t('fullName')}</label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                placeholder={t('namePh')}
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="lxa-input"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="lxa-label">{t('email')}</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                placeholder={t('emailPh')}
                value={form.email}
                onChange={e => { setForm(p => ({ ...p, email: e.target.value })); if (emailError) setEmailTouched(true) }}
                onBlur={() => setEmailTouched(true)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className={`lxa-input${emailError ? ' is-bad' : ''}`}
                aria-invalid={emailError ? 'true' : 'false'}
                aria-describedby={emailError ? 'reg-email-error' : undefined}
              />
              {emailError && <p id="reg-email-error" className="lxa-fielderr">{t('invalidEmail')}</p>}
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="reg-password" className="lxa-label">{t('password')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={t('min8')}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
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

              {/* Medidor de fuerza */}
              {form.password.length > 0 && (
                <div className="lxa-meter">
                  <div className="lxa-meter-bars">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="lxa-meter-seg"
                        style={i <= pwStrength ? { background: strengthColor[pwStrength] } : undefined} />
                    ))}
                  </div>
                  <p className="lxa-meter-txt" style={{ color: strengthColor[pwStrength] }}>
                    {strengthLabel[pwStrength]}
                  </p>
                </div>
              )}
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
              {loading ? t('creating') : t('createMyAccount')}
            </button>

            {/* Aviso legal: la aceptación es el propio acto de crear la cuenta.
                Antes había dos casillas que bloqueaban el botón hasta marcarlas;
                para el visitante era un peaje antes de haber decidido nada.
                Aparece cuando el formulario ya está completo —justo cuando la
                cuenta se va a crear de verdad— y no antes de escribir nada. */}
            {canSubmit && (
            <p className="lxa-legal">
              {t.rich('legalNotice', {
                terms: (c) => <Link href="/terms" target="_blank">{c}</Link>,
                privacy: (c) => <Link href="/privacy" target="_blank">{c}</Link>,
              })}
            </p>
            )}
          </div>

          <div className="lxa-foot">
            <p>
              {t('alreadyAccount')}{' '}
              <Link href="/auth/login" className="lxa-foot-strong">{t('signIn')}</Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── Columna lateral: qué te llevas gratis ──────── */}
      <div className="lxa-brand lxa-brand--pitch">
        <div className="lxa-pitch">
          <h2 className="lxa-pitch-h2">
            {brand.titlePre}<em>{brand.titleEm}</em>{brand.titlePost}
          </h2>
          <p className="lxa-pitch-tag">{brand.bulletsTitle}</p>
          <ul className="lxa-pitch-list">
            {brand.bullets.map(txt => (
              <li key={txt}><CheckMark />{txt}</li>
            ))}
          </ul>
        </div>
      </div>

      <AuthStyles />
    </div>
  )
}
