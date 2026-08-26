'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../store'
import type { AxiosError } from 'axios'
import { paymentsAPI } from '../lib/api'

const PLANS = [
  { id: 'FREE', name: 'Gratis', price: 0, features: ['15 mensajes al día', '10 imágenes al día', '5 búsquedas web al día', '5 diseños en Studio al día', 'Modelos con selección automática'] },
  { id: 'PRO', name: 'Pro', price: 13, features: ['3.000 mensajes al mes', '1.000 imágenes al mes', '400 búsquedas web al mes', '500 diseños en Studio al mes', 'Modelos top + pensamiento profundo', 'DAYA Code: agente de programación en tu terminal'], popular: true },
]

export default function PlansModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore()
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [paypalEnabled, setPaypalEnabled] = useState(false)
  const [payoneerLink, setPayoneerLink] = useState('')
  const currentPlan = user?.plan || 'FREE'

  // Carga los métodos de pago disponibles al abrir la modal
  useEffect(() => {
    paymentsAPI.getConfig()
      .then(r => { setPaypalEnabled(!!r.data.paypalEnabled); setPayoneerLink(r.data.payoneerLink || '') })
      .catch(() => {})
  }, [])

  const selectPlan = async (planId: string) => {
    if (planId === 'FREE' || planId === currentPlan) return
    setError('')

    // Si PayPal no está configurado en el servidor pero hay Payoneer, manda allí.
    if (!paypalEnabled) {
      if (payoneerLink) { window.open(payoneerLink, '_blank', 'noopener'); return }
      // Sin ningún método configurado: lleva a la página de planes (muestra el estado real)
      router.push('/planes'); onClose(); return
    }

    setBusy(planId)
    try {
      const res = await paymentsAPI.createPayPalOrder(planId)
      if (res.data.approveUrl) {
        window.location.href = res.data.approveUrl   // → checkout real de PayPal
      } else {
        setError('No se pudo iniciar el pago. Intenta de nuevo.')
        setBusy(null)
      }
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      setError(err.response?.data?.error || 'No se pudo iniciar el pago. Intenta de nuevo.')
      setBusy(null)
    }
  }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', animation: 'fadeIn 0.18s ease' }}>
      <div style={{ width: '100%', maxWidth: 880, maxHeight: '88vh', overflowY: 'auto', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 20, boxShadow: 'var(--shadow-lg)', padding: 32, animation: 'modalPop 0.22s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>Elige tu plan</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, borderRadius: 9, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', marginBottom: 28 }}>Mejora cuando quieras. Cancela cuando quieras.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {PLANS.map(plan => {
            const isCurrent = plan.id === currentPlan
            return (
              <div key={plan.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 16, border: `1.5px solid ${plan.popular ? 'var(--text-primary)' : 'var(--border-default)'}`, background: 'var(--bg-surface)' }}>
                {plan.popular && <span style={{ position: 'absolute', top: -11, left: 24, background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.65rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.05em' }}>POPULAR</span>}
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '12px 0 18px' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>${plan.price}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>/mes</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, marginBottom: 20 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M20 6L9 17l-5-5"/></svg>
                      {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => selectPlan(plan.id)} disabled={isCurrent || busy === plan.id}
                  style={{ padding: '11px', borderRadius: 10, border: 'none', cursor: isCurrent || busy === plan.id ? 'default' : 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)', background: isCurrent ? 'var(--bg-elevated)' : plan.popular ? 'var(--text-primary)' : 'transparent', color: isCurrent ? 'var(--text-tertiary)' : plan.popular ? 'var(--bg-base)' : 'var(--text-primary)', borderWidth: plan.popular || isCurrent ? 0 : 1.5, borderStyle: 'solid', borderColor: 'var(--border-default)', opacity: busy === plan.id ? 0.6 : 1 }}>
                  {busy === plan.id ? 'Procesando…' : isCurrent ? 'Plan actual' : plan.price === 0 ? 'Gratis' : 'Elegir ' + plan.name}
                </button>
              </div>
            )
          })}
        </div>

        {error && <p style={{ marginTop: 20, textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '12px', background: 'var(--bg-elevated)', borderRadius: 10 }}>{error}</p>}
      </div>
      <style>{`@keyframes modalPop{from{opacity:0;transform:scale(0.97) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  )
}
