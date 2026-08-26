'use client'
import { useState, useEffect } from 'react'
import type { AxiosError } from 'axios'
import { emailAPI } from '../../lib/api'
import { useAuthStore } from '../../store'
import { toast } from '../../lib/toast'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface EmailAccount { username?: string }

interface EmailMessage {
  uid: number
  from: string
  fromAddress?: string
  subject: string
  date: string
  seen?: boolean
}

type ApiErr = AxiosError<{ error?: string }>

export default function EmailWorkspace() {
  const { token } = useAuthStore()
  const [status, setStatus] = useState<{ connected: boolean; encryptionReady: boolean; account: EmailAccount | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loadingInbox, setLoadingInbox] = useState(false)
  const [error, setError] = useState('')
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [summarizing, setSummarizing] = useState<string | null>(null)
  const [showSmtp, setShowSmtp] = useState(false)

  // Formulario de conexión
  const [form, setForm] = useState({ imapHost: '', imapPort: 993, username: '', password: '', fromName: '', smtpHost: '', smtpPort: 587 })
  const [connecting, setConnecting] = useState(false)

  // Redactar
  const [compose, setCompose] = useState(false)
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)

  const loadStatus = async () => {
    try { const { data } = await emailAPI.account(); setStatus(data); if (data.connected) loadInbox() }
    catch {} finally { setLoading(false) }
  }
  useEffect(() => {
    loadStatus()
  }, [])

  const loadInbox = async () => {
    setLoadingInbox(true); setError('')
    try { const { data } = await emailAPI.inbox(); setMessages(data.messages || []) }
    catch (e: unknown) { setError((e as ApiErr)?.response?.data?.error || 'No se pudo cargar la bandeja.') }
    finally { setLoadingInbox(false) }
  }

  const connect = async () => {
    if (!form.imapHost || !form.username || !form.password) return
    setConnecting(true); setError('')
    try {
      await emailAPI.connect({ ...form })
      await loadStatus()
    } catch (e: unknown) { setError((e as ApiErr)?.response?.data?.error || 'No se pudo conectar.') }
    finally { setConnecting(false) }
  }

  const disconnect = async () => {
    await emailAPI.disconnect().catch(() => {})
    setMessages([]); setStatus(s => s ? { ...s, connected: false, account: null } : s)
  }

  const summarize = async (uid: number) => {
    setSummarizing(String(uid))
    try { const { data } = await emailAPI.summarize(uid); setSummaries(prev => ({ ...prev, [uid]: data.summary })) }
    catch { setSummaries(prev => ({ ...prev, [uid]: 'No se pudo resumir.' })) }
    finally { setSummarizing(null) }
  }

  const sendEmail = async () => {
    const { to, subject, body } = composeForm
    if (!to.trim() || !subject.trim() || !body.trim()) { toast('Rellena todos los campos', 'error'); return }
    setSending(true)
    try {
      const res = await fetch(`${API}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(composeForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('Correo enviado', 'success')
      setCompose(false)
      setComposeForm({ to: '', subject: '', body: '' })
    } catch (e: unknown) { toast(e instanceof Error && e.message ? e.message : 'No se pudo enviar', 'error') }
    finally { setSending(false) }
  }

  const fmt = (d: string) => { try { return new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Correo</h1>
          {status?.connected && status.account && <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{status.account.username}</p>}
        </div>
        {status?.connected && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCompose(true)} style={{ ...ghostBtn, background: 'var(--accent-500)', color: 'white', border: 'none' }}>
              Redactar
            </button>
            <button onClick={loadInbox} style={ghostBtn}>Actualizar</button>
            <button onClick={disconnect} style={{ ...ghostBtn, color: 'var(--red)' }}>Desconectar</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 780, width: '100%', margin: '0 auto' }}>
        {loading ? <p style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>Cargando…</p>
          : !status?.encryptionReady ? (
            <Notice title="Falta configuración del servidor"
              body="Para guardar tu contraseña de forma segura, el servidor necesita la variable EMAIL_ENC_KEY (un texto secreto cualquiera) en el backend. Pídele a quien administra el despliegue que la configure." />
          ) : !status?.connected ? (
            <div style={{ maxWidth: 460 }}>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                Conecta tu correo por IMAP para ver tu bandeja aquí. Con Gmail/Outlook quizá necesites una <b>contraseña de aplicación</b>.
              </p>
              {error && <ErrorBox text={error} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Servidor IMAP" value={form.imapHost} onChange={v => setForm({ ...form, imapHost: v })} placeholder="imap.gmail.com" />
                <Field label="Puerto IMAP" value={String(form.imapPort)} onChange={v => setForm({ ...form, imapPort: parseInt(v) || 993 })} placeholder="993" />
                <Field label="Usuario / correo" value={form.username} onChange={v => setForm({ ...form, username: v })} placeholder="tucorreo@gmail.com" />
                <Field label="Contraseña (o contraseña de aplicación)" type="password" value={form.password} onChange={v => setForm({ ...form, password: v })} placeholder="••••••••" />
                <Field label="Nombre visible (opcional)" value={form.fromName} onChange={v => setForm({ ...form, fromName: v })} placeholder="Tu Nombre" />

                <button onClick={() => setShowSmtp(s => !s)}
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d={showSmtp ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}/></svg>
                  {showSmtp ? 'Ocultar SMTP (para enviar)' : 'Configurar SMTP (para enviar correos)'}
                </button>

                {showSmtp && (
                  <>
                    <Field label="Servidor SMTP" value={form.smtpHost} onChange={v => setForm({ ...form, smtpHost: v })} placeholder="smtp.gmail.com" />
                    <Field label="Puerto SMTP" value={String(form.smtpPort)} onChange={v => setForm({ ...form, smtpPort: parseInt(v) || 587 })} placeholder="587" />
                  </>
                )}

                <button onClick={connect} disabled={connecting || !form.imapHost || !form.username || !form.password}
                  style={{ marginTop: 4, padding: '11px', borderRadius: 11, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, fontFamily: 'var(--font-body)', opacity: connecting ? 0.6 : 1 }}>
                  {connecting ? 'Conectando…' : 'Conectar'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && <ErrorBox text={error} />}
              {loadingInbox ? <p style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>Cargando bandeja…</p>
                : messages.length === 0 ? <p style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>Bandeja vacía.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {messages.map(m => (
                      <div key={m.uid} style={{ padding: '13px 15px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: '0.86rem', fontWeight: m.seen ? 500 : 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.from}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>{fmt(m.date)}</span>
                        </div>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</div>
                        {summaries[m.uid] && (
                          <div style={{ marginTop: 9, padding: '9px 11px', borderRadius: 9, background: 'var(--bg-elevated)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{summaries[m.uid]}</div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                          <button onClick={() => summarize(m.uid)} disabled={summarizing === String(m.uid)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5z"/></svg>
                            {summarizing === String(m.uid) ? 'Resumiendo…' : 'Resumir con IA'}
                          </button>
                          <button onClick={() => { setComposeForm({ to: m.fromAddress || '', subject: `Re: ${m.subject}`, body: '' }); setCompose(true) }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                            Responder
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </>
          )}
      </div>

      {/* Modal redactar */}
      {compose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', zIndex: 100, padding: 24 }}
          onClick={() => setCompose(false)}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, width: 500, maxWidth: '96vw', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Nuevo correo</span>
              <button onClick={() => setCompose(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 20 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Para" value={composeForm.to} onChange={v => setComposeForm(f => ({ ...f, to: v }))} placeholder="destinatario@correo.com" />
              <Field label="Asunto" value={composeForm.subject} onChange={v => setComposeForm(f => ({ ...f, subject: v }))} placeholder="Asunto del correo" />
              <label style={{ display: 'block' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5 }}>Mensaje</span>
                <textarea value={composeForm.body} onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}
                  rows={7} placeholder="Escribe tu mensaje aquí…"
                  style={{ width: '100%', padding: '10px 13px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setCompose(false)} style={{ padding: '9px 18px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>Cancelar</button>
              <button onClick={sendEmail} disabled={sending}
                style={{ padding: '9px 18px', borderRadius: 10, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, fontFamily: 'var(--font-body)', opacity: sending ? 0.6 : 1 }}>
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5 }}>{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 13px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
    </label>
  )
}
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', maxWidth: 460 }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}
function ErrorBox({ text }: { text: string }) {
  return <div style={{ marginBottom: 14, padding: '11px 13px', borderRadius: 10, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', fontSize: '0.83rem', lineHeight: 1.5 }}>{text}</div>
}

const ghostBtn: React.CSSProperties = {
  padding: '7px 13px', borderRadius: 9, background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  cursor: 'pointer', fontSize: '0.79rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
}
