'use client'
import { useState, useEffect } from 'react'
import { tokensAPI } from '../lib/api'
import { toast } from '../lib/toast'
import { Button, Input } from '@/components/ui'
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
            <Button variant="secondary" size="sm" onClick={() => copy(justCreated)}>Copiar</Button>
            <Button variant="secondary" size="sm" onClick={() => setJustCreated(null)}>Listo</Button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del token (ej. Mi script)" className="flex-1" />
        <Button onClick={create} disabled={creating}>
          {creating ? 'Creando…' : 'Crear token'}
        </Button>
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
              <Button variant="danger" size="sm" onClick={() => revoke(t.id)}>Revocar</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

