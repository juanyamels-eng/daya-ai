'use client'
import * as React from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: string; kind: ToastKind; message: string; exiting?: boolean }

const TOAST_STYLES = `
.daya-toasts { position:fixed; bottom:20px; right:20px; z-index:2000; display:flex;
  flex-direction:column; gap:10px; max-width:360px; }
.daya-toast { display:flex; align-items:flex-start; gap:10px; background:var(--bg-base);
  border:1px solid var(--border-default); border-radius:12px; box-shadow:var(--shadow-lg);
  padding:12px 14px; font-size:14px; color:var(--text-primary);
  animation:dayaToastIn .24s cubic-bezier(.16,1,.3,1) both; }
.daya-toast--out { animation:dayaToastOut .2s cubic-bezier(.4,0,1,1) both; }
@keyframes dayaToastIn  { from{opacity:0;transform:translateX(14px) scale(0.97)} to{opacity:1;transform:none} }
@keyframes dayaToastOut { from{opacity:1;transform:none} to{opacity:0;transform:translateX(14px) scale(0.97)} }
.daya-toast__msg { flex:1; line-height:1.45; }
.daya-toast__x { border:none; background:transparent; color:var(--text-tertiary); cursor:pointer;
  padding:2px; border-radius:5px; display:flex; align-items:center; justify-content:center;
  transition:color 0.15s, background 0.15s; }
.daya-toast__x:hover { color:var(--text-primary); background:var(--bg-elevated); }
.daya-toast--success .daya-toast__icon { color:var(--green); }
.daya-toast--error   .daya-toast__icon { color:var(--red); }
.daya-toast--info    .daya-toast__icon { color:var(--text-tertiary); }
`

interface ToastCtx {
  toast: {
    success: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
    show: (kind: ToastKind, msg: string) => void
  }
}

const Ctx = React.createContext<ToastCtx | null>(null)

const EXIT_DURATION = 210

export function ToastProvider({ children, duration = 3500 }: { children: React.ReactNode; duration?: number }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  React.useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.querySelector('[data-daya-toast]')) return
    const el = document.createElement('style'); el.setAttribute('data-daya-toast', 'true')
    el.textContent = TOAST_STYLES; document.head.appendChild(el)
  }, [])

  const remove = React.useCallback((id: string) => {
    // Marca como "saliendo" → aplica animación de salida → luego elimina del DOM
    setItems(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), EXIT_DURATION)
  }, [])

  const show = React.useCallback((kind: ToastKind, message: string) => {
    const id = Math.random().toString(36).slice(2)
    setItems(prev => [...prev, { id, kind, message }])
    setTimeout(() => remove(id), duration)
  }, [duration, remove])

  const value = React.useMemo<ToastCtx>(() => ({
    toast: {
      success: (m: string) => show('success', m),
      error: (m: string) => show('error', m),
      info: (m: string) => show('info', m),
      show,
    },
  }), [show])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="daya-toasts" aria-live="polite" aria-atomic="false">
        {items.map(t => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertCircle : Info
          return (
            <div key={t.id} className={`daya-toast daya-toast--${t.kind}${t.exiting ? ' daya-toast--out' : ''}`} role="status">
              <Icon size={18} className="daya-toast__icon" />
              <span className="daya-toast__msg">{t.message}</span>
              <button className="daya-toast__x" aria-label="Cerrar" onClick={() => remove(t.id)}><X size={15} /></button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx['toast'] {
  const ctx = React.useContext(Ctx)
  if (!ctx) {
    return {
      success: (m: string) => console.warn('[toast]', m),
      error: (m: string) => console.warn('[toast]', m),
      info: (m: string) => console.warn('[toast]', m),
      show: (_k, m) => console.warn('[toast]', m),
    }
  }
  return ctx.toast
}
