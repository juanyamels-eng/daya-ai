'use client'
import { useState, useRef, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'

const LOCALES = ['es', 'en', 'pt', 'fr', 'de', 'it'] as const
type Locale = typeof LOCALES[number]

function setLocaleCookie(code: string) {
  document.cookie = `daya-locale=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  window.location.reload()
}

export function LangSelector({ dropUp = false }: { dropUp?: boolean }) {
  const locale = useLocale() as Locale
  const t = useTranslations('langSelector')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <div ref={ref} className="ls-root">
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={t('ariaLabel')}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="ls-trigger"
        >
          <GlobeIcon />
          <span>{locale.toUpperCase()}</span>
          <ChevronIcon open={open} />
        </button>

        {open && (
          <div
            className={`ls-dropdown${dropUp ? ' ls-dropdown--up' : ' ls-dropdown--down'}`}
            role="listbox"
            aria-label={t('ariaLabel')}
          >
            {LOCALES.map(code => (
              <button
                key={code}
                role="option"
                aria-selected={code === locale}
                onClick={() => { setLocaleCookie(code); setOpen(false) }}
                className={`ls-option${code === locale ? ' ls-option--active' : ''}`}
              >
                <span className="ls-code">{code.toUpperCase()}</span>
                <span className="ls-name">{t(code)}</span>
                {code === locale && <CheckIcon />}
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .ls-root { position: relative; display: inline-block; }
        .ls-trigger {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 7px 11px; border-radius: 9px;
          background: transparent; border: 1px solid var(--border-default);
          cursor: pointer; font-size: 0.78rem; font-weight: 600;
          color: var(--text-secondary); font-family: var(--font-body);
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .ls-trigger:hover { background: var(--bg-elevated); color: var(--text-primary); border-color: var(--border-strong); }
        .ls-dropdown {
          position: absolute; z-index: 300; min-width: 158px;
          background: var(--bg-base); border: 1px solid var(--border-default);
          border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,0.13), 0 2px 6px rgba(0,0,0,0.06);
          padding: 4px; right: 0;
        }
        .ls-dropdown--down { top: calc(100% + 8px); }
        .ls-dropdown--up  { bottom: calc(100% + 8px); }
        .ls-option {
          width: 100%; display: flex; align-items: center; gap: 9px;
          padding: 9px 11px; border: none; background: transparent;
          cursor: pointer; font-family: var(--font-body); border-radius: 8px;
          transition: background 0.12s; text-align: left;
        }
        .ls-option:hover { background: var(--bg-elevated); }
        .ls-option--active { background: var(--bg-surface); }
        .ls-code { font-size: 0.67rem; font-weight: 800; color: var(--text-tertiary); letter-spacing: 0.07em; min-width: 22px; }
        .ls-option--active .ls-code { color: var(--accent-500); }
        .ls-name { font-size: 0.84rem; color: var(--text-primary); font-weight: 500; flex: 1; }
      `}</style>
    </>
  )
}

function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      style={{ transition: 'transform 0.18s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-500)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
