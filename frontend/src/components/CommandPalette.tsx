'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Cmd {
  section: string
  label: string
  hint: string
  href: string
  icon: JSX.Element
  keywords: string
  shortcut?: string
}

const S = {
  chat: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  agent: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>,
  compare: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="18" rx="1.5"/></svg>,
  notes: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  email: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 5L2 7"/></svg>,
  editor: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>,
  prompts: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v14H7l-4 4z"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  estudio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  code: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  community: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
}

const COMMANDS: Cmd[] = [
  { section: 'Navegar', label: 'Inicio', hint: 'Chat con Daya', href: '/dashboard', icon: S.home, keywords: 'inicio home chat conversar', shortcut: 'Ctrl+1' },
  { section: 'Navegar', label: 'Ajustes', hint: 'Configuración y cuenta', href: '/settings', icon: S.settings, keywords: 'ajustes configuracion settings cuenta perfil', shortcut: 'Ctrl+,' },
  { section: 'Navegar', label: 'Notas', hint: 'Notas rápidas', href: '/notes', icon: S.notes, keywords: 'notas notes apuntes escribir' },
  { section: 'Navegar', label: 'Calendario', hint: 'Eventos y agenda', href: '/calendar', icon: S.calendar, keywords: 'calendario calendar eventos agenda' },
  { section: 'Navegar', label: 'Correo', hint: 'Email inteligente', href: '/email', icon: S.email, keywords: 'correo email mail mensajes' },
  { section: 'Herramientas', label: 'Studio', hint: 'Editor visual', href: '/studio', icon: S.estudio, keywords: 'estudio studio editor diseno design' },
  { section: 'Herramientas', label: 'Imágenes', hint: 'Editor de imágenes', href: '/image-editor', icon: S.editor, keywords: 'imagenes images editor editar' },
  { section: 'Herramientas', label: 'Prompts', hint: 'Biblioteca de prompts', href: '/prompts', icon: S.prompts, keywords: 'prompts plantillas library' },
  { section: 'Herramientas', label: 'Automatizaciones', hint: 'Flujos automáticos', href: '/automations', icon: S.agent, keywords: 'automatizaciones automations flujos' },
  { section: 'Herramientas', label: 'Proyectos', hint: 'Gestión de proyectos', href: '/projects', icon: S.compare, keywords: 'proyectos projects tareas' },
  { section: 'Investigación', label: 'Cuadernos', hint: 'Investigación con fuentes', href: '/cuadernos', icon: S.notes, keywords: 'cuadernos notebooks investigacion research' },
  { section: 'Investigación', label: 'Research', hint: 'Búsqueda profunda', href: '/research', icon: S.agent, keywords: 'research investigacion busqueda' },
  { section: 'Investigación', label: 'Comparar', hint: 'Compara modelos y resultados', href: '/compare', icon: S.compare, keywords: 'comparar compare modelos' },
  { section: 'Daya Code', label: 'Code', hint: 'Agente de programación', href: '/code', icon: S.code, keywords: 'code codigo programacion terminal' },
  { section: 'Daya Code', label: 'Comunidad', hint: 'Foro y comunidad', href: '/community', icon: S.community, keywords: 'comunidad community foro' },
]

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); setQ(''); setActive(0) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30) }, [open])

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const filtered = q.trim()
    ? COMMANDS.filter(c => norm(c.label + ' ' + c.hint + ' ' + c.keywords).includes(norm(q)))
    : COMMANDS

  const go = useCallback((c: Cmd) => { setOpen(false); router.push(c.href) }, [router])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); go(filtered[active]) }
  }

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  let lastSection = ''
  const items = filtered.map((c, i) => {
    const showSection = c.section !== lastSection
    lastSection = c.section
    return { ...c, i, showSection }
  })

  return (
    <div onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(580px, 92vw)', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border-default)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0) }} onKeyDown={onKeyDown}
            placeholder="Buscar funciones, herramientas y páginas…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.95rem', fontFamily: 'var(--font-body)' }} />
          <kbd style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)', borderRadius: 5, padding: '2px 6px', fontFamily: 'var(--font-body)' }}>ESC</kbd>
        </div>
        <div ref={listRef} style={{ maxHeight: 400, overflowY: 'auto', padding: 6 }}>
          {items.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 8, opacity: 0.4 }}>~</div>
              Sin resultados para <strong style={{ color: 'var(--text-secondary)' }}>{q}</strong>
            </div>
          ) : items.map(c => (
            <div key={c.href}>
              {c.showSection && (
                <div style={{ padding: '8px 13px 4px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{c.section}</div>
              )}
              <button onClick={() => go(c)} onMouseEnter={() => setActive(c.i)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', background: c.i === active ? 'var(--bg-elevated)' : 'transparent', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', transition: 'background 0.1s' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}>{c.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{c.label}</span>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', marginLeft: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.hint}</span>
                </span>
                {c.shortcut && (
                  <kbd style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)', borderRadius: 5, padding: '2px 6px', fontFamily: 'var(--font-body)', background: 'var(--bg-base)' }}>{c.shortcut}</kbd>
                )}
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-default)', display: 'flex', gap: 14, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
          <span><kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 3, padding: '1px 5px', fontSize: '0.65rem', fontFamily: 'var(--font-body)' }}>↑↓</kbd> Navegar</span>
          <span><kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 3, padding: '1px 5px', fontSize: '0.65rem', fontFamily: 'var(--font-body)' }}>↵</kbd> Abrir</span>
          <span><kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 3, padding: '1px 5px', fontSize: '0.65rem', fontFamily: 'var(--font-body)' }}>Esc</kbd> Cerrar</span>
        </div>
      </div>
    </div>
  )
}
