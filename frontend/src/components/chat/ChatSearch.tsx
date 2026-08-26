'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

/* ============================================================================
   Buscar dentro de la conversación abierta (Ctrl+F).

   Todo local: se busca en el array de mensajes del store, sin pedirle nada al
   backend. Lo que se recorre es la conversación ACTIVA, no el historial entero
   (para eso está el buscador del panel lateral, con la tecla `/`).

   El resaltado se pinta con la CSS Custom Highlight API: crea rangos sobre el
   texto ya renderizado SIN tocar el DOM, que es justo lo que hace falta aquí —
   envolver los aciertos en <mark> significaría meter mano en nodos que React
   controla y arriesgarse a que reviente al reconciliar. Donde no exista la API,
   el salto sigue funcionando y el mensaje destino da un destello.
   ========================================================================== */

interface Hit { msgId: string; at: number }

const HL = 'daya-find'
const HL_ON = 'daya-find-on'

interface HighlightRegistryLike {
  delete(name: string): unknown
  set(name: string, highlight: unknown): unknown
}

function highlights(): HighlightRegistryLike | null {
  if (typeof window === 'undefined') return null
  const c = (window as unknown as { CSS?: { highlights?: HighlightRegistryLike } }).CSS
  return c && c.highlights ? c.highlights : null
}

/** Rangos de texto dentro de `root` que coinciden con `needle` (ya en minúsculas). */
function rangesIn(root: Element, needle: string): Range[] {
  const out: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const hay = (node.nodeValue || '').toLowerCase()
    let from = 0
    for (;;) {
      const at = hay.indexOf(needle, from)
      if (at === -1) break
      const r = document.createRange()
      r.setStart(node, at)
      r.setEnd(node, at + needle.length)
      out.push(r)
      from = at + needle.length
    }
  }
  return out
}

function clearPaint() {
  const h = highlights()
  if (!h) return
  h.delete(HL); h.delete(HL_ON)
}

export default function ChatSearch({ messages, onClose }: {
  messages: { id: string; content: string }[]
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => () => clearPaint(), [])

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const out: Hit[] = []
    for (const m of messages) {
      // Los mensajes internos (documentos generados) no son texto que leer.
      if (m.content.startsWith('__DOC__')) continue
      const hay = m.content.toLowerCase()
      let from = 0
      for (;;) {
        const at = hay.indexOf(needle, from)
        if (at === -1) break
        out.push({ msgId: m.id, at })
        from = at + needle.length
      }
    }
    return out
  }, [q, messages])

  useEffect(() => { setIdx(0) }, [q])

  // Salta al acierto actual y repinta. Va en un efecto para que corra DESPUÉS de
  // que React haya pintado los mensajes.
  useEffect(() => {
    const needle = q.trim().toLowerCase()
    clearPaint()
    if (needle.length < 2 || !hits.length) return

    const hit = hits[Math.min(idx, hits.length - 1)]
    const target = document.getElementById('m-' + hit.msgId)
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })

    const h = highlights()
    if (!h) {
      // Sin API de resaltado: al menos que se vea a qué mensaje ha saltado.
      if (!target) return
      target.classList.add('daya-find-flash')
      const t = setTimeout(() => target.classList.remove('daya-find-flash'), 1100)
      return () => clearTimeout(t)
    }

    const all: Range[] = []
    let activeRange: Range | null = null
    // Cuántos aciertos van dentro de este mismo mensaje hasta el actual: así se
    // marca EL acierto, no el primero del mensaje.
    const nthInMsg = hits.slice(0, Math.min(idx, hits.length - 1)).filter(x => x.msgId === hit.msgId).length
    for (const m of messages) {
      const el = document.getElementById('m-' + m.id)
      if (!el) continue
      const rs = rangesIn(el, needle)
      if (m.id === hit.msgId && rs[nthInMsg]) activeRange = rs[nthInMsg]
      all.push(...rs)
    }
    try {
      const H = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
      if (!H) return
      h.set(HL, new H(...all))
      if (activeRange) h.set(HL_ON, new H(activeRange))
    } catch {}
  }, [q, idx, hits, messages])

  const go = (delta: number) => {
    if (!hits.length) return
    setIdx(i => (i + delta + hits.length) % hits.length)
  }

  // Se coloca justo debajo de la barra del título (top:8, 32px de alto).
  return (
    <div role="search" aria-label="Buscar en la conversación"
      style={{ position: 'absolute', top: 48, right: 18, zIndex: 40, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px 7px 12px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-md)', animation: 'slideDown 0.18s ease-out both' }}>
      <input
        ref={inputRef}
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1) }
          else if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
        placeholder="Buscar en esta conversación"
        style={{ width: 200, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-body)' }}
      />
      <span aria-live="polite" style={{ minWidth: 52, textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
        {q.trim().length < 2 ? '' : hits.length ? `${idx + 1} / ${hits.length}` : 'sin resultados'}
      </span>
      <NavBtn label="Anterior" onClick={() => go(-1)} disabled={!hits.length}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
      </NavBtn>
      <NavBtn label="Siguiente" onClick={() => go(1)} disabled={!hits.length}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </NavBtn>
      <NavBtn label="Cerrar" onClick={onClose}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </NavBtn>
    </div>
  )
}

function NavBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}>
      {children}
    </button>
  )
}
