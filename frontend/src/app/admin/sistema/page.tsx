'use client'
import { useEffect, useState, type ReactNode } from 'react'

import { ADMIN_KEY, API } from '../../../lib/config'

interface HealthInfo { status?: string; service?: string; version?: string }

export default function AdminSistema() {
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch(`${API}/health`).then(r => r.json()).then(setHealth).catch(() => setHealth({ status: 'error' }))
  }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const copyAdminKey = () => {
    navigator.clipboard.writeText(ADMIN_KEY)
    showToast('✓ Clave copiada')
  }

  const testAPI = async () => {
    try {
      const res = await fetch(`${API}/health`)
      const data = await res.json()
      showToast(`✓ API respondió: ${data.status}`)
    } catch { showToast('✗ API no responde') }
  }

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toast.startsWith('✓') ? 'rgba(16,185,129,0.9)' : 'rgba(248,113,113,0.9)', color: 'white', padding: '10px 18px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600, zIndex: 1000 }}>{toast}</div>
      )}

      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Administración</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Sistema</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 4 }}>Estado y configuración del servidor</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* API Status */}
        <Card title="Estado del servidor" icon="🟢">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <StatusRow label="API Backend" status={health?.status === 'ok'} value={health?.status || 'Verificando...'} />
            <StatusRow label="Servicio" value={health?.service || 'Daya AI'} />
            <StatusRow label="Versión" value={health?.version || '1.0.0'} />
            <button onClick={testAPI} style={{ marginTop: 8, padding: '9px', borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>
              🔄 Probar conexión
            </button>
          </div>
        </Card>

        {/* Admin Access */}
        <Card title="Acceso de administrador" icon="🔐">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>Tu clave admin (no compartir)</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{'•'.repeat(40)}</div>
            </div>
            <button onClick={copyAdminKey} style={{ padding: '9px', borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
              📋 Copiar clave admin
            </button>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
              Usa esta clave en el header <code style={{ fontFamily: 'monospace', background: 'var(--bg-overlay)', padding: '1px 4px', borderRadius: 3 }}>x-admin-key</code> para acceder a la API de administración.
            </p>
          </div>
        </Card>

        {/* API Endpoints */}
        <Card title="Endpoints de administración" icon="🔌">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { method: 'GET', path: '/api/system/stats', desc: 'Estadísticas generales' },
              { method: 'GET', path: '/api/system/users', desc: 'Lista de usuarios' },
              { method: 'PATCH', path: '/api/system/users/:id', desc: 'Editar usuario' },
              { method: 'DELETE', path: '/api/system/users/:id', desc: 'Eliminar usuario' },
              { method: 'GET', path: '/api/system/training-data', desc: 'Datos de entrenamiento' },
              { method: 'POST', path: '/api/system/run-learning', desc: 'Ejecutar aprendizaje' },
              { method: 'GET', path: '/api/system/insights', desc: 'Ver insights' },
              { method: 'POST', path: '/api/system/export-training', desc: 'Exportar JSONL' },
            ].map(e => (
              <div key={e.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-elevated)' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: e.method === 'GET' ? 'rgba(59,130,246,0.15)' : e.method === 'POST' ? 'rgba(16,185,129,0.15)' : e.method === 'PATCH' ? 'rgba(245,158,11,0.15)' : 'rgba(248,113,113,0.15)', color: e.method === 'GET' ? '#52525b' : e.method === 'POST' ? '#34d399' : e.method === 'PATCH' ? '#fbbf24' : '#f87171', flexShrink: 0 }}>{e.method}</span>
                <code style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontFamily: 'monospace', flex: 1 }}>{e.path}</code>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{e.desc}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Scheduler info */}
        <Card title="Scheduler nocturno" icon="⏰">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace', marginBottom: 4 }}>03:00 AM</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Hora de ejecución diaria</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['Analizar patrones de conversaciones', 'Actualizar instrucciones de Daya', 'Puntuar datos de entrenamiento', 'Eliminar datos de baja calidad', 'Generar insights del día', 'Obtener conocimiento de internet'].map((task, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-500)', flexShrink: 0 }} />
                  {task}
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', fontSize: '0.78rem', color: '#10b981' }}>
              🔒 Este proceso es invisible para los usuarios
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <h2 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function StatusRow({ label, status, value }: { label: string; status?: boolean; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-default)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {status !== undefined && <div style={{ width: 7, height: 7, borderRadius: '50%', background: status ? '#10b981' : '#f87171' }} />}
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{value}</span>
      </div>
    </div>
  )
}
