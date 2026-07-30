'use client'
// Renderiza un bloque ```mermaid``` del chat como diagrama SVG.
// 100% cliente (mermaid.render es async y toca el DOM). Si el código es inválido,
// cae al bloque de código en texto plano — nunca rompe el chat.
import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useAuthStore } from '../../store'

// mermaid.initialize es global; re-inicializamos solo si cambia el tema.
let currentTheme: 'dark' | 'default' | null = null
function ensureInit(dark: boolean) {
  const theme = dark ? 'dark' : 'default'
  if (currentTheme === theme) return
  currentTheme = theme
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'strict',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  })
}

export default function MermaidBlock({ code }: { code: string }) {
  const { theme } = useAuthStore()
  const dark = theme === 'dark'
  const [svg, setSvg] = useState('')
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const idRef = useRef('mmd-' + Math.random().toString(36).slice(2, 9))

  useEffect(() => {
    let cancelled = false
    setState('loading')
    ;(async () => {
      try {
        ensureInit(dark)
        // id único y válido; el sufijo de tema evita colisiones al re-render por tema.
        const { svg } = await mermaid.render(`${idRef.current}-${dark ? 'd' : 'l'}`, code)
        if (!cancelled) { setSvg(svg); setState('ok') }
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [code, dark])

  // Fallback: el modelo escribió mermaid inválido → mostrar el código, no romper.
  if (state === 'error') {
    return (
      <pre style={{
        margin: '12px 0', padding: '12px 14px', borderRadius: 10, overflowX: 'auto',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono, monospace)',
        lineHeight: 1.55,
      }}>{code}</pre>
    )
  }

  return (
    <div className="daya-mermaid" style={{
      margin: '14px 0', padding: '16px', borderRadius: 12, overflowX: 'auto',
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      display: 'flex', justifyContent: 'center', minHeight: state === 'loading' ? 48 : undefined,
      animation: 'dayaRise 0.25s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      {state === 'loading'
        ? <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', alignSelf: 'center' }}>Dibujando diagrama…</span>
        : <span style={{ maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
      }
      <style>{`.daya-mermaid svg { max-width: 100%; height: auto; }`}</style>
    </div>
  )
}
