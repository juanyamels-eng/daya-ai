'use client'
import { useState } from 'react'
import { useAuthStore } from '../../store'
import { toast } from '../../lib/toast'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface Side { response: string; name: string }

export default function CompareWorkspace() {
  const { token } = useAuthStore()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [a, setA] = useState<Side | null>(null)
  const [b, setB] = useState<Side | null>(null)
  const [vote, setVote] = useState<'a' | 'b' | 'tie' | null>(null)

  const compare = async () => {
    const p = prompt.trim()
    if (!p || loading) return
    setLoading(true); setError(''); setA(null); setB(null); setVote(null)
    try {
      const res = await fetch(`${API}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: p }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'No se pudo comparar.'); setLoading(false); return }
      setA(data.a); setB(data.b)
    } catch {
      setError('Se perdió la conexión. Intenta de nuevo.')
    } finally { setLoading(false) }
  }

  const revealed = vote !== null

  const Column = ({ side, data, label }: { side: 'a' | 'b'; data: Side; label: string }) => {
    const won = revealed && vote === side
    const lost = revealed && vote !== 'tie' && vote !== side
    return (
      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        border: `1.5px solid ${won ? 'var(--accent-500)' : 'var(--border-default)'}`,
        borderRadius: 16, background: 'var(--bg-surface)', overflow: 'hidden',
        opacity: lost ? 0.6 : 1, transition: 'all 0.25s',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>Respuesta {label}</span>
          {revealed && (
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: won ? 'var(--accent-500)' : 'var(--text-tertiary)', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 5 }}>
              {won && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
              {data.name}
            </span>
          )}
        </div>
        <div style={{ padding: '16px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowY: 'auto', flex: 1 }}>
          {data.response}
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => { navigator.clipboard?.writeText(data.response); toast('Copiado', 'success') }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copiar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Header con el sello (serif) */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Comparar a ciegas</h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginTop: 4 }}>Dos modelos responden lo mismo. Elige el mejor sin saber cuál es cuál — luego se revela.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 1000, width: '100%', margin: '0 auto' }}>
        {!a && !loading && !error && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem', marginTop: 8 }}>
            Escribe una pregunta abajo y pulsa comparar. Por ejemplo: «Explica la computación cuántica a un niño de 10 años» o «Escribe un eslogan para una cafetería».
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-tertiary)', fontSize: '0.88rem', marginTop: 20 }}>
            <span style={{ width: 14, height: 14, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
            Consultando a los dos modelos…
          </div>
        )}

        {error && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', fontSize: '0.84rem' }}>{error}</div>}

        {a && b && (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 240 }}>
              <Column side="a" data={a} label="A" />
              <Column side="b" data={b} label="B" />
            </div>

            {!revealed ? (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
                <button onClick={() => setVote('a')} style={voteBtn}>Prefiero A</button>
                <button onClick={() => setVote('tie')} style={{ ...voteBtn, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Empate</button>
                <button onClick={() => setVote('b')} style={voteBtn}>Prefiero B</button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', marginTop: 18 }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                  {vote === 'tie' ? 'Empate. ' : `Elegiste a ${vote === 'a' ? a.name : b.name}. `}
                  Ya puedes ver qué modelo era cada uno.
                </p>
                <button onClick={() => { setA(null); setB(null); setVote(null); setPrompt('') }} style={voteBtn}>Nueva comparación</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Entrada */}
      {!a && (
        <div style={{ padding: '12px 24px 20px', flexShrink: 0, maxWidth: 760, width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: 8 }}>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={1}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); compare() } }}
              placeholder="Escribe el prompt a comparar…"
              style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', padding: '8px 10px', maxHeight: 120, lineHeight: 1.5 }} />
            <button onClick={compare} disabled={!prompt.trim() || loading}
              style={{ width: 38, height: 38, borderRadius: 10, background: prompt.trim() ? 'var(--accent-500)' : 'var(--bg-elevated)', border: 'none', cursor: prompt.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={prompt.trim() ? 'white' : 'var(--text-tertiary)'} strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const voteBtn: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 11, background: 'var(--accent-500)', color: 'white',
  border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)',
}
