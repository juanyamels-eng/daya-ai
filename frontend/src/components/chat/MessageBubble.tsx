'use client'
import React, { useState, memo, lazy, Suspense } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { runJavaScript, RUNNABLE_LANGS, type RunResult } from '../../lib/runJs'
import { runPython, RUNNABLE_PYTHON } from '../../lib/runPython'
import { Message } from '../../store'
import { useAuthStore } from '../../store'

const MermaidBlock = lazy(() => import('./MermaidBlock'))
const ChartBlock = lazy(() => import('./ChartBlock'))

const SyntaxHighlighter = lazy(() => import('react-syntax-highlighter').then(m => ({ default: m.Prism })))

function CodeBlockFallback() {
  return <div style={{ padding: '8px 12px', fontSize: '13px', color: '#888', background: '#1e1e1e', borderRadius: 6 }}>Loading...</div>
}

const API = process.env.NEXT_PUBLIC_API_URL || ''

// Clipboard con fallback para contextos sin HTTPS (localhost HTTP, iframes, etc.)
function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text))
  } else {
    legacyCopy(text)
  }
}
function legacyCopy(text: string) {
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0'
  document.body.appendChild(el)
  el.select()
  try { document.execCommand('copy') } catch {}
  document.body.removeChild(el)
}

interface Props { message: Message; streaming?: boolean; onRegenerate?: () => void; onArtifact?: (artifact: { lang: string; code: string; title?: string }) => void; reasoning?: string; prevUserContent?: string; onEdit?: (messageId: string, content: string) => void }

interface FactCheckResult { error?: string; reliabilityScore?: number; summary?: string; claims?: { claim: string; verdict: string; explanation?: string }[] }

