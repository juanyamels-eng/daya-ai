'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { paymentsAPI } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useT } from '../../lib/i18n'

interface Plan {
  id: string; name: string; priceUSD: number
  messageLimit: number; limitPeriod: string
  features: string[]; highlight: boolean
}

export default function PlanesPage() {
  const t = useT()
  const router = useRouter()
  const { user, setUser, isAuthenticated } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([])
  const [paypalEnabled, setPaypalEnabled] = useState(false)
  const [payoneerLink, setPayoneerLink] = useState('')
  const [processing, setProcessing] = useState<string | null>(null) // planId en proceso
  const [message, setMessage] = useState('')

  useEffect(() => {
    setMounted(true)
    if (!isAuthenticated()) { router.replace('/auth/login'); return }

    paymentsAPI.getPlans().then(r => setPlans(r.data.plans)).catch(() => {})
    paymentsAPI.getConfig().then(r => {
      setPaypalEnabled(r.data.paypalEnabled)
      setPayoneerLink(r.data.payoneerLink || '')
    }).catch(() => {})

    // ¿Volvemos de PayPal tras aprobar el pago? -> capturar y activar el plan.
    const params = new URLSearchParams(window.location.search)
    if (params.get('paypal') === 'return') {
      const orderId = params.get('token') || ''   // PayPal devuelve la orden como ?token=
      const planId = params.get('planId') || ''
      if (orderId && planId) capturePayPal(orderId, planId)
    } else if (params.get('paypal') === 'cancel') {
      setMessage('Pago cancelado.')
      window.history.replaceState({}, '', '/planes')
    }
  }, [])

  const capturePayPal = async (orderId: string, planId: string) => {
    setProcessing(planId)
    setMessage('')
    try {
      const res = await paymentsAPI.capturePayPal(orderId, planId)
      if (res.data.success) {
        setUser(res.data.user)
        setMessage(t('paymentSuccess'))
        setTimeout(() => router.push('/dashboard'), 1800)
      }
    } catch (e: any) {
      setMessage(e.response?.data?.error || t('paymentFailed'))
    } finally {
      setProcessing(null)
      window.history.replaceState({}, '', '/planes')
    }
  }

  // Inicia el pago con PayPal: crea la orden y redirige al checkout de PayPal.
  const payWithPayPal = async (plan: Plan) => {
    if (plan.priceUSD === 0) return
    if (!paypalEnabled) { setMessage('Los pagos aún no están activados. Falta configurar PayPal.'); return }
    setProcessing(plan.id)
    setMessage('')
    try {
      const res = await paymentsAPI.createPayPalOrder(plan.id)
      if (res.data.approveUrl) {
        window.location.href = res.data.approveUrl  // → checkout de PayPal
      } else {
        setMessage('No se pudo iniciar el pago. Intenta de nuevo.')
        setProcessing(null)
      }
    } catch (e: any) {
      setMessage(e.response?.data?.error || t('paymentFailed'))
      setProcessing(null)
    }
  }

  if (!mounted) return null

  const isSuccess = message === t('paymentSuccess')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'var(--font-body)' }}>
      <nav style={{ padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo.png" alt="Daya" style={{ width: 30, height: 30, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Daya AI</span>
        </Link>
        <Link href="/dashboard" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>← Volver</Link>
      </nav>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.4rem, 4vw, 3.2rem)', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 12 }}>{t('choosePlan')}</h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-tertiary)' }}>Mejora Daya con más mensajes y respuestas de mayor calidad</p>
        </div>

        {message && (
          <div style={{ maxWidth: 500, margin: '0 auto 32px', padding: '14px 20px', borderRadius: 12, background: isSuccess ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)', border: `1px solid ${isSuccess ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.2)'}`, color: isSuccess ? 'var(--green)' : 'var(--red)', fontSize: '0.92rem', textAlign: 'center', fontWeight: 500 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {plans.map(plan => {
            const isCurrent = user?.plan === plan.id
            const busy = processing === plan.id
            return (
              <div key={plan.id} className="daya-lift"
                style={{ background: plan.highlight ? 'linear-gradient(180deg, var(--accent-glow), var(--bg-surface))' : 'var(--bg-surface)', border: `1px solid ${plan.highlight ? 'color-mix(in srgb, var(--accent-500) 55%, transparent)' : 'var(--border-default)'}`, borderRadius: 18, padding: 32, position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: plan.highlight ? '0 0 0 1px var(--accent-glow), 0 20px 54px -14px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.03)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = plan.highlight ? '0 0 0 1px var(--accent-glow), 0 28px 64px -14px rgba(0,0,0,0.5)' : '0 10px 28px rgba(0,0,0,0.07)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = plan.highlight ? '0 0 0 1px var(--accent-glow), 0 20px 54px -14px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.03)' }}>
                {plan.highlight && (
                  <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.7rem', fontWeight: 700, padding: '4px 14px', borderRadius: 999, letterSpacing: '0.05em', boxShadow: 'none', whiteSpace: 'nowrap' }}>⭐ RECOMENDADO</div>
                )}
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20 }}>
                  <span style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>${plan.priceUSD}</span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>{plan.priceUSD === 0 ? '' : '/mes'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 28, flex: 1 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12"/></svg>
                      {f}
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <div style={{ padding: '12px', borderRadius: 11, background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', textAlign: 'center', fontSize: '0.92rem', fontWeight: 600 }}>Plan actual</div>
                ) : plan.priceUSD === 0 ? (
                  <div style={{ padding: '12px', borderRadius: 11, border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', textAlign: 'center', fontSize: '0.92rem' }}>{t('freeForever')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {payoneerLink && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textAlign: 'center', letterSpacing: '0.04em', marginBottom: 2 }}>
                        {t('choosePayment')}
                      </div>
                    )}
                    {/* PayPal */}
                    <button onClick={() => payWithPayPal(plan)} disabled={busy}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 11, background: '#0070ba', color: 'white', border: 'none', fontSize: '0.92rem', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'var(--font-body)', transition: 'filter 0.15s' }}
                      onMouseEnter={e => { if (!busy) e.currentTarget.style.filter = 'brightness(1.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
                      {busy ? t('processing') : (<><PaypalMark />{t('payWithPaypal')}</>)}
                    </button>
                    {/* Payoneer — método co-igual, con su color de marca */}
                    {payoneerLink && (
                      <a href={payoneerLink} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 11, background: '#ff4800', color: 'white', border: 'none', fontSize: '0.92rem', fontWeight: 700, textDecoration: 'none', fontFamily: 'var(--font-body)', transition: 'filter 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
                        <PayoneerMark />{t('payWithPayoneer')}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', marginTop: 32, fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
          {t('cardsWorldwide')}
        </p>
      </div>
    </div>
  )
}

// Íconos de los métodos de pago (blancos, para verse limpios sobre el color de
// cada botón). Son decorativos: el texto del botón ya dice el método.
function PaypalMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
    </svg>
  )
}

function PayoneerMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
    </svg>
  )
}
