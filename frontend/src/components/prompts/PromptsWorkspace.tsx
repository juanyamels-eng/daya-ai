'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { promptsAPI } from '../../lib/api'
import { toast } from '../../lib/toast'

interface Preset { id: string; title: string; content: string }

export default function PromptsWorkspace() {
  const router = useRouter()
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [creating, setCreating] = useState(false)

  const load = async () => { try { const { data } = await promptsAPI.list(); setPresets(data || []) } catch {} finally { setLoading(false) } }
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!title.trim() || !content.trim()) return
    setCreating(true)
    try {
      const { data } = await promptsAPI.create({ title: title.trim(), content: content.trim() })
      setPresets(prev => [data, ...prev]); setTitle(''); setContent('')
    } catch { toast('No se pudo guardar', 'error') } finally { setCreating(false) }
  }
  const remove = async (id: string) => { setPresets(prev => prev.filter(p => p.id !== id)); promptsAPI.remove(id).catch(() => {}) }

  // Usar la plantilla: la deja lista en el chat (vía sessionStorage) y abre el chat
  const use = (p: Preset) => {
    try { sessionStorage.setItem('daya_prompt_seed', p.content) } catch {}
    router.push('/dashboard')
  }
  const copy = (p: Preset) => { navigator.clipboard?.writeText(p.content); toast('Plantilla copiada', 'success') }

  return (
    <div className="daya-page" style={{ flex: 1, height: '100%', overflowY: 'auto', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4 }}>Plantillas de prompt</h1>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-tertiary)', marginBottom: 22 }}>Guarda prompts que usas seguido y reúsalos con un clic.</p>

        {/* Crear */}
        <div style={{ padding: '16px', borderRadius: 14, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', marginBottom: 24 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título (ej. Resumen ejecutivo)"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-body)', marginBottom: 9 }} />
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Escribe el prompt reutilizable…" rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical' }} />
          <button onClick={create} disabled={creating || !title.trim() || !content.trim()}
            style={{ marginTop: 10, padding: '9px 18px', borderRadius: 10, background: title.trim() && content.trim() ? 'var(--accent-500)' : 'var(--bg-elevated)', color: title.trim() && content.trim() ? 'white' : 'var(--text-tertiary)', border: 'none', cursor: title.trim() && content.trim() ? 'pointer' : 'not-allowed', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
            {creating ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </div>

        {loading ? <p style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>Cargando…</p>
          : presets.length === 0 ? <p style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>Aún no tienes plantillas.</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {presets.map(p => (
                <div key={p.id} style={{ padding: '14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 5 }}>{p.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', lineHeight: 1.5, flex: 1, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.content}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => use(p)} style={{ flex: 1, padding: '7px', borderRadius: 8, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Usar</button>
                    <button onClick={() => copy(p)} title="Copiar" style={iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                    <button onClick={() => remove(p.id)} title="Eliminar" style={iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 32, padding: '7px 0', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-default)',
  cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
