'use client'
import { useEffect, useState } from 'react'
import { Package, Star, Rocket, Play, Loader2, Download, Lightbulb } from 'lucide-react'

import { ADMIN_KEY, API } from '../../../lib/config'

interface TrainingItem { id: string; category: string; userMessage: string; aiResponse: string; quality: number }
interface Insight { id?: string; type: string; date: string; data: string }
interface TrainingStats { total?: number; highQuality?: number; readyForFineTuning?: boolean }

export default function AdminEntrenamiento() {
  const [data, setData] = useState<TrainingItem[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [stats, setStats] = useState<TrainingStats>({})
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [minQuality, setMinQuality] = useState('0.5')
  const [activeTab, setActiveTab] = useState<'datos' | 'insights'>('datos')

  useEffect(() => { loadAll() }, [page, minQuality])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [dataRes, insightsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/system/training-data?page=${page}&minQuality=${minQuality}`, { headers: { 'x-admin-key': ADMIN_KEY } }),
        fetch(`${API}/api/system/insights`, { headers: { 'x-admin-key': ADMIN_KEY } }),
        fetch(`${API}/api/system/stats`, { headers: { 'x-admin-key': ADMIN_KEY } }),
      ])
      const dataJson = await dataRes.json()
      const insightsJson = await insightsRes.json()
      const statsJson = await statsRes.json()
      setData(dataJson.data || [])
      setTotalPages(dataJson.pages || 1)
      setInsights(insightsJson || [])
      setStats(statsJson?.training || {})
    } catch {}
    setLoading(false)
  }

  const runLearning = async () => {
    setRunning(true)
    try {
      await fetch(`${API}/api/system/run-learning`, { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } })
      showToast('✓ Proceso de aprendizaje iniciado')
      setTimeout(loadAll, 3000)
    } catch { showToast('✗ Error al iniciar') }
    setRunning(false)
  }

  const exportData = async () => {
    setExporting(true)
    try {
      const res = await fetch(`${API}/api/system/export-training`, { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'daya-training-data.jsonl'; a.click()
      showToast('✓ Datos exportados correctamente')
    } catch { showToast('✗ Error al exportar') }
    setExporting(false)
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Aprueba o rechaza una propuesta de mejora de instrucciones. Solo lo aprobado
  // se inyecta en el system prompt del chat.
  const decideInstruction = async (id: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`${API}/api/system/instruction/${id}`, {
        method: 'PATCH',
        headers: { 'x-admin-key': ADMIN_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error()
      showToast(action === 'approve' ? '✓ Propuesta aprobada: ya se aplica en el chat' : '✓ Propuesta rechazada')
      loadAll()
    } catch { showToast('✗ No se pudo actualizar la propuesta') }
  }

  const qualityColor = (q: number) => q >= 0.7 ? '#10b981' : q >= 0.4 ? '#f59e0b' : '#f87171'

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)', position: 'relative' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toast.startsWith('✓') ? 'rgba(16,185,129,0.9)' : 'rgba(248,113,113,0.9)', color: 'white', padding: '10px 18px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600, zIndex: 1000 }}>{toast}</div>
      )}

      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Sistema Secreto</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Entrenamiento</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 4 }}>Sistema de auto-mejora de Daya AI</p>
      </div>

      {/* Stats + Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: 14, marginBottom: 28, alignItems: 'stretch' }}>
        {[
          { label: 'Datos totales', value: stats?.total || 0, icon: Package, color: '#3f3f46' },
          { label: 'Alta calidad', value: stats?.highQuality || 0, icon: Star, color: '#10b981' },
          { label: 'Listo para entrenar', value: stats?.readyForFineTuning ? '✓ Sí' : '✗ No', icon: Rocket, color: stats?.readyForFineTuning ? '#10b981' : '#f59e0b' },
        ].map(s => {
          const Icon = s.icon
          return (
          <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: s.color, opacity: 0.7 }} />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}><Icon size={14} strokeWidth={1.8} /> {s.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{s.value}</div>
          </div>
          )
        })}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={runLearning} disabled={running}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: running ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {running ? <Loader2 size={15} strokeWidth={2} className="spin" /> : <Play size={15} strokeWidth={2} />} {running ? 'Ejecutando...' : 'Ejecutar aprendizaje'}
          </button>
          <button onClick={exportData} disabled={exporting}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: exporting ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {exporting ? <Loader2 size={15} strokeWidth={2} className="spin" /> : <Download size={15} strokeWidth={2} />} {exporting ? 'Exportando...' : 'Exportar JSONL'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-elevated)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {([{ key: 'datos', label: 'Datos de entrenamiento', icon: Package }, { key: 'insights', label: 'Insights generados', icon: Lightbulb }] as const).map(t => {
          const Icon = t.icon
          return (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: activeTab === t.key ? 'var(--bg-surface)' : 'transparent', color: activeTab === t.key ? 'var(--text-primary)' : 'var(--text-tertiary)', transition: 'all 0.15s', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon size={14} strokeWidth={1.8} /> {t.label}
          </button>
          )
        })}
      </div>

      {activeTab === 'datos' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Calidad mínima:</span>
            {['0', '0.5', '0.7', '0.9'].map(q => (
              <button key={q} onClick={() => { setMinQuality(q); setPage(1) }}
                style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${minQuality === q ? 'var(--accent-500)' : 'var(--border-default)'}`, background: minQuality === q ? 'var(--bg-elevated)' : 'var(--bg-surface)', color: minQuality === q ? 'var(--accent-400)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                ≥{q}
              </button>
            ))}
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px', padding: '10px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
              {['Categoría', 'Pregunta', 'Respuesta', 'Calidad'].map(h => (
                <span key={h} style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
            {loading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>Cargando...</div>
              : data.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>No hay datos aún. Los datos se generan cuando los usuarios chatean.</div>
              : data.map((item, i) => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px', padding: '11px 16px', borderBottom: i < data.length - 1 ? '1px solid var(--border-default)' : 'none', alignItems: 'start', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--bg-overlay)', color: 'var(--text-primary)', display: 'inline-block' }}>{item.category}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.userMessage}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.aiResponse}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: qualityColor(item.quality), flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: qualityColor(item.quality) }}>{(item.quality * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>← Anterior</button>
              <span style={{ padding: '7px 14px', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Página {page} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>Siguiente →</button>
            </div>
          )}
        </>
      )}

      {activeTab === 'insights' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {insights.length === 0 ? (
            <div style={{ gridColumn: '1/-1', padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--border-default)' }}>
              No hay insights aún. El sistema genera insights cada noche a las 3:00 AM automáticamente.
            </div>
          ) : insights.map((ins, i) => {
            let parsed: { improvements?: string[]; status?: string } = {}
            try { parsed = JSON.parse(ins.data) } catch {}
            const isInstruction = ins.type === 'instruction_update'
            const improvements: string[] = isInstruction ? (Array.isArray(parsed) ? parsed : (parsed.improvements || [])) : []
            const status: string = isInstruction ? (parsed.status || 'pending') : ''
            const statusCfg: Record<string, { label: string; color: string }> = {
              pending: { label: 'Pendiente de aprobación', color: '#d97706' },
              approved: { label: 'Aprobada — activa en el chat', color: '#16a34a' },
              rejected: { label: 'Rechazada', color: '#ef4444' },
            }
            // Local const: TS conserva el estrechamiento dentro de los closures de onClick
            const pendingId = isInstruction && status === 'pending' ? ins.id : undefined
            return (
              <div key={ins.id || i} style={{ background: 'var(--bg-surface)', border: `1px solid ${isInstruction && status === 'pending' ? 'rgba(217,119,6,0.4)' : 'var(--border-default)'}`, borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{ins.type.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{new Date(ins.date).toLocaleDateString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {isInstruction ? (
                  <>
                    <span style={{ display: 'inline-block', fontSize: '0.68rem', fontWeight: 700, color: statusCfg[status]?.color || 'var(--text-tertiary)', marginBottom: 10 }}>
                      {statusCfg[status]?.label || status}
                    </span>
                    <ul style={{ margin: '0 0 12px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {improvements.map((imp, j) => (
                        <li key={j} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{imp}</li>
                      ))}
                    </ul>
                    {pendingId && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => decideInstruction(pendingId, 'approve')}
                          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          Aprobar y aplicar
                        </button>
                        <button onClick={() => decideInstruction(pendingId, 'reject')}
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          Rechazar
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <pre style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', lineHeight: 1.6 }}>
                    {JSON.stringify(parsed, null, 2).slice(0, 300)}{JSON.stringify(parsed).length > 300 ? '...' : ''}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