// memo evita que todos los mensajes anteriores se re-rendericen en cada chunk del stream.
function formatTime(iso: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

// Solo se actualiza la burbuja cuyo content o streaming cambia.
function MessageBubbleInner({ message, streaming, onRegenerate, onArtifact, reasoning, prevUserContent, onEdit }: Props) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<1 | -1 | 0>(0)
  const [speaking, setSpeaking] = useState(false)
  const [factChecking, setFactChecking] = useState(false)
  const [factResult, setFactResult] = useState<FactCheckResult | null>(null)

  // Leer en voz alta con la síntesis del navegador (gratis, sin servidor).
  const toggleSpeak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    window.speechSynthesis.cancel()
    // Quita markdown básico para que no lea los símbolos
    const clean = message.content.replace(/[#*`_>~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim()
    const u = new SpeechSynthesisUtterance(clean)
    u.rate = 1.02
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(u)
  }

  const handleFactCheck = async () => {
    if (factChecking) return
    if (factResult) { setFactResult(null); return }
    setFactChecking(true)
    try {
      const { useAuthStore } = await import('../../store')
      const token = useAuthStore.getState().token
      const res = await fetch(`${API}/api/factcheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: message.content, maxClaims: 5 }),
      })
      const data = await res.json()
      setFactResult(data)
    } catch {
      setFactResult({ error: 'No se pudo verificar. Intenta de nuevo.' })
    } finally {
      setFactChecking(false)
    }
  }

  const giveFeedback = async (rating: 1 | -1) => {
    if (feedback === rating) return   // ya enviado: no duplicar filas de entrenamiento
    setFeedback(rating)
    try {
      const { chatAPI } = await import('../../lib/api')
      // La pregunta del usuario viaja con la respuesta: el par completo es lo
      // que alimenta el sistema de auto-mejora.
      await chatAPI.sendFeedback(prevUserContent || '', message.content, rating)
    } catch {}
  }

  const copyText = () => {
    copyToClipboard(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isUser) {
    const hasImages = !!message.images?.length
    const hasFiles = !!message.files?.length
    return (
      <div className="daya-user-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginBottom: 20, animation: 'dayaRise 0.26s cubic-bezier(0.16,1,0.3,1) both' }}>
        {hasImages && message.images!.map((src, i) => (
          <img key={i} src={src} alt="adjunto"
            style={{ maxWidth: 'min(320px, 75%)', maxHeight: 340, borderRadius: 14, objectFit: 'cover', border: '1px solid var(--border-default)', display: 'block' }} />
        ))}
        {hasFiles && message.files!.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: '75%', padding: '10px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
          </div>
        ))}
        {message.content && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, maxWidth: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: '100%', flexDirection: 'row-reverse' }}>
              <div className="daya-user-bubble" style={{
                maxWidth: '74%',
                padding: '10px 16px',
                borderRadius: '16px 16px 4px 16px',
                background: 'color-mix(in srgb, var(--accent-500) 13%, var(--bg-surface))',
                color: 'var(--text-primary)',
                fontSize: '0.93rem',
                lineHeight: 1.65,
                fontFamily: 'var(--font-body)',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                border: '1px solid color-mix(in srgb, var(--accent-500) 28%, transparent)',
              }}>
                {message.content}
              </div>
              {onEdit && (
                <button onClick={() => onEdit(message.id, message.content)}
                  title="Editar mensaje"
                  className="daya-user-action"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 4, borderRadius: 6, color: 'var(--text-tertiary)',
                    opacity: 0, transition: 'opacity 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginBottom: 2,
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity 0.15s' }} className="daya-user-actions">
              <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', padding: '4px 6px', lineHeight: 1 }}>{formatTime(message.createdAt)}</span>
              <button onClick={copyText} title="Copiar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {copied
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Daya message
  return (
    <div className="daya-msg" style={{ display: 'flex', marginBottom: 24, animation: 'dayaRise 0.26s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {streaming && (
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {[0,1,2].map(i => (
                <span key={i} className="daya-think-dot" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </span>
          </div>
        )}

        {reasoning && (
          <details className="daya-reasoning" open={streaming || undefined}>
            <summary>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/></svg>
              Razonamiento
              <svg className="daya-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </summary>
            <div className="daya-reasoning-body">{reasoning}</div>
          </details>
        )}

        <div className="prose-daya">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
            rehypePlugins={[rehypeKatex]}
            components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '')
              const lang = match ? match[1] : ''
              const raw = String(children).replace(/\n$/, '')
              const isBlock = raw.includes('\n') || !!lang
              if (!isBlock) return <code className={className} {...props}>{children}</code>
              // Mientras streamea, el bloque llega incompleto: mostramos el código y
              // renderizamos el diagrama/gráfico SOLO cuando la respuesta termina
              // (evita el parpadeo de intentar dibujar JSON/mermaid a medias).
              if (lang === 'mermaid') return streaming ? <CodeBlock lang="mermaid" code={raw} /> : <Suspense fallback={<CodeBlockFallback />}><MermaidBlock code={raw} /></Suspense>
              if (lang === 'chart') return streaming ? <CodeBlock lang="json" code={raw} /> : <Suspense fallback={<CodeBlockFallback />}><ChartBlock code={raw} /></Suspense>
              return <CodeBlock lang={lang} code={raw} onArtifact={onArtifact} />
            },
            a({ href, children, ...props }) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--accent-400)', textDecoration: 'underline', wordBreak: 'break-all' }}
                  {...props}>
                  {children}
                </a>
              )
            },
          }}>{message.content}</ReactMarkdown>
          {streaming && <span className="daya-caret" />}
        </div>

        {!streaming && message.content && (
          <div className="daya-msg-actions" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, flexWrap: 'nowrap', overflow: 'hidden' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', padding: '0 4px', lineHeight: 1, marginRight: 4, flexShrink: 0 }}>{formatTime(message.createdAt)}</span>
            <button onClick={copyText} title={copied ? 'Copiado' : 'Copiar'}
              style={{ ...actionIconBtn, color: copied ? 'var(--green)' : 'var(--text-tertiary)', transition: 'background 0.15s, color 0.18s, transform 0.2s cubic-bezier(0.16,1,0.3,1)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; if (!copied) e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (!copied) e.currentTarget.style.color = 'var(--text-tertiary)' }}>
              <span style={{ display: 'block', animation: copied ? 'copyPop 0.28s cubic-bezier(0.16,1,0.3,1)' : 'none' }}>
                {copied
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                }
              </span>
            </button>
            <button onClick={() => giveFeedback(1)} title="Buena respuesta"
              style={{ ...actionIconBtn, color: feedback === 1 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (feedback !== 1) e.currentTarget.style.color = 'var(--text-tertiary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={feedback === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/></svg>
            </button>
            <button onClick={() => giveFeedback(-1)} title="Respuesta a mejorar"
              style={{ ...actionIconBtn, color: feedback === -1 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (feedback !== -1) e.currentTarget.style.color = 'var(--text-tertiary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={feedback === -1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z"/></svg>
            </button>
            <button onClick={toggleSpeak} title={speaking ? 'Detener lectura' : 'Leer en voz alta'}
              style={{ ...actionIconBtn, color: speaking ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (!speaking) e.currentTarget.style.color = 'var(--text-tertiary)' }}>
              {speaking
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>}
            </button>
            {onRegenerate && (
              <button onClick={onRegenerate} title="Regenerar respuesta"
                style={{ ...actionIconBtn, color: 'var(--text-tertiary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              </button>
            )}
            <button onClick={handleFactCheck} title={factResult ? 'Cerrar verificación' : 'Verificar afirmaciones'}
              style={{ ...actionIconBtn, color: factResult ? 'var(--text-primary)' : factChecking ? 'var(--text-tertiary)' : 'var(--text-tertiary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (!factResult) e.currentTarget.style.color = 'var(--text-tertiary)' }}>
              {factChecking
                ? <span style={{ width: 12, height: 12, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            </button>
          </div>
        )}
        {factResult && !factResult.error && (
          <div style={{ marginTop: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', fontSize: '0.82rem', animation: 'dayaRise 0.3s cubic-bezier(0.16,1,0.3,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>VERIFICACIÓN</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '0.88rem', color: (factResult.reliabilityScore ?? 0) >= 70 ? '#16a34a' : (factResult.reliabilityScore ?? 0) >= 40 ? '#d97706' : '#ef4444' }}>
                {factResult.reliabilityScore}% fiable
              </span>
            </div>
            {factResult.summary && <p style={{ color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>{factResult.summary}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {factResult.claims?.map((c, i) => {
                const v = c.verdict
                const color = v === 'respaldada' ? '#16a34a' : v === 'refutada' ? '#ef4444' : '#d97706'
                const label = v === 'respaldada' ? '✓' : v === 'refutada' ? '✗' : '?'
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', animation: 'dayaRise 0.28s cubic-bezier(0.16,1,0.3,1) both', animationDelay: `${i * 0.055}s` }}>
                    <span style={{ fontWeight: 700, color, fontSize: '0.82rem', flexShrink: 0, marginTop: 1 }}>{label}</span>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{c.claim}</div>
                      {c.explanation && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.76rem', marginTop: 2 }}>{c.explanation}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {factResult?.error && (
          <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{factResult.error}</div>
        )}
      </div>
      <style>{`
        @keyframes typingBounce{
          0%,100%{transform:translateY(0);opacity:.28}
          40%{transform:translateY(-5px);opacity:1}
          65%{transform:translateY(-2px);opacity:.7}
        }
        .daya-caret{
          display:inline-block;width:2px;height:0.9em;margin-left:2px;
          vertical-align:text-bottom;background:var(--text-secondary);
          border-radius:1px;animation:caretBlink 0.88s ease-in-out infinite
        }
        @keyframes caretBlink{0%,100%{opacity:1}45%,55%{opacity:0}}
        @keyframes copyPop{0%{transform:scale(0.6) rotate(-10deg);opacity:0}60%{transform:scale(1.2) rotate(4deg)}100%{transform:scale(1) rotate(0);opacity:1}}
      `}</style>
    </div>
  )
}

const MessageBubble = memo(MessageBubbleInner, (prev, next) =>
  prev.message.content === next.message.content &&
  prev.streaming === next.streaming &&
  prev.message.id === next.message.id &&
  prev.onArtifact === next.onArtifact &&
  prev.reasoning === next.reasoning
)
export default MessageBubble

// Bloque de código con syntax highlighting (Prism + tema VS Code Dark+) y botón de copiar
const LANG_LABELS: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  jsx: 'JSX', tsx: 'TSX', py: 'Python', python: 'Python', rs: 'Rust', rust: 'Rust',
  go: 'Go', java: 'Java', cs: 'C#', cpp: 'C++', c: 'C', php: 'PHP', rb: 'Ruby',
  swift: 'Swift', kt: 'Kotlin', sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', md: 'Markdown', sh: 'Shell', bash: 'Bash',
  dockerfile: 'Dockerfile', graphql: 'GraphQL', xml: 'XML', toml: 'TOML',
}

const EXT_MAP: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py', rust: 'rs', go: 'go',
  html: 'html', css: 'css', scss: 'scss', svg: 'svg', bash: 'sh', shell: 'sh',
  java: 'java', cpp: 'cpp', c: 'c', php: 'php', ruby: 'rb', swift: 'swift',
  kotlin: 'kt', sql: 'sql', json: 'json', yaml: 'yml', markdown: 'md',
}
const PREVIEWABLE_LANGS = new Set(['html', 'svg', 'css', 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx'])
const LANG_ICON_COLOR: Record<string, string> = {
  html: '#e34c26', css: '#264de4', javascript: '#f0b429', js: '#f0b429',
  typescript: '#3178c6', ts: '#3178c6', python: '#3572a5', rust: '#dea584',
  go: '#00add8', java: '#b07219', svg: '#ff9900', bash: '#89e051', shell: '#89e051',
}

function extractCodeTitle(code: string, lang: string): string {
  const l = lang.toLowerCase()
  if (l === 'html' || l === 'svg') {
    const m = code.match(/<title[^>]*>([^<]{2,60})<\/title>/i)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  // First line comment: // Title, # Title, /* Title */
  const m2 = code.match(/^[ \t]*(?:\/\/|#|<!--)\s*([A-Za-zÀ-ÿ0-9][^*\n\r]{2,60?})(?:\s*-->|\s*\*\/)?\s*$/m)
  if (m2?.[1]?.trim()) return m2[1].trim()
  return ''
}

function CodeBlock({ lang, code, onArtifact }: { lang: string; code: string; onArtifact?: (a: { lang: string; code: string; title?: string }) => void }) {
  const [copied, setCopied] = useState(false)
  const { theme } = useAuthStore()
  const dark = theme === 'dark'
  const l = (lang || '').toLowerCase()
  const label = LANG_LABELS[l] || (lang ? lang.toUpperCase() : 'Código')
  const lines = code.split('\n').length
  const ext = EXT_MAP[l] || l || 'txt'
  const canPreview = PREVIEWABLE_LANGS.has(l)
  const titleFromCode = extractCodeTitle(code, lang)
  const iconColor = LANG_ICON_COLOR[l] || 'var(--text-secondary)'

  const copy = () => { copyToClipboard(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  // Ejecutar código en el navegador: JavaScript (Web Worker) o Python (Pyodide/WASM).
  const runnableJs = RUNNABLE_LANGS.has(l)
  const runnablePy = RUNNABLE_PYTHON.has(l)
  const runnable = runnableJs || runnablePy
  const runBorder = dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid var(--border-default)'
  const [running, setRunning] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const [runRes, setRunRes] = useState<RunResult | null>(null)
  const runCode = async () => {
    if (running) return
    setRunning(true); setRunRes(null); setRunStatus('')
    try {
      const res = runnablePy
        ? await runPython(code, { onStatus: setRunStatus })
        : await runJavaScript(code)
      setRunRes(res)
    }
    catch (e: unknown) { setRunRes({ logs: [], error: String(e instanceof Error ? e.message : e), durationMs: 0 }) }
    finally { setRunning(false); setRunStatus('') }
  }

  const runButton = runnable && (
    <button onClick={runCode} disabled={running}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 5, background: 'transparent', border: runBorder, cursor: running ? 'default' : 'pointer', color: running ? 'var(--text-tertiary)' : '#22c55e', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', opacity: running ? 0.7 : 1 }}
      onMouseEnter={e => { if (!running) e.currentTarget.style.background = 'rgba(34,197,94,0.12)' }}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {running
        ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg> {runStatus || 'Ejecutando…'}</>
        : <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg> Ejecutar</>}
    </button>
  )

  // Panel con la salida de la ejecución (consola + errores). Estilo terminal.
  const outputPanel = runRes && (
    <div style={{ borderTop: runBorder, background: dark ? '#12121c' : '#0d1117', color: '#e6edf3', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem', lineHeight: 1.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#9aa4b2', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        <span>Salida</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: runRes.error ? '#f87171' : '#4ade80' }}>{runRes.error ? '● error' : '● ok'}</span>
          <span style={{ opacity: 0.7 }}>{runRes.durationMs} ms</span>
          <button onClick={() => setRunRes(null)} title="Cerrar" style={{ background: 'transparent', border: 'none', color: '#9aa4b2', cursor: 'pointer', padding: 0, fontSize: '0.8rem', lineHeight: 1 }}>✕</button>
        </span>
      </div>
      <div style={{ padding: '10px 12px', maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {runRes.logs.map((ln, i) => (
          <div key={i} style={{ color: ln.level === 'error' ? '#f87171' : ln.level === 'warn' ? '#fbbf24' : '#e6edf3' }}>{ln.text}</div>
        ))}
        {runRes.error && <div style={{ color: '#f87171', marginTop: runRes.logs.length ? 6 : 0 }}>{runRes.error}</div>}
        {!runRes.logs.length && !runRes.error && <div style={{ color: '#6b7280', fontStyle: 'italic' }}>(sin salida — el código no imprimió nada con console.log)</div>}
      </div>
    </div>
  )

  const download = () => {
    const safe = (titleFromCode || label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${safe || 'codigo'}.${ext}`; a.click()
    URL.revokeObjectURL(url)
  }

  // "Archivo completo": señales estructurales (shebang, ≥2 imports/includes, o ≥2
  // definiciones de alto nivel). Sirve para mandar al panel un archivo corto pero
  // completo (≥5 líneas), no solo el código largo. Conservador: no toca snippets cortos.
  const looksLikeFile =
    /^#!/.test(code) ||
    ((code.match(/^\s*(?:import\b|from\b.+\bimport\b|#include\b|using\b|package\b)/gm)?.length || 0) >= 2) ||
    ((code.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|def|interface|type|enum|struct|fn|func)\b/gm)?.length || 0) >= 2)

  // ── ARTIFACT CARD: código largo (≥8 líneas), archivo completo (≥5) o HTML/SVG →
  // no mostrar el código suelto en el chat, sino como tarjeta + panel lateral.
  if (onArtifact && (lines >= 8 || l === 'html' || l === 'svg' || (looksLikeFile && lines >= 5))) {
    const artifact = { lang, code, title: titleFromCode || label }
    return (
      <div style={{ margin: '12px 0', borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', overflow: 'hidden', animation: 'dayaRise 0.25s cubic-bezier(0.16,1,0.3,1) both' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: dark ? '#1e1e2e' : '#f0f0f6', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {titleFromCode || label}
            </div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)', marginTop: 1 }}>
              {label} · {lines} {lines === 1 ? 'línea' : 'líneas'}
            </div>
          </div>
          <span style={{ padding: '2px 8px', borderRadius: 5, background: 'var(--bg-base)', border: '1px solid var(--border-default)', fontSize: '0.69rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', fontFamily: 'monospace', flexShrink: 0 }}>
            .{ext}
          </span>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px' }}>
          {canPreview ? (
            <button onClick={() => onArtifact(artifact)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'var(--accent-500)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              {l === 'html' ? 'Ejecutar' : 'Preview'}
            </button>
          ) : (
            <button onClick={() => onArtifact(artifact)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'var(--accent-500)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Ver código
            </button>
          )}
          {canPreview && (
            <button onClick={() => onArtifact({ ...artifact })}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.79rem', fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Código
            </button>
          )}
          {runButton}
          <div style={{ flex: 1 }} />
          <button onClick={copy}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, background: 'transparent', color: copied ? 'var(--green)' : 'var(--text-tertiary)', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.79rem', fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            {copied
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>Copiado</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copiar</>}
          </button>
          <button onClick={download}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.79rem', fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar
          </button>
        </div>
        {outputPanel}
      </div>
    )
  }

  // ── INLINE: snippets cortos (<8 líneas) sin panel — mantiene highlighting compacto
  const codeBg = dark ? '#1e1e2e' : '#f6f8fa'
  const headerBg = dark ? '#181825' : '#eaeef2'
  const btnColor = dark ? '#a6adc8' : '#57606a'
  const btnBorder = dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid var(--border-default)'
  const btnHoverBg = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  const btnHoverColor = dark ? '#cdd6f4' : '#1f2328'
  const borderColor = dark ? 'rgba(255,255,255,0.07)' : 'var(--border-default)'
  const numColor = dark ? '#4a4f6a' : '#8c959f'

  return (
    <div className="daya-codeblock" style={{ borderRadius: 10, overflow: 'hidden', margin: '12px 0', border: `1px solid ${borderColor}`, fontSize: '0.84rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: headerBg, borderBottom: `1px solid ${borderColor}` }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: btnColor, letterSpacing: '0.04em', fontFamily: 'var(--font-body)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {runButton}
          <button onClick={copy}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 5, background: 'transparent', border: btnBorder, cursor: 'pointer', color: btnColor, fontSize: '0.7rem', fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = btnHoverBg; e.currentTarget.style.color = btnHoverColor }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = btnColor }}>
            {copied
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg> Copiado</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar</>}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={lang || 'text'}
        style={{}}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.84rem', lineHeight: 1.65, background: codeBg, padding: '14px 16px', overflowX: 'auto' }}
        showLineNumbers={lines > 4}
        lineNumberStyle={{ color: numColor, fontSize: '0.75rem', minWidth: '2.2em', paddingRight: '1em', userSelect: 'none' }}
        wrapLongLines={false}
        PreTag="div"
      >
        {code}
      </SyntaxHighlighter>
      {outputPanel}
    </div>
  )
}

const actionIconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 6px',
  borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer',
  transition: 'all 0.15s', flexShrink: 0,
}
