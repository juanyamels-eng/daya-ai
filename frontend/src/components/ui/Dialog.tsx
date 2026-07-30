'use client'
// ============================================
// Daya IA — Dialog (modal accesible, sin Radix)
// --------------------------------------------------------------------------
// Modal con overlay, cierre por Escape y por clic fuera, bloqueo de scroll y
// foco atrapado básico. Estética Daya. Reemplaza los modales ad-hoc del
// frontend (PlansModal, confirmaciones, etc.) por una pieza consistente.
// ============================================
import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

const DIALOG_STYLES = `
.daya-dialog__overlay { position:fixed; inset:0; z-index:1000; background:rgba(10,10,12,.4);
  backdrop-filter:blur(2px); display:grid; place-items:center; padding:20px;
  animation:dayaFade .15s ease both; }
@keyframes dayaFade { from{opacity:0} to{opacity:1} }
.daya-dialog { background:var(--bg-base); border:1px solid var(--border-default);
  border-radius:18px; box-shadow:var(--shadow-lg); width:100%; max-width:480px;
  max-height:85vh; overflow:auto; animation:dayaPop .18s cubic-bezier(.16,1,.3,1) both; }
@keyframes dayaPop { from{opacity:0; transform:translateY(8px) scale(.98)} to{opacity:1; transform:none} }
.daya-dialog__head { display:flex; align-items:flex-start; justify-content:space-between;
  gap:16px; padding:20px 20px 0; }
.daya-dialog__title { font-family:var(--font-display); font-size:21px; color:var(--text-primary); line-height:1.2; }
.daya-dialog__desc { font-size:13.5px; color:var(--text-tertiary); margin-top:4px; padding:0 20px; }
.daya-dialog__body { padding:16px 20px; }
.daya-dialog__footer { padding:0 20px 20px; display:flex; gap:10px; justify-content:flex-end; }
.daya-dialog__x { border:none; background:transparent; color:var(--text-tertiary); cursor:pointer;
  padding:6px; border-radius:8px; flex-shrink:0; }
.daya-dialog__x:hover { background:var(--bg-elevated); color:var(--text-primary); }
`

let injected = false
function useStyles() {
  React.useEffect(() => {
    if (injected || typeof document === 'undefined') return
    const el = document.createElement('style'); el.setAttribute('data-daya-dialog', 'true')
    el.textContent = DIALOG_STYLES; document.head.appendChild(el); injected = true
  }, [])
}

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: number
  closeOnOverlay?: boolean
}

export function Dialog({ open, onClose, title, description, children, footer, maxWidth, closeOnOverlay = true }: DialogProps) {
  useStyles()
  const ref = React.useRef<HTMLDivElement | null>(null)

  // Escape cierra; bloquea el scroll del body mientras está abierto.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Enfoca el diálogo al abrir (accesibilidad).
    setTimeout(() => ref.current?.focus(), 0)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="daya-dialog__overlay"
      onMouseDown={(e) => { if (closeOnOverlay && e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        className="daya-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {(title || true) && (
          <div className="daya-dialog__head">
            {title ? <h2 className="daya-dialog__title">{title}</h2> : <span />}
            <button className="daya-dialog__x" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
          </div>
        )}
        {description && <p className="daya-dialog__desc">{description}</p>}
        <div className="daya-dialog__body">{children}</div>
        {footer && <div className="daya-dialog__footer">{footer}</div>}
      </div>
    </div>
  )
}

// Confirmación rápida (sí/no) construida sobre Dialog.
export interface ConfirmProps {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}
export function ConfirmDialog({ open, title = 'Confirmar', message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger, onConfirm, onCancel }: ConfirmProps) {
  // Import perezoso evita ciclo si Button viviera aquí; usamos botones planos con clases del kit.
  return (
    <Dialog open={open} onClose={onCancel} title={title} maxWidth={400}
      footer={
        <>
          <button className="daya-btn daya-btn--secondary daya-btn--md" onClick={onCancel}>{cancelLabel}</button>
          <button className={cn('daya-btn daya-btn--md', danger ? 'daya-btn--danger' : 'daya-btn--primary')} onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
    </Dialog>
  )
}
