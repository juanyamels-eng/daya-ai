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

/* Select */
.daya-select-wrap { position:relative; display:inline-flex; width:100%; }
.daya-select-trigger { display:flex; align-items:center; justify-content:space-between; gap:8px;
  width:100%; font-family:var(--font-body); font-size:14px; color:var(--text-primary);
  background:var(--bg-base); border:1px solid var(--border-default); border-radius:10px;
  padding:9px 12px; cursor:pointer; transition:border-color .15s, box-shadow .15s; outline:none; user-select:none; }
.daya-select-trigger:focus { border-color:var(--border-strong); box-shadow:0 0 0 4px var(--accent-glow); }
.daya-select-trigger[disabled] { opacity:.5; cursor:not-allowed; }
.daya-select-content { position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:50;
  background:var(--bg-surface); border:1px solid var(--border-default); border-radius:10px;
  box-shadow:var(--shadow-md); max-height:260px; overflow-y:auto; padding:4px;
  animation:dayaScaleIn .18s cubic-bezier(0.16,1,0.3,1) both; }
.daya-select-item { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px;
  font-size:13.5px; color:var(--text-primary); cursor:pointer; transition:background .12s; outline:none; }
.daya-select-item:hover, .daya-select-item[data-highlighted] { background:var(--bg-elevated); }
.daya-select-item[data-disabled] { opacity:.4; cursor:not-allowed; }
.daya-select-check { width:14px; height:14px; flex-shrink:0; }
.daya-select-sep { height:1px; background:var(--border-default); margin:4px 0; }

/* Tabs */
.daya-tabs-list { display:inline-flex; align-items:center; gap:2px; background:var(--bg-elevated);
  border-radius:10px; padding:3px; }
.daya-tabs-trigger { position:relative; font-family:var(--font-body); font-size:13.5px; font-weight:500;
  color:var(--text-secondary); background:transparent; border:none; border-radius:8px;
  padding:7px 14px; cursor:pointer; transition:color .15s, background .15s; outline:none; white-space:nowrap; }
.daya-tabs-trigger:hover { color:var(--text-primary); }
.daya-tabs-trigger[data-state="active"] { color:var(--text-primary); background:var(--bg-surface);
  box-shadow:var(--shadow-sm); font-weight:600; }
.daya-tabs-content { padding:12px 0; animation:fadeIn .2s ease; }

/* Toggle / Switch */
.daya-toggle { position:relative; display:inline-flex; align-items:center; gap:10px; cursor:pointer; }
.daya-toggle-track { position:relative; width:40px; height:22px; background:var(--bg-overlay);
  border-radius:11px; transition:background .2s; border:1px solid var(--border-default); flex-shrink:0; }
.daya-toggle-track[data-state="checked"] { background:var(--brand); border-color:var(--brand); }
.daya-toggle-thumb { position:absolute; top:2px; left:2px; width:16px; height:16px;
  background:#fff; border-radius:50%; transition:transform .2s cubic-bezier(0.16,1,0.3,1);
  box-shadow:0 1px 3px rgba(0,0,0,.2); }
.daya-toggle-track[data-state="checked"] .daya-toggle-thumb { transform:translateX(18px); }
.daya-toggle-label { font-size:13.5px; color:var(--text-primary); user-select:none; }

/* Tooltip */
.daya-tooltip-wrap { position:relative; display:inline-flex; }
.daya-tooltip { position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%);
  background:var(--bg-elevated); color:var(--text-primary); font-size:12px; font-weight:500;
  padding:5px 10px; border-radius:7px; white-space:nowrap; pointer-events:none; z-index:60;
  box-shadow:var(--shadow-md); border:1px solid var(--border-default);
  animation:dayaScaleIn .15s cubic-bezier(0.16,1,0.3,1) both; }
.daya-tooltip::after { content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%);
  border:5px solid transparent; border-top-color:var(--bg-elevated); }

/* Avatar */
.daya-avatar { position:relative; display:inline-flex; align-items:center; justify-content:center;
  border-radius:50%; overflow:hidden; background:var(--bg-elevated); color:var(--text-secondary);
  font-weight:600; flex-shrink:0; }
.daya-avatar img { width:100%; height:100%; object-fit:cover; }
.daya-avatar--sm { width:28px; height:28px; font-size:11px; }
.daya-avatar--md { width:36px; height:36px; font-size:13px; }
.daya-avatar--lg { width:48px; height:48px; font-size:16px; }
.daya-avatar--xl { width:64px; height:64px; font-size:20px; }
.daya-avatar-status { position:absolute; bottom:0; right:0; width:10px; height:10px;
  border-radius:50%; border:2px solid var(--bg-surface); }
.daya-avatar-status--online { background:var(--green); }
.daya-avatar-status--offline { background:var(--text-tertiary); }
.daya-avatar-status--busy { background:var(--red); }

