'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface TriggerSpec { triggerId: string; config?: Record<string, string> }

interface StepSpec { actionId: string; config?: Record<string, string> }

interface Recipe {
  id: string
  name: string
  enabled: boolean
  intervalMin?: number
  trigger?: TriggerSpec
  steps?: StepSpec[]
  lastRun?: string
  lastStatus?: 'ok' | 'error'
}

interface Template {
  id: string
  name: string
  description: string
  intervalMin?: number
  trigger: TriggerSpec
  steps: StepSpec[]
}

interface Log {
  recipeId: string
  recipeName?: string
  status: 'ok' | 'error'
  ts: number
  error?: string
  output?: string
}

interface Piece {
  id: string
  kind: 'trigger' | 'action'
  name: string
  description: string
  schema: Record<string, { type: string; label: string; required?: boolean; options?: string[]; placeholder?: string }>
}

export default function AutomationsWorkspace() {
  const { token } = useAuthStore()
  const [tab, setTab] = useState<'recipes' | 'templates' | 'logs'>('recipes')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [pieces, setPieces] = useState<{ triggers: Piece[]; actions: Piece[] }>({ triggers: [], actions: [] })

  // Editor de receta
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null)
  const [editTrigger, setEditTrigger] = useState<string>('manual')
  const [editTriggerCfg, setEditTriggerCfg] = useState<Record<string, string>>({})
  const [editSteps, setEditSteps] = useState<{ actionId: string; config: Record<string, string> }[]>([])
  const [editInterval, setEditInterval] = useState(60)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [rRecipes, rTemplates, rLogs, rPieces] = await Promise.all([
        fetch(`${API}/api/automations`, { headers }).then(r => r.json()),
        fetch(`${API}/api/automations/templates`, { headers }).then(r => r.json()),
        fetch(`${API}/api/automations/logs`, { headers }).then(r => r.json()),
        fetch(`${API}/api/automations/pieces`, { headers }).then(r => r.json()).catch(() => ({ triggers: [], actions: [] })),
      ])
      setRecipes(rRecipes.recipes || [])
      setTemplates(rTemplates.templates || [])
      setLogs(rLogs.logs || [])
      setPieces(rPieces)
    } catch {} finally { setLoading(false) }
  }

  const createFromTemplate = async (tpl: Template) => {
    setCreating(true)
    try {
      const r = await fetch(`${API}/api/automations`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: tpl.name, trigger: tpl.trigger, steps: tpl.steps, intervalMin: tpl.intervalMin }),
      })
      const d = await r.json()
      if (d.recipe) { setRecipes(p => [d.recipe, ...p]); setTab('recipes'); flash('Automatización creada') }
      else flash(d.error || 'Error al crear', true)
    } catch {} finally { setCreating(false) }
  }

  const createCustom = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const r = await fetch(`${API}/api/automations`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: newName.trim(), trigger: { triggerId: 'schedule', config: {} }, steps: [], intervalMin: 60 }),
      })
      const d = await r.json()
      if (d.recipe) { setRecipes(p => [d.recipe, ...p]); setShowCreate(false); setNewName(''); flash('Creada') }
    } catch {} finally { setCreating(false) }
  }

  const toggle = async (id: string, enabled: boolean) => {
    await fetch(`${API}/api/automations/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ enabled }) }).catch(() => {})
    setRecipes(r => r.map(x => x.id === id ? { ...x, enabled } : x))
  }

  const deleteRecipe = async (id: string) => {
    if (!confirm('¿Eliminar esta automatización?')) return
    await fetch(`${API}/api/automations/${id}`, { method: 'DELETE', headers }).catch(() => {})
    setRecipes(r => r.filter(x => x.id !== id))
  }

  const runNow = async (id: string) => {
    setRunning(id)
    try {
      const r = await fetch(`${API}/api/automations/${id}/run`, { method: 'POST', headers })
      const d = await r.json()
      if (d.run?.status === 'ok') flash('Ejecutada con éxito')
      else flash(d.run?.error || d.error || 'Error al ejecutar', true)
      loadAll()
    } catch { flash('Error', true) } finally { setRunning(null) }
  }

  const openEditor = (r: Recipe) => {
    setEditRecipe(r)
    setEditName(r.name)
    setEditTrigger(r.trigger?.triggerId || 'manual')
    setEditTriggerCfg(r.trigger?.config || {})
    setEditSteps((r.steps || []).map(s => ({ actionId: s.actionId || '', config: s.config || {} })))
    setEditInterval(r.intervalMin || 60)
  }

  const saveEditor = async () => {
    if (!editRecipe) return
    setSaving(true)
    try {
      await fetch(`${API}/api/automations/${editRecipe.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          name: editName.trim() || editRecipe.name,
          trigger: { triggerId: editTrigger, config: editTriggerCfg },
          steps: editSteps,
          intervalMin: editInterval,
        }),
      })
      await loadAll()
      setEditRecipe(null)
      flash('Guardado')
    } catch { flash('Error al guardar', true) }
    setSaving(false)
  }

  const addStep = () => setEditSteps(s => [...s, { actionId: pieces.actions[0]?.id || '', config: {} }])
  const removeStep = (i: number) => setEditSteps(s => s.filter((_, j) => j !== i))
  const updateStep = (i: number, field: keyof typeof editSteps[0], val: string | Record<string, string>) =>
    setEditSteps(s => s.map((x, j) => j === i ? { ...x, [field]: val } : x))
  const updateStepCfg = (i: number, key: string, val: string) =>
    setEditSteps(s => s.map((x, j) => j === i ? { ...x, config: { ...x.config, [key]: val } } : x))

  const flash = (msg: string, isError = false) => {
    setActionMsg((isError ? '✗ ' : '✓ ') + msg)
    setTimeout(() => setActionMsg(''), 3000)
  }

  const fmtInterval = (min?: number) => {
    if (!min) return '—'
    if (min < 60) return `${min} min`
    if (min < 1440) return `${min / 60}h`
    return `${min / 1440}d`
  }

  const fmtDate = (ts: number) => new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const tabBtn = (key: typeof tab, label: string) => (
    <button onClick={() => setTab(key)}
      style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: tab === key ? 'var(--text-primary)' : 'transparent', color: tab === key ? 'var(--bg-base)' : 'var(--text-secondary)', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
      {label}
    </button>
  )

  const iconBtn: React.CSSProperties = { padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>Automatizaciones</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {tabBtn('recipes', 'Mis recetas')}
          {tabBtn('templates', 'Plantillas')}
          {tabBtn('logs', 'Historial')}
        </div>
        <div style={{ flex: 1 }} />
        {actionMsg && <span style={{ fontSize: '0.82rem', color: actionMsg.startsWith('✗') ? '#ef4444' : '#16a34a', fontWeight: 600 }}>{actionMsg}</span>}
        <button onClick={() => setShowCreate(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Nueva
        </button>
      </div>

      {/* Form nueva */}
      {showCreate && (
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createCustom()}
            placeholder="Nombre de la automatización"
            style={{ flex: 1, maxWidth: 360, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.87rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
          <button onClick={createCustom} disabled={creating || !newName.trim()}
            style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: newName.trim() ? 'var(--text-primary)' : 'var(--bg-elevated)', color: newName.trim() ? 'var(--bg-base)' : 'var(--text-tertiary)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {creating ? 'Creando...' : 'Crear'}
          </button>
          <button onClick={() => setShowCreate(false)} style={iconBtn}>Cancelar</button>
        </div>
      )}

      {/* Contenido */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {loading && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Cargando...</div>}

        {/* Tab: mis recetas */}
        {!loading && tab === 'recipes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 860 }}>
            {recipes.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Sin automatizaciones</div>
                <div style={{ fontSize: '0.82rem' }}>Usa una plantilla o crea una desde cero.</div>
              </div>
            )}
            {recipes.map(r => (
              <div key={r.id} style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{r.name}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Cada {fmtInterval(r.intervalMin)}
                    {r.lastRun && ` · Última: ${new Date(r.lastRun).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    {r.lastStatus && <span style={{ color: r.lastStatus === 'ok' ? '#16a34a' : '#ef4444', marginLeft: 5 }}>{r.lastStatus === 'ok' ? '✓' : '✗'}</span>}
                  </div>
                </div>
                <button onClick={() => toggle(r.id, !r.enabled)}
                  style={{ width: 40, height: 22, borderRadius: 11, border: 'none', background: r.enabled ? '#16a34a' : 'var(--bg-elevated)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 3, left: r.enabled ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </button>
                <span style={{ fontSize: '0.77rem', color: r.enabled ? '#16a34a' : 'var(--text-tertiary)', fontWeight: 600, flexShrink: 0 }}>{r.enabled ? 'Activa' : 'Inactiva'}</span>
                <button onClick={() => openEditor(r)} style={{ ...iconBtn, color: 'var(--accent-400)', borderColor: 'rgba(var(--accent-500-rgb,99,102,241),0.3)' }}>Editar</button>
                <button onClick={() => runNow(r.id)} disabled={running === r.id}
                  style={{ ...iconBtn, opacity: running === r.id ? 0.5 : 1 }}>
                  {running === r.id ? '...' : '▶ Ejecutar'}
                </button>
                <button onClick={() => deleteRecipe(r.id)} style={{ ...iconBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>Eliminar</button>
              </div>
            ))}
          </div>
        )}

        {/* Tab: plantillas */}
        {!loading && tab === 'templates' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14, maxWidth: 900 }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={{ padding: '18px 20px', borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 4 }}>{tpl.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tpl.description}</div>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
                  Frecuencia: {fmtInterval(tpl.intervalMin)} · {tpl.steps.length} paso{tpl.steps.length !== 1 ? 's' : ''}
                </div>
                <button onClick={() => createFromTemplate(tpl)} disabled={creating}
                  style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', marginTop: 'auto' }}>
                  Usar plantilla
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tab: logs */}
        {!loading && tab === 'logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 860 }}>
            {logs.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Sin ejecuciones registradas aún.</div>}
            {logs.map((log, i) => (
              <div key={i} style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: log.status === 'ok' ? '#16a34a' : '#ef4444', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{log.recipeName || log.recipeId}</div>
                  {log.output && <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{log.output}</div>}
                  {log.error && <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 2 }}>{log.error}</div>}
                </div>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>{fmtDate(log.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal editor de receta */}
      {editRecipe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)', padding: 20, overflowY: 'auto' }}
          onClick={() => setEditRecipe(null)}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 18, padding: 28, width: 540, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Editar receta</span>
              <button onClick={() => setEditRecipe(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 20 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Nombre */}
              <Field label="Nombre">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  style={fieldInput} />
              </Field>

              {/* Intervalo */}
              <Field label="Frecuencia de ejecución">
                <select value={editInterval} onChange={e => setEditInterval(Number(e.target.value))} style={fieldSelect}>
                  <option value={5}>Cada 5 minutos</option>
                  <option value={15}>Cada 15 minutos</option>
                  <option value={30}>Cada 30 minutos</option>
                  <option value={60}>Cada hora</option>
                  <option value={360}>Cada 6 horas</option>
                  <option value={720}>Cada 12 horas</option>
                  <option value={1440}>Cada día</option>
                </select>
              </Field>

              {/* Trigger */}
              <Field label="Disparador (trigger)">
                <select value={editTrigger} onChange={e => { setEditTrigger(e.target.value); setEditTriggerCfg({}) }} style={fieldSelect}>
                  {(pieces.triggers.length ? pieces.triggers : [{ id: 'manual', name: 'Manual' }, { id: 'schedule', name: 'Programado' }]).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>

              {/* Pasos / acciones */}
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>ACCIONES ({editSteps.length})</span>
                  <button onClick={addStep} style={{ fontSize: '0.74rem', padding: '3px 10px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>+ Añadir acción</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {editSteps.map((step, i) => {
                    const pieceDef = pieces.actions.find(a => a.id === step.actionId)
                    return (
                      <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)' }}>Paso {i + 1}</span>
                          <select value={step.actionId} onChange={e => updateStep(i, 'actionId', e.target.value)} style={{ ...fieldSelect, flex: 1 }}>
                            {(pieces.actions.length ? pieces.actions : []).map(a => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                          <button onClick={() => removeStep(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.82rem', padding: '2px 6px', borderRadius: 5 }}>✕</button>
                        </div>
                        {pieceDef && Object.entries(pieceDef.schema).map(([key, spec]) => (
                          <div key={key} style={{ marginBottom: 8 }}>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>{spec.label}{spec.required ? ' *' : ''}</label>
                            {spec.type === 'select' ? (
                              <select value={step.config[key] || ''} onChange={e => updateStepCfg(i, key, e.target.value)} style={fieldSelect}>
                                <option value="">— elegir —</option>
                                {(spec.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input value={step.config[key] || ''} onChange={e => updateStepCfg(i, key, e.target.value)}
                                placeholder={spec.placeholder || ''}
                                style={fieldInput} />
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {editSteps.length === 0 && (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem', border: '1px dashed var(--border-default)', borderRadius: 10 }}>
                      Sin acciones. Pulsa &quot;Añadir acción&quot; para empezar.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditRecipe(null)} style={{ padding: '9px 18px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>Cancelar</button>
              <button onClick={saveEditor} disabled={saving} style={{ padding: '9px 18px', borderRadius: 10, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                {saving ? 'Guardando...' : 'Guardar receta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  )
}

const fieldInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9, background: 'var(--bg-base)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box',
}
const fieldSelect: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9, background: 'var(--bg-base)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer', boxSizing: 'border-box',
}
