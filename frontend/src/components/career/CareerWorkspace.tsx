'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuthStore } from '../../store'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface MatchResult {
  score: number           // 0-100
  strengths: string[]
  gaps: string[]
  verdict: string
  recommendation: string
}

interface FullResult {
  match?: MatchResult
  tailoredResume?: Record<string, unknown>
  tailorChanges?: string[]
  coverLetter?: string
  error?: string
}

export default function CareerWorkspace() {
  const { token } = useAuthStore()
  const [resumeText, setResumeText] = useState('')
  const [jobText, setJobText] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [tone, setTone] = useState('professional')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FullResult | null>(null)
  const [tab, setTab] = useState<'match' | 'resume' | 'letter'>('match')
  const [copied, setCopied] = useState('')

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const analyze = async () => {
    if (!resumeText.trim() || (!jobText.trim() && !jobUrl.trim())) return
    setLoading(true)
    setResult(null)
    try {
      const r = await fetch(`${API}/api/career/full`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resumeText: resumeText.trim(),
          ...(jobUrl.trim() ? { jobUrl: jobUrl.trim() } : { jobText: jobText.trim() }),
          tone,
        }),
      })
      const data = await r.json()
      setResult(data)
      setTab('match')
    } catch { setResult({ error: 'Error al analizar. Intenta de nuevo.' }) }
    finally { setLoading(false) }
  }

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 45 ? '#d97706' : '#ef4444'

  const tabBtn = (key: typeof tab, label: string) => (
    <button onClick={() => setTab(key)}
      style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--border-default)', background: tab === key ? 'var(--text-primary)' : 'transparent', color: tab === key ? 'var(--bg-base)' : 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
      {label}
    </button>
  )

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{ padding: '22px 32px 18px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>Carrera</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)' }}>CV + Oferta → Análisis IA</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Formulario */}
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {/* CV */}
            <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>TU CV (texto)</label>
              <textarea
                value={resumeText}
                onChange={e => setResumeText(e.target.value)}
                placeholder="Pega aquí el texto de tu currículum. Puede ser en cualquier formato — Daya lo estructurará automáticamente."
                rows={10}
                style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.87rem', resize: 'vertical', outline: 'none', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
              />
            </div>

            {/* Oferta */}
            <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>OFERTA DE EMPLEO</label>
              <textarea
                value={jobText}
                onChange={e => { setJobText(e.target.value); if (e.target.value) setJobUrl('') }}
                placeholder="Pega aquí el texto de la oferta de trabajo."
                rows={8}
                style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.87rem', resize: 'vertical', outline: 'none', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>o URL de la oferta:</span>
                <input value={jobUrl} onChange={e => { setJobUrl(e.target.value); if (e.target.value) setJobText('') }}
                  placeholder="https://..."
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tono carta:</label>
              <select value={tone} onChange={e => setTone(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.83rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <option value="professional">Profesional</option>
                <option value="formal">Formal</option>
                <option value="casual">Cercano</option>
                <option value="enthusiastic">Entusiasta</option>
              </select>
            </div>
            <button
              onClick={analyze}
              disabled={loading || !resumeText.trim() || (!jobText.trim() && !jobUrl.trim())}
              style={{ padding: '10px 28px', borderRadius: 12, border: 'none', background: (resumeText.trim() && (jobText.trim() || jobUrl.trim())) ? 'var(--text-primary)' : 'var(--bg-elevated)', color: (resumeText.trim() && (jobText.trim() || jobUrl.trim())) ? 'var(--bg-base)' : 'var(--text-tertiary)', fontSize: '0.92rem', fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
              {loading ? 'Analizando...' : 'Analizar'}
            </button>
            {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 14, height: 14, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Estructurando, haciendo match y redactando carta...</span>
            </div>}
          </div>
        </div>

        {/* Error */}
        {result?.error && (
          <div style={{ padding: '0 32px 20px' }}>
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.85rem' }}>{result.error}</div>
          </div>
        )}

        {/* Resultados */}
        {result && !result.error && (
          <div style={{ padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {tabBtn('match', 'Análisis de encaje')}
              {result.tailoredResume && tabBtn('resume', 'CV adaptado')}
              {result.coverLetter && tabBtn('letter', 'Carta de presentación')}
            </div>

            {/* Tab: match */}
            {tab === 'match' && result.match && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: '2.8rem', fontWeight: 900, color: scoreColor(result.match.score), letterSpacing: '-0.03em', lineHeight: 1 }}>{result.match.score}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 700, letterSpacing: '0.06em', marginTop: 3 }}>ENCAJE</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{result.match.verdict}</div>
                    <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{result.match.recommendation}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {result.match.strengths?.length > 0 && (
                    <div style={{ flex: 1, minWidth: 220, padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(22,163,74,0.25)', background: 'rgba(22,163,74,0.05)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#16a34a', letterSpacing: '0.06em', marginBottom: 10 }}>PUNTOS FUERTES</div>
                      {result.match.strengths.map((s, i) => <div key={i} style={{ fontSize: '0.84rem', color: 'var(--text-primary)', marginBottom: 5, display: 'flex', gap: 7 }}><span style={{ color: '#16a34a', flexShrink: 0 }}>✓</span>{s}</div>)}
                    </div>
                  )}
                  {result.match.gaps?.length > 0 && (
                    <div style={{ flex: 1, minWidth: 220, padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#ef4444', letterSpacing: '0.06em', marginBottom: 10 }}>BRECHAS</div>
                      {result.match.gaps.map((g, i) => <div key={i} style={{ fontSize: '0.84rem', color: 'var(--text-primary)', marginBottom: 5, display: 'flex', gap: 7 }}><span style={{ color: '#ef4444', flexShrink: 0 }}>✗</span>{g}</div>)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: CV adaptado */}
            {tab === 'resume' && (
              <div style={{ padding: '20px 24px', borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>CV adaptado a la oferta</span>
                  <button onClick={() => copy(JSON.stringify(result.tailoredResume, null, 2), 'resume')}
                    style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.79rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    {copied === 'resume' ? '¡Copiado!' : 'Copiar JSON'}
                  </button>
                </div>
                {result.tailorChanges && result.tailorChanges.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.76rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: 8 }}>CAMBIOS REALIZADOS</div>
                    {result.tailorChanges.map((c, i) => <div key={i} style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', gap: 7 }}><span>→</span>{c}</div>)}
                  </div>
                )}
                <pre style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.6, background: 'var(--bg-base)', padding: '14px', borderRadius: 10, overflowX: 'auto' }}>
                  {JSON.stringify(result.tailoredResume, null, 2)}
                </pre>
              </div>
            )}

            {/* Tab: carta */}
            {tab === 'letter' && result.coverLetter && (
              <div style={{ padding: '20px 24px', borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Carta de presentación</span>
                  <button onClick={() => copy(result.coverLetter!, 'letter')}
                    style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.79rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    {copied === 'letter' ? '¡Copiada!' : 'Copiar texto'}
                  </button>
                </div>
                <div className="prose-daya">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.coverLetter}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
