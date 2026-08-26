'use client'
// ============================================
// Daya IA — Banner de consentimiento de cookies (GDPR)
// Consentimiento granular: el usuario acepta o rechaza analíticas.
// La elección se guarda y no se vuelve a preguntar.
// ============================================
import { useState, useEffect } from 'react'
import Link from 'next/link'

const CONSENT_KEY = 'daya-cookie-consent'

export interface CookieConsent {
  necessary: boolean   // siempre true (imprescindibles)
  analytics: boolean   // opcional
  decidedAt: string
}

// Helper para que otras partes del código consulten el consentimiento
export function getConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null') } catch { return null }
}

export default function CookieConsent() {
  const [show, setShow] = useState(false)
  const [details, setDetails] = useState(false)
  const [analytics, setAnalytics] = useState(true)

  useEffect(() => {
    // Mostrar solo si aún no decidió
    if (!getConsent()) setShow(true)
  }, [])

  const save = (consent: CookieConsent) => {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(consent)) } catch {}
    setShow(false)
    // Notifica al resto de la app (p.ej. para activar/desactivar analíticas)
    window.dispatchEvent(new CustomEvent('daya-consent', { detail: consent }))
  }

  const acceptAll = () => save({ necessary: true, analytics: true, decidedAt: new Date().toISOString() })
  const rejectAll = () => save({ necessary: true, analytics: false, decidedAt: new Date().toISOString() })
  const saveChoice = () => save({ necessary: true, analytics, decidedAt: new Date().toISOString() })

  if (!show) return null

  const txt = {
    title: { es: 'Tu privacidad', en: 'Your privacy' },
    body: {
      es: 'Usamos cookies necesarias para que la plataforma funcione y, con tu permiso, cookies de analítica para mejorar el servicio. Puedes aceptarlas, rechazarlas o personalizar tu elección.',
      en: 'We use necessary cookies for the platform to work and, with your permission, analytics cookies to improve the service. You can accept, reject or customize your choice.',
    },
    acceptAll: { es: 'Aceptar todas', en: 'Accept all' },
    rejectAll: { es: 'Rechazar', en: 'Reject' },
    customize: { es: 'Personalizar', en: 'Customize' },
    savePref: { es: 'Guardar preferencias', en: 'Save preferences' },
    necessary: { es: 'Necesarias (siempre activas)', en: 'Necessary (always on)' },
    analytics: { es: 'Analíticas (opcional)', en: 'Analytics (optional)' },
    privacy: { es: 'Política de privacidad', en: 'Privacy policy' },
  }
  const lang = (typeof navigator !== 'undefined' && navigator.language?.startsWith('es')) ? 'es' : 'en'
  const L = (o: { es: string; en: string }) => o[lang as 'es' | 'en']

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999, display: 'flex', justifyContent: 'center', padding: 16, animation: 'slideDown 0.3s ease both' }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#1e1e1f', border: '1px solid #444746', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', padding: 22 }}>
        <div style={{ fontSize: '1.02rem', fontWeight: 700, color: '#f4f2fe', marginBottom: 8, letterSpacing: '-0.02em' }}>{L(txt.title)}</div>
        <p style={{ fontSize: '0.86rem', color: '#b6b0c8', lineHeight: 1.6, margin: '0 0 14px' }}>
          {L(txt.body)}{' '}
          <Link href="/privacy" style={{ color: '#e3e3e3', fontWeight: 600, textDecoration: 'underline' }}>{L(txt.privacy)}</Link>
        </p>

        {details && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: 11 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.83rem', color: '#b6b0c8' }}>
              <span>{L(txt.necessary)}</span>
              <input type="checkbox" checked disabled />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.83rem', color: '#f4f2fe', cursor: 'pointer' }}>
              <span>{L(txt.analytics)}</span>
              <input type="checkbox" checked={analytics} onChange={e => setAnalytics(e.target.checked)} />
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={acceptAll} style={btnPrimary}>{L(txt.acceptAll)}</button>
          <button onClick={rejectAll} style={btnGhost}>{L(txt.rejectAll)}</button>
          {details
            ? <button onClick={saveChoice} style={btnGhost}>{L(txt.savePref)}</button>
            : <button onClick={() => setDetails(true)} style={btnGhost}>{L(txt.customize)}</button>}
        </div>
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  flex: 1, minWidth: 120, padding: '11px 16px', borderRadius: 999, background: '#f1f3f4',
  color: '#131314', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)',
}
const btnGhost: React.CSSProperties = {
  padding: '11px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#cdc7de',
  border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)',
}
