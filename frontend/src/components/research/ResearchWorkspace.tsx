'use client'
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuthStore } from '../../store'
import { toast } from '../../lib/toast'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface ResearchItem {
  id: string
  topic: string
  phase: 'queued' | 'searching' | 'analyzing' | 'writing' | 'done' | 'error' | 'cancelled'
  result?: string
  error?: string
}

const actionBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  borderRadius: 9, background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
}

export default function ResearchWorkspace() {
  const { token } = useAuthStore()
  const [topic, setTopic] = useState('')
  const [rounds, setRounds] = useState(3)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [history, setHistory] = useState<ResearchItem[]>([])
  const [selected, setSelected] = useState<ResearchItem | null>(null)
  const [phase, setPhase] = useState('')
  const progressEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadHistory() }, [])

  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [progress])

  const loadHistory = async () => {
    try {
      const r = await fetch(`${API}/api/research2`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await r.json()
      setHistory(data.items || [])
    } catch {}
  }

  const phaseLabel = (p: string) => {
    const map: Record<string, string> = {
      queued: 'En cola...', searching: 'Buscando en la web...', analyzing: 'Analizando fuentes...',
      writing: 'Redactando informe...', done: 'Completado', error: 'Error', cancelled: 'Cancelada',
    }
    return map[p] || p
  }

  const phaseColor = (p: string) => {
    if (p === 'done') return '#16a34a'
    if (p === 'error' || p === 'cancelled') return '#ef4444'
    return 'var(--text-tertiary)'
  }

  const startResearch = async () => {
    if (!topic.trim() || running) return
    setRunning(true)
    setResult(null)
    setProgress([])
    setSelected(null)
    setCurrentId(null)
    setPhase('Iniciando...')

    try {
      const res = await fetch(`${API}/api/research2/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: topic.trim(), rounds }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        setPhase('Error: ' + (err.error || 'No se pudo iniciar'))
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (d.id) setCurrentId(d.id)
            if (d.phase) setPhase(phaseLabel(d.phase))
            if (d.progress) { setProgress(p => [...p, d.progress]); setPhase(phaseLabel(d.progress)) }
            if (d.done && d.report) { setResult(d.report); setPhase('Completado'); setRunning(false); loadHistory() }
            if (d.error) { setPhase('Error: ' + d.error); setRunning(false) }
            if (d.cancelled) { setPhase('Cancelada'); setRunning(false) }
          } catch {}
        }
      }
    } catch {
      setPhase('Error de conexión')
      setRunning(false)
    }
  }

  const cancelResearch = async () => {
    if (!currentId) { setRunning(false); setPhase('Cancelada'); return }
    await fetch(`${API}/api/research2/${currentId}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
    setRunning(false)
    setPhase('Cancelada')
  }

  const shownResult = selected?.result ?? result

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Panel lateral: historial */}
      <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface)' }}>
        <div style={{ padding: '20px 16px 12px', fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-tertiary)', letterSpacing: '0.07em' }}>INVESTIGACIONES</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {history.length === 0 && (
            <div style={{ padding: '12px 10px', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>Sin investigaciones previas</div>
          )}
          {history.map(item => (
            <button key={item.id}
              onClick={() => { setSelected(item); setResult(null); setProgress([]) }}
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: selected?.id === item.id ? 'var(--bg-elevated)' : 'transparent', marginBottom: 2, fontFamily: 'var(--font-body)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
              onMouseLeave={e => { if (selected?.id !== item.id) e.currentTarget.style.background = 'transparent' }}>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.topic}</div>
              <div style={{ fontSize: '0.72rem', color: phaseColor(item.phase), marginTop: 2 }}>{phaseLabel(item.phase)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Panel principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header + input */}
        <div style={{ padding: '24px 32px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>Investigación</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)' }}>Deep Research</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startResearch()}
              placeholder="¿Qué quieres investigar? Ej: impacto de la IA en el empleo 2024"
              disabled={running}
              style={{ flex: 1, padding: '12px 18px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.93rem', outline: 'none', fontFamily: 'var(--font-body)' }}
            />
            <select value={rounds} onChange={e => setRounds(Number(e.target.value))} disabled={running}
              style={{ padding: '0 12px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '0.83rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} rondas</option>)}
            </select>
            {running
              ? <button onClick={cancelResearch} style={{ padding: '0 18px', borderRadius: 12, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>Cancelar</button>
              : <button onClick={startResearch} disabled={!topic.trim()} style={{ padding: '0 22px', borderRadius: 12, border: 'none', background: topic.trim() ? 'var(--text-primary)' : 'var(--bg-elevated)', color: topic.trim() ? 'var(--bg-base)' : 'var(--text-tertiary)', fontSize: '0.88rem', fontWeight: 700, cursor: topic.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>Investigar</button>
            }
          </div>
          {phase && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {running && <span style={{ width: 11, height: 11, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{phase}</span>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {!shownResult && progress.length === 0 && !running && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.93rem', color: 'var(--text-secondary)', marginBottom: 5 }}>Investigación profunda</div>
                <div style={{ fontSize: '0.81rem', lineHeight: 1.6 }}>Busca, analiza fuentes web y redacta un informe completo<br />sobre cualquier tema. Elige las rondas para más profundidad.</div>
              </div>
            </div>
          )}

          {!shownResult && progress.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 640 }}>
              {progress.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)', flexShrink: 0, marginTop: 7 }} />
                  <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{p}</span>
                </div>
              ))}
              <div ref={progressEndRef} />
            </div>
          )}

          {shownResult && (
            <div style={{ maxWidth: 760 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => { navigator.clipboard?.writeText(shownResult || ''); toast('Informe copiado', 'success') }}
                  style={actionBtn}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar informe
                </button>
                <button
                  onClick={async () => {
                    try {
                      const title = selected?.topic || topic || 'Investigación'
                      const res = await fetch(`${API}/api/editor/save`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ title, content: shownResult }),
                      })
                      if (res.ok) toast('Guardado en documentos', 'success')
                      else toast('No se pudo guardar', 'error')
                    } catch { toast('Error al guardar', 'error') }
                  }}
                  style={actionBtn}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Guardar como documento
                </button>
              </div>
              <div className="prose-daya">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{shownResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
