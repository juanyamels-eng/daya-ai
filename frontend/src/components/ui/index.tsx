'use client'
// ============================================
// Daya IA — Kit de componentes base
// --------------------------------------------------------------------------
// Filosofía shadcn ("open code": el código es tuyo, edítalo libremente) pero
// SIN sus dependencias (Radix, class-variance-authority). Construido con TUS
// tokens de diseño (--text-primary, --bg-surface, --border-default…), así que
// hereda tu tema automáticamente.
//
// Reemplaza los <button>/<input>/tarjetas sueltas repetidas por el frontend con
// piezas consistentes y accesibles. Inspiración: shadcn/ui (MIT); código propio.
//
// Incluye: Button, IconButton, Card (+Header/Title/Content/Footer), Input,
// Textarea, Badge, Spinner, Separator, Kbd.
// ============================================
import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

// ── Estilos compartidos (inyectados una vez) ─────────────────────────────────
// Usamos clases propias con prefijo daya- mapeadas a tus tokens CSS. Esto evita
// depender de utilidades Tailwind concretas y mantiene todo re-tematizable.

const KIT_STYLES = `
.daya-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px;
  font-family:var(--font-body); font-weight:600; border-radius:10px; cursor:pointer;
  border:1px solid transparent; transition:all .15s ease; white-space:nowrap;
  user-select:none; outline:none; }
.daya-btn:focus-visible { box-shadow:0 0 0 4px var(--accent-glow); }
.daya-btn:disabled { opacity:.5; cursor:not-allowed; }
/* tamaños */
.daya-btn--sm { font-size:13px; padding:6px 12px; }
.daya-btn--md { font-size:14px; padding:9px 16px; }
.daya-btn--lg { font-size:15px; padding:11px 20px; }
.daya-btn--icon { padding:8px; border-radius:9px; }
/* variantes */
.daya-btn--primary { background:var(--text-primary); color:var(--bg-base); }
.daya-btn--primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:var(--shadow-md); }
.daya-btn--secondary { background:var(--bg-base); color:var(--text-primary); border-color:var(--border-default); }
.daya-btn--secondary:hover:not(:disabled) { border-color:var(--border-strong); }
.daya-btn--ghost { background:transparent; color:var(--text-secondary); }
.daya-btn--ghost:hover:not(:disabled) { background:var(--bg-elevated); color:var(--text-primary); }
.daya-btn--danger { background:var(--bg-base); color:var(--red); border-color:var(--border-default); }
.daya-btn--danger:hover:not(:disabled) { background:#fef2f2; border-color:#fecaca; }

.daya-card { background:var(--bg-surface); border:1px solid var(--border-default);
  border-radius:16px; box-shadow:var(--shadow-sm); }
.daya-card__header { padding:18px 20px 0; }
.daya-card__title { font-family:var(--font-display); font-size:20px; color:var(--text-primary); line-height:1.2; }
.daya-card__desc { font-size:13.5px; color:var(--text-tertiary); margin-top:4px; }
.daya-card__content { padding:18px 20px; }
.daya-card__footer { padding:0 20px 18px; display:flex; gap:10px; align-items:center; }

.daya-input, .daya-textarea { width:100%; font-family:var(--font-body); font-size:14px;
  color:var(--text-primary); background:var(--bg-base); border:1px solid var(--border-default);
  border-radius:10px; padding:9px 12px; transition:border-color .15s, box-shadow .15s; outline:none; }
.daya-input::placeholder, .daya-textarea::placeholder { color:var(--text-tertiary); }
.daya-input:focus, .daya-textarea:focus { border-color:var(--border-strong); box-shadow:0 0 0 4px var(--accent-glow); }
.daya-textarea { resize:vertical; min-height:88px; line-height:1.6; }

.daya-badge { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600;
  border-radius:20px; padding:2px 9px; line-height:1.6; }
.daya-badge--neutral { background:var(--bg-elevated); color:var(--text-secondary); }
.daya-badge--primary { background:var(--text-primary); color:var(--bg-base); }
.daya-badge--success { background:#dcfce7; color:#15803d; }
.daya-badge--danger  { background:#fef2f2; color:#b91c1c; }
.daya-badge--outline { background:transparent; color:var(--text-secondary); border:1px solid var(--border-default); }

.daya-separator { height:1px; background:var(--border-default); border:0; margin:0; }
.daya-spin { animation:spin 1s linear infinite; }
.daya-kbd { font-family:var(--font-body); font-size:11px; background:var(--bg-elevated);
  border:1px solid var(--border-default); border-radius:5px; padding:1px 6px; color:var(--text-secondary); }
`

let stylesInjected = false
function useKitStyles() {
  React.useEffect(() => {
    if (stylesInjected || typeof document === 'undefined') return
    const el = document.createElement('style')
    el.setAttribute('data-daya-ui', 'true')
    el.textContent = KIT_STYLES
    document.head.appendChild(el)
    stylesInjected = true
  }, [])
}

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leftIcon, rightIcon, className, children, disabled, ...rest },
  ref
) {
  useKitStyles()
  return (
    <button
      ref={ref}
      className={cn('daya-btn', `daya-btn--${variant}`, `daya-btn--${size}`, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 14 : 16} className="daya-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
})

// Botón solo-ícono (cuadrado).
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  label: string // accesibilidad: aria-label obligatorio
}
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', label, className, children, ...rest }, ref
) {
  useKitStyles()
  return (
    <button ref={ref} aria-label={label} title={label}
      className={cn('daya-btn', `daya-btn--${variant}`, 'daya-btn--icon', className)} {...rest}>
      {children}
    </button>
  )
})

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  useKitStyles(); return <div className={cn('daya-card', className)} {...p} />
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('daya-card__header', className)} {...p} />
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('daya-card__title', className)} {...p} />
}
export function CardDescription({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('daya-card__desc', className)} {...p} />
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('daya-card__content', className)} {...p} />
}
export function CardFooter({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('daya-card__footer', className)} {...p} />
}

// ── Input / Textarea ───────────────────────────────────────────────────────────

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...p }, ref) {
    useKitStyles(); return <input ref={ref} className={cn('daya-input', className)} {...p} />
  }
)
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...p }, ref) {
    useKitStyles(); return <textarea ref={ref} className={cn('daya-textarea', className)} {...p} />
  }
)

// ── Badge ──────────────────────────────────────────────────────────────────────

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'danger' | 'outline'
export function Badge({ variant = 'neutral', className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  useKitStyles(); return <span className={cn('daya-badge', `daya-badge--${variant}`, className)} {...p} />
}

// ── Otros ──────────────────────────────────────────────────────────────────────

export function Separator({ className, ...p }: React.HTMLAttributes<HTMLHRElement>) {
  useKitStyles(); return <hr className={cn('daya-separator', className)} {...p} />
}
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  useKitStyles(); return <Loader2 size={size} className={cn('daya-spin', className)} />
}
export function Kbd({ className, ...p }: React.HTMLAttributes<HTMLElement>) {
  useKitStyles(); return <kbd className={cn('daya-kbd', className)} {...p} />
}