/* Progress */
.daya-progress { width:100%; height:6px; background:var(--bg-overlay); border-radius:3px; overflow:hidden; }
.daya-progress-bar { height:100%; border-radius:3px; transition:width .4s cubic-bezier(0.16,1,0.3,1);
  background:linear-gradient(90deg, var(--brand), #8b5cf6); }
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

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectOption { value: string; label: string; disabled?: boolean }
interface SelectProps {
  value?: string; onValueChange?: (v: string) => void; placeholder?: string;
  options: SelectOption[]; disabled?: boolean; className?: string;
}
export function Select({ value, onValueChange, placeholder = 'Seleccionar...', options, disabled, className }: SelectProps) {
  useKitStyles()
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const listboxId = React.useId()

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className={cn('daya-select-wrap', className)}>
      <button type="button" className="daya-select-trigger" disabled={disabled}
        onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined} role="combobox">
        <span>{selected ? selected.label : <span style={{ color: 'var(--text-tertiary)' }}>{placeholder}</span>}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: .5, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={listboxId} className="daya-select-content" role="listbox">
          {options.map(opt => (
            <div key={opt.value} role="option" aria-selected={opt.value === value} data-disabled={opt.disabled || undefined}
              data-highlighted={opt.value === value ? '' : undefined}
              className="daya-select-item"
              onClick={() => { if (!opt.disabled) { onValueChange?.(opt.value); setOpen(false) } }}>
              <svg className="daya-select-check" viewBox="0 0 14 14" fill="none"
                style={{ opacity: opt.value === value ? 1 : 0 }}>
                <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

interface TabItem { value: string; label: string; icon?: React.ReactNode }
interface TabsProps {
  tabs: TabItem[]; value?: string; onValueChange?: (v: string) => void;
  defaultValue?: string; className?: string; children: React.ReactNode;
}
export function Tabs({ tabs, value: controlledValue, onValueChange, defaultValue, className, children }: TabsProps) {
  useKitStyles()
  const [internal, setInternal] = React.useState(defaultValue || tabs[0]?.value || '')
  const value = controlledValue ?? internal
  const setValue = onValueChange ?? setInternal

  const content = React.Children.toArray(children).find(
    (child) => React.isValidElement(child) && child.props.value === value
  ) as React.ReactElement | undefined

  return (
    <div className={className}>
      <div className="daya-tabs-list" role="tablist">
        {tabs.map(tab => (
          <button key={tab.value} role="tab" type="button"
            data-state={tab.value === value ? 'active' : 'inactive'}
            className="daya-tabs-trigger"
            onClick={() => setValue(tab.value)}>
            {tab.icon && <span style={{ marginRight: 6, display: 'inline-flex' }}>{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="daya-tabs-content" role="tabpanel">{content}</div>
    </div>
  )
}

export function TabContent({ children }: { value: string; children: React.ReactNode }) {
  return <>{children}</>
}

// ── Toggle / Switch ───────────────────────────────────────────────────────────

interface ToggleProps {
  checked?: boolean; onCheckedChange?: (v: boolean) => void;
  label?: string; disabled?: boolean; className?: string;
}
export function Toggle({ checked = false, onCheckedChange, label, disabled, className }: ToggleProps) {
  useKitStyles()
  return (
    <label className={cn('daya-toggle', className)} style={{ opacity: disabled ? .5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <div className="daya-toggle-track" data-state={checked ? 'checked' : 'unchecked'}
        role="switch" aria-checked={checked}
        onClick={() => !disabled && onCheckedChange?.(!checked)}>
        <div className="daya-toggle-thumb" />
      </div>
      {label && <span className="daya-toggle-label">{label}</span>}
    </label>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipProps {
  content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom'; className?: string;
}
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  useKitStyles()
  const [show, setShow] = React.useState(false)
  return (
    <div className={cn('daya-tooltip-wrap', className)}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
      {children}
      {show && (
        <div className="daya-tooltip" style={side === 'bottom' ? { bottom: 'auto', top: 'calc(100% + 6px)' } : undefined}
          role="tooltip">
          {content}
        </div>
      )}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'
interface AvatarProps {
  src?: string; alt?: string; name?: string; size?: AvatarSize;
  status?: 'online' | 'offline' | 'busy'; className?: string;
}
export function Avatar({ src, alt, name, size = 'md', status, className }: AvatarProps) {
  useKitStyles()
  const initials = name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?'
  return (
    <div className={cn('daya-avatar', `daya-avatar--${size}`, className)}>
      {src ? <img src={src} alt={alt || name || ''} /> : <span>{initials}</span>}
      {status && <div className={`daya-avatar-status daya-avatar-status--${status}`} />}
    </div>
  )
}

// ── Progress ──────────────────────────────────────────────────────────────────

interface ProgressProps { value?: number; max?: number; className?: string }
export function Progress({ value = 0, max = 100, className }: ProgressProps) {
  useKitStyles()
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className={cn('daya-progress', className)} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="daya-progress-bar" style={{ width: `${pct}%` }} />
    </div>
  )
}
