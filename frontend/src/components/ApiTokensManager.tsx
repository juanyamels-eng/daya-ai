'use client'
import { useState, useEffect } from 'react'
import { tokensAPI } from '../lib/api'
import { toast } from '../lib/toast'
import type { ApiToken } from '../types/api'

export default function ApiTokensManager() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<string | null>(null)

  const load = async () => { try { const { data } = await tokensAPI.list(); setTokens(data || []) } catch {} }
  useEffect(() => { load() }, [])

  const create = async () => {
    setCreating(true)
    try {
      const { data } = await tokensAPI.create(name.trim() || 'Token')
      setJustCreated(data.token)
      setName('')
      load()
    } catch { toast('No se pudo crear el token', 'error') }
    finally { setCreating(false) }
  }

  const revoke = async (id: string) => {
    setTokens(prev => prev.filter(t => t.id !== id))
    tokensAPI.revoke(id).catch(() => {})
  }

  const copy = (v: string) => { navigator.clipboard?.writeText(v); toast('Token copiado', 'success') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {justCreated && (
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--accent-500)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Tu nuevo token (cópialo ahora, no se volverá a mostrar)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', background: 'var(--bg-base)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', overflow: 'auto', whiteSpace: 'nowrap' }}>{justCreated}</code>
            <button onClick={() => copy(justCreated)} style={smallBtn}>Copiar</button>
            <button onClick={() => setJustCreated(null)} style={smallBtn}>Listo</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del token (ej. Mi script)"
          style={{ flex: 1, padding: '10px 13px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
        <button onClick={create} disabled={creating} style={{ padding: '0 16px', borderRadius: 10, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, fontFamily: 'var(--font-body)', opacity: creating ? 0.6 : 1 }}>
          {creating ? 'Creando…' : 'Crear token'}
        </button>
      </div>

      {tokens.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>No tienes tokens. Crea uno para usar la API de Daya desde tus apps o scripts (cabecera <code>Authorization: Bearer dy_…</code>).</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tokens.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.name || 'Token'}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{t.prefix}…··· · {t.lastUsedAt ? 'usado ' + new Date(t.lastUsedAt).toLocaleDateString('es-ES') : 'sin usar'}</div>
              </div>
              <button onClick={() => revoke(t.id)} style={{ ...smallBtn, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.25)' }}>Revocar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const smallBtn: React.CSSProperties = {
  padding: '7px 13px', borderRadius: 9, background: 'transparent', border: '1px solid var(--border-default)',
  cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', flexShrink: 0,
}
