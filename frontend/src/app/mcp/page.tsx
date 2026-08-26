'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input, Badge } from '@/components/ui'
import { Plus, Trash2, RefreshCw, Server, Zap, ZapOff, Globe, Terminal } from 'lucide-react'

interface McpServer {
  name: string
  connected: boolean
  transport: 'stdio' | 'http'
  url?: string
  command?: string
  args?: string[]
  tools: { name: string; description: string }[]
}

interface McpPreset {
  id: string
  name: string
  description: string
  category: string
  url: string
  auth: 'none' | 'api-key' | 'oauth'
  authHint?: string
  docsUrl: string
}

type Mode = 'http' | 'stdio'

export default function McpPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const [servers, setServers] = useState<McpServer[]>([])
  const [presets, setPresets] = useState<McpPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [mode, setMode] = useState<Mode>('http')
  const [form, setForm] = useState({ name: '', url: '', headers: '', command: '', args: '' })

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated()) {
      loadServers()
      loadPresets()
    }
  }, [hasHydrated, isAuthenticated])

  async function loadServers() {
    try {
      setLoading(true)
      const res = await api.get('/mcp/servers')
      setServers(res.data.servers || [])
    } catch { toast.error('Error cargando servidores MCP') }
    finally { setLoading(false) }
  }

  async function loadPresets() {
    try {
      const res = await api.get('/mcp/presets')
      setPresets(res.data.presets || [])
    } catch { /* el catálogo es opcional */ }
  }

  // Headers como líneas "Clave: valor" → objeto
  function parseHeaders(raw: string): Record<string, string> {
    return Object.fromEntries(
      raw.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        const idx = line.indexOf(':')
        return idx > 0 ? [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] : null
      }).filter((x): x is [string, string] => x !== null)
    )
  }

  async function addServer() {
    if (!form.name) return toast.error('El nombre es requerido')
    try {
      if (mode === 'http') {
        if (!form.url) return toast.error('La URL es requerida')
        await api.post('/mcp/servers', {
          name: form.name,
          url: form.url,
          headers: parseHeaders(form.headers),
        })
      } else {
        if (!form.command) return toast.error('Nombre y comando requeridos')
        await api.post('/mcp/servers', {
          name: form.name,
          command: form.command,
          args: form.args.split(' ').filter(Boolean),
        })
      }
      toast.success(`Servidor "${form.name}" agregado`)
      setForm({ name: '', url: '', headers: '', command: '', args: '' })
      setShowAdd(false)
      loadServers()
    } catch {
      toast.error('Error agregando servidor (¿URL válida y alcanzable?)')
    }
  }

  async function removeServer(name: string) {
    try {
      await api.delete(`/mcp/servers/${name}`)
      toast.success(`Servidor "${name}" eliminado`)
      loadServers()
    } catch { toast.error('Error eliminando servidor') }
  }

  function applyPreset(p: McpPreset) {
    setShowAdd(true)
    setMode('http')
    setForm({ name: p.id, url: p.url, headers: '', command: '', args: '' })
    if (p.auth !== 'none') toast.info(p.auth === 'oauth'
      ? `${p.name} requiere OAuth: genera tu conexión en ${p.docsUrl}`
      : `${p.name}: agrega su header de API key (${p.authHint || 'ver docs'})`)
  }

  if (!hasHydrated) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Servidores MCP</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              Model Context Protocol — herramientas externas conectadas a DAYA
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={loadServers} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={() => setShowAdd(s => !s)}>
              <Plus size={16} /> Agregar
            </Button>
          </div>
        </div>

        {presets.length > 0 && (
          <>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 10px' }}>Catálogo recomendado</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {presets.map(p => (
                <button key={p.id} onClick={() => applyPreset(p)} title={p.description}
                  style={{ textAlign: 'left', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{p.name}</strong>
                    <Badge variant={p.auth === 'none' ? 'success' : p.auth === 'api-key' ? 'primary' : 'danger'}>
                      {p.auth === 'none' ? 'libre' : p.auth === 'api-key' ? 'API key' : 'OAuth'}
                    </Badge>
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{p.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {showAdd && (
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Nuevo Servidor MCP</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Button variant={mode === 'http' ? 'primary' : 'ghost'} size="sm" onClick={() => setMode('http')}>
                <Globe size={14} /> Remoto (URL)
              </Button>
              <Button variant={mode === 'stdio' ? 'primary' : 'ghost'} size="sm" onClick={() => setMode('stdio')}>
                <Terminal size={14} /> Local (stdio)
              </Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input placeholder="Nombre (ej: notion)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              {mode === 'http' ? (
                <>
                  <Input placeholder="https://servidor.com/mcp" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
                  <textarea placeholder={'Headers opcionales (uno por línea):\nAuthorization: Bearer sk-...\nx-api-key: ...'}
                    value={form.headers}
                    onChange={e => setForm(f => ({ ...f, headers: e.target.value }))}
                    rows={3}
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace', resize: 'vertical' }} />
                </>
              ) : (
                <>
                  <Input placeholder="Comando (ej: npx)" value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} />
                  <Input placeholder="Args separados por espacio (ej: -y @modelcontextprotocol/server-filesystem)" value={form.args} onChange={e => setForm(f => ({ ...f, args: e.target.value }))} />
                </>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancelar</Button>
                <Button onClick={addServer}>Agregar Servidor</Button>
              </div>
            </div>
          </Card>
        )}

        {servers.length === 0 && !loading && !showAdd && (
          <Card style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
            <Server size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>No hay servidores MCP configurados</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 8 }}>
              Elige uno del catálogo o agrega un endpoint remoto / comando local.
            </p>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {servers.map(server => (
            <Card key={server.name} style={{ padding: '1rem 1.5rem', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {server.connected
                    ? <Zap size={18} style={{ color: 'var(--accent-500)' }} />
                    : <ZapOff size={18} style={{ color: 'var(--text-tertiary)' }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {server.name}
                      <Badge variant="neutral">{server.transport === 'http' ? 'remoto' : 'local'}</Badge>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>
                      {server.transport === 'http' ? server.url : `${server.command} ${(server.args || []).join(' ')}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge variant={server.connected ? 'success' : 'danger'}>
                    {server.tools.length} tools
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => removeServer(server.name)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
