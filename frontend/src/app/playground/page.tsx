'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { Button, Badge } from '@/components/ui'
import { Play, Copy, Trash2, Clock, CheckCircle, XCircle, ArrowLeft, Globe } from 'lucide-react'

interface ApiRequest {
  id: string
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body: string
  auth: 'none' | 'bearer' | 'api-key'
}

interface ApiResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: unknown
  time: number
  size: number
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const METHOD_COLORS: Record<string, string> = {
  GET: '#10b981',
  POST: '#3b82f6',
  PUT: '#f59e0b',
  DELETE: '#ef4444',
  PATCH: '#8b5cf6',
}

export default function PlaygroundPage() {
  const { hasHydrated, isAuthenticated, token } = useAuthStore()
  const router = useRouter()
  const toast = useToast()

  const [activeRequest, setActiveRequest] = useState<ApiRequest>({
    id: 'new',
    name: 'Nueva petición',
    method: 'GET',
    url: '',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    auth: 'bearer',
  })
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ request: ApiRequest; response: ApiResponse; timestamp: number }>>([])

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  async function sendRequest() {
    if (!activeRequest.url) return toast.error('URL requerida')

    setLoading(true)
    setResponse(null)
    const startTime = Date.now()

    try {
      const headers: Record<string, string> = { ...activeRequest.headers }

      // Add auth
      if (activeRequest.auth === 'bearer' && token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const fetchOptions: RequestInit = {
        method: activeRequest.method,
        headers,
      }

      if (!['GET', 'HEAD'].includes(activeRequest.method) && activeRequest.body) {
        fetchOptions.body = activeRequest.body
      }

      const res = await fetch(activeRequest.url, fetchOptions)
      const endTime = Date.now()

      let responseBody: unknown
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('json')) {
        responseBody = await res.json()
      } else {
        responseBody = await res.text()
      }

      const responseHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      const apiResponse: ApiResponse = {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: responseBody,
        time: endTime - startTime,
        size: JSON.stringify(responseBody).length,
      }

      setResponse(apiResponse)
      setHistory(prev => [{ request: { ...activeRequest }, response: apiResponse, timestamp: Date.now() }, ...prev].slice(0, 20))
    } catch (e: unknown) {
      setResponse({
        status: 0,
        statusText: 'Error',
        headers: {},
        body: { error: e instanceof Error ? e.message : String(e) },
        time: Date.now() - startTime,
        size: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  function loadFromHistory(entry: { request: ApiRequest; response: ApiResponse }) {
    setActiveRequest(entry.request)
    setResponse(entry.response)
  }

  function copyResponse() {
    if (!response) return
    navigator.clipboard.writeText(JSON.stringify(response.body, null, 2))
    toast.success('Copiado al portapapeles')
  }

  if (!hasHydrated) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
          <ArrowLeft size={16} />
        </Button>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>API Playground</h1>
        <Badge variant="neutral" style={{ fontSize: '0.7rem' }}>Beta</Badge>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => setHistory([])}>
          <Trash2 size={14} /> Limpiar historial
        </Button>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        {/* Sidebar - History */}
        <div style={{ width: 250, borderRight: '1px solid var(--border-default)', overflowY: 'auto', background: 'var(--bg-surface)' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border-default)' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Historial</h3>
          </div>
          {history.length === 0 ? (
            <p style={{ padding: 12, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Sin peticiones</p>
          ) : (
            history.map((entry, i) => (
              <div key={i} onClick={() => loadFromHistory(entry)}
                style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-default)', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Badge variant="neutral" style={{ fontSize: '0.6rem', background: METHOD_COLORS[entry.request.method], color: '#fff', padding: '2px 6px' }}>
                    {entry.request.method}
                  </Badge>
                  <span style={{ fontSize: '0.75rem', color: entry.response.status < 400 ? '#10b981' : '#ef4444' }}>
                    {entry.response.status}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    {entry.response.time}ms
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.request.url}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Request Builder */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select value={activeRequest.method}
                onChange={e => setActiveRequest(r => ({ ...r, method: e.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: METHOD_COLORS[activeRequest.method], color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', minWidth: 90 }}>
                {METHODS.map(m => <option key={m} value={m} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>{m}</option>)}
              </select>
              <input
                value={activeRequest.url}
                onChange={e => setActiveRequest(r => ({ ...r, url: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && sendRequest()}
                placeholder="https://api.example.com/endpoint"
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'monospace' }}
              />
              <Button onClick={sendRequest} disabled={loading}>
                <Play size={16} /> {loading ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['Body', 'Headers', 'Auth'].map(tab => (
                <button key={tab}
                  style={{ padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem', background: 'var(--bg-elevated)', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Body Editor */}
            <div style={{ marginTop: 12 }}>
              <textarea
                value={activeRequest.body}
                onChange={e => setActiveRequest(r => ({ ...r, body: e.target.value }))}
                placeholder='{"key": "value"}'
                rows={6}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>
          </div>

          {/* Response */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {response ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {response.status >= 200 && response.status < 300 ? (
                      <CheckCircle size={18} style={{ color: '#10b981' }} />
                    ) : (
                      <XCircle size={18} style={{ color: '#ef4444' }} />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>{response.status}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{response.statusText}</span>
                  </div>
                  <Badge variant="neutral" style={{ fontSize: '0.7rem' }}>
                    <Clock size={12} style={{ marginRight: 4 }} /> {response.time}ms
                  </Badge>
                  <Badge variant="neutral" style={{ fontSize: '0.7rem' }}>
                    {(response.size / 1024).toFixed(1)} KB
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={copyResponse}>
                    <Copy size={14} /> Copiar
                  </Button>
                </div>

                <pre style={{ padding: 16, borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', fontSize: '0.8rem', fontFamily: 'monospace', lineHeight: 1.6, overflow: 'auto', maxHeight: 500 }}>
                  {JSON.stringify(response.body, null, 2)}
                </pre>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                <Globe size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
                <p>Envía una petición para ver la respuesta</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
