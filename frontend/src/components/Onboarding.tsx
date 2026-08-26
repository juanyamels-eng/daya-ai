'use client'
import { useState, useEffect } from 'react'

const STEPS = [
  {
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    title: 'Chatea con Daya',
    desc: 'Escribe lo que necesites. Daya entiende el contexto, busca en la web, genera imágenes y elige el mejor modelo para cada tarea.',
  },
  {
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    title: 'Sube documentos',
    desc: 'PDFs, Word, imágenes. Daya los lee al instante y responde con base en su contenido exacto — resúmenes, comparaciones, extracción de datos.',
  },
  {
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
    title: 'Explora las herramientas',
    desc: 'Studio, Notas, Calendario, Cuadernos, Agente de código y más. Todo conectado, todo en una sola cuenta.',
  },
]

export default function Onboarding() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const seen = localStorage.getItem('daya_onboarding_seen')
    if (!seen) setOpen(true)
  }, [])

  const close = () => {
    localStorage.setItem('daya_onboarding_seen', '1')
    setOpen(false)
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else close()
  }

  if (!open) return null

  const s = STEPS[step]

  return (
    <div onClick={e => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(400px, 100%)', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ padding: '32px 28px 8px', textAlign: 'center' }}>
          <div style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>{s.icon}</div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{s.title}</h2>
          <p style={{ margin: '8px 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>{s.desc}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 24px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === step ? 'var(--text-primary)' : 'var(--border-default)', transition: 'background 0.2s' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={close}
              style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Saltar
            </button>
            <button onClick={next}
              style={{ padding: '8px 20px', borderRadius: 999, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-base)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {step < STEPS.length - 1 ? 'Siguiente' : 'Empezar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
