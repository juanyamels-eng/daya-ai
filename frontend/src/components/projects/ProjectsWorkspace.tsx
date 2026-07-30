'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store'

const API = process.env.NEXT_PUBLIC_API_URL || ''

type IssueState = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled'
type IssuePriority = 'urgent' | 'high' | 'medium' | 'low' | 'none'

interface Issue { id: string; title: string; description?: string; state: IssueState; priority: IssuePriority; labels: string[]; dueDate?: string; createdAt: number }
interface Project { id: string; name: string; description?: string; issues: Issue[]; cycles: any[]; createdAt: number }

const STATE_COLS: { key: IssueState; label: string; color: string }[] = [
  { key: 'backlog', label: 'Backlog', color: 'var(--text-tertiary)' },
  { key: 'todo', label: 'Por hacer', color: '#60a5fa' },
  { key: 'in_progress', label: 'En progreso', color: '#f59e0b' },
  { key: 'done', label: 'Hecho', color: '#16a34a' },
  { key: 'cancelled', label: 'Cancelado', color: '#ef4444' },
]

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  urgent: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#60a5fa', none: 'var(--text-tertiary)',
}

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja', none: 'Sin prioridad',
}

export default function ProjectsWorkspace() {
  const { token } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newIssueTitle, setNewIssueTitle] = useState('')
  const [newIssueState, setNewIssueState] = useState<IssueState>('todo')
  const [newIssuePriority, setNewIssuePriority] = useState<IssuePriority>('none')
  const [addingIssue, setAddingIssue] = useState(false)
  const [aiPanel, setAiPanel] = useState<'summary' | 'priorities' | 'blockers' | 'import' | null>(null)
  const [aiResult, setAiResult] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const [importText, setImportText] = useState('')
  const [loadingProject, setLoadingProject] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<IssueState | null>(null)
  const [filterPriority, setFilterPriority] = useState<IssuePriority | 'all'>('all')

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    setLoadError(false)
    try {
      const r = await fetch(`${API}/api/projects`, { headers })
      if (!r.ok) throw new Error('error')
      const d = await r.json()
      setProjects(d.projects || [])
    } catch {
      setLoadError(true)
    }
  }

  const loadProject = async (id: string) => {
    setLoadingProject(true)
    try {
      const r = await fetch(`${API}/api/projects/${id}`, { headers })
      const d = await r.json()
      setSelected(d.project)
    } catch {} finally { setLoadingProject(false) }
  }

  const createProject = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const r = await fetch(`${API}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }) })
      const d = await r.json()
      if (d.project) { setProjects(p => [d.project, ...p]); setSelected(d.project) }
      setShowNewProject(false); setNewName(''); setNewDesc('')
    } catch {} finally { setCreating(false) }
  }

  const deleteProject = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto?')) return
    await fetch(`${API}/api/projects/${id}`, { method: 'DELETE', headers }).catch(() => {})
    setProjects(p => p.filter(x => x.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const addIssue = async () => {
    if (!selected || !newIssueTitle.trim()) return
    setAddingIssue(true)
    try {
      const r = await fetch(`${API}/api/projects/${selected.id}/issues`, { method: 'POST', headers, body: JSON.stringify({ title: newIssueTitle.trim(), state: newIssueState, priority: newIssuePriority }) })
      const d = await r.json()
      if (d.issue) setSelected(s => s ? { ...s, issues: [...s.issues, d.issue] } : s)
      setNewIssueTitle(''); setNewIssueState('todo'); setNewIssuePriority('none')
    } catch {} finally { setAddingIssue(false) }
  }

  const updateIssue = async (issueId: string, patch: Partial<Issue>) => {
    if (!selected) return
    await fetch(`${API}/api/projects/${selected.id}/issues/${issueId}`, { method: 'PATCH', headers, body: JSON.stringify(patch) }).catch(() => {})
    setSelected(s => s ? { ...s, issues: s.issues.map(i => i.id === issueId ? { ...i, ...patch } : i) } : s)
  }

  const deleteIssue = async (issueId: string) => {
    if (!selected) return
    await fetch(`${API}/api/projects/${selected.id}/issues/${issueId}`, { method: 'DELETE', headers }).catch(() => {})
    setSelected(s => s ? { ...s, issues: s.issues.filter(i => i.id !== issueId) } : s)
  }

  const runAI = async (action: 'summary' | 'priorities' | 'blockers' | 'import') => {
    if (!selected) return
    setAiPanel(action); setAiResult(''); setAiLoading(true)
    try {
      if (action === 'import') { setAiLoading(false); return }
      const url = `${API}/api/projects/${selected.id}/${action === 'priorities' ? 'suggest-priorities' : action}`
      const r = await fetch(url, { headers })
      const d = await r.json()
      if (action === 'summary') setAiResult(d.summary || '')
      else if (action === 'priorities') setAiResult(Array.isArray(d.suggestions) ? d.suggestions.map((s: any) => `• ${s.title}: ${s.reason || ''}`).join('\n') : '')
      else if (action === 'blockers') setAiResult(Array.isArray(d.blockers) ? d.blockers.map((b: any) => `• ${b.title}${b.reason ? ': ' + b.reason : ''}`).join('\n') : (d.message || 'Sin bloqueos detectados'))
    } catch { setAiResult('Error al obtener resultado.') } finally { setAiLoading(false) }
  }

  const runImport = async () => {
    if (!selected || !importText.trim()) return
    setAiLoading(true)
    try {
      const r = await fetch(`${API}/api/projects/${selected.id}/import`, { method: 'POST', headers, body: JSON.stringify({ text: importText }) })
      const d = await r.json()
      setAiResult(`Importados ${d.imported || 0} issues.`)
      await loadProject(selected.id)
      setImportText('')
    } catch { setAiResult('Error al importar.') } finally { setAiLoading(false) }
  }

  const progress = selected ? Math.round((selected.issues.filter(i => i.state === 'done').length / Math.max(selected.issues.length, 1)) * 100) : 0

  const btn: React.CSSProperties = { padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Sidebar proyectos */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface)' }}>
        <div style={{ padding: '16px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-tertiary)', letterSpacing: '0.07em' }}>PROYECTOS</span>
          <button onClick={() => setShowNewProject(o => !o)} title="Nuevo proyecto"
            style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: showNewProject ? 'var(--bg-elevated)' : 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>

        {showNewProject && (
          <div style={{ padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createProject()}
              placeholder="Nombre del proyecto"
              style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
            <button onClick={createProject} disabled={creating || !newName.trim()}
              style={{ padding: '8px', borderRadius: 9, border: 'none', background: newName.trim() ? 'var(--text-primary)' : 'var(--bg-elevated)', color: newName.trim() ? 'var(--bg-base)' : 'var(--text-tertiary)', fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'not-allowed', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>
              {creating ? 'Creando...' : 'Crear'}
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 10px' }}>
          {loadError && (
            <div style={{ padding: '14px 10px', color: '#ef4444', fontSize: '0.8rem', textAlign: 'center', lineHeight: 1.5 }}>
              Error al cargar.
              <button onClick={loadProjects} style={{ display: 'block', margin: '6px auto 0', padding: '4px 12px', borderRadius: 7, border: '1px solid #ef444440', background: 'transparent', color: '#ef4444', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Reintentar</button>
            </div>
          )}
          {!loadError && projects.length === 0 && (
            <div style={{ padding: '16px 10px', color: 'var(--text-tertiary)', fontSize: '0.81rem', textAlign: 'center', lineHeight: 1.5 }}>
              Aún no tienes proyectos.<br />Crea el primero.
            </div>
          )}
          {projects.map(p => {
            const isActive = selected?.id === p.id
            const initial = p.name.charAt(0).toUpperCase()
            return (
              <div key={p.id}
                style={{ display: 'flex', alignItems: 'center', borderRadius: 10, marginBottom: 2, background: isActive ? 'var(--bg-elevated)' : 'transparent', borderLeft: isActive ? '2px solid var(--accent-500)' : '2px solid transparent', transition: 'all 0.13s' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <button onClick={() => loadProject(p.id)}
                  style={{ flex: 1, textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: isActive ? 'var(--text-primary)' : 'var(--bg-elevated)', color: isActive ? 'var(--bg-base)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0, transition: 'all 0.13s' }}>
                    {initial}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 1 }}>{p.description}</div>}
                  </div>
                </button>
                <button onClick={() => deleteProject(p.id)} title="Eliminar"
                  style={{ padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0, opacity: 0.4, transition: 'opacity 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            )
          })}
        </div>
        <style>{`
          @keyframes projectsFadeIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
          @keyframes spin { to { transform: rotate(360deg) } }
        `}</style>
      </div>

      {/* Panel principal */}
      {!selected ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40, animation: 'projectsFadeIn 0.3s ease' }}>
          {loadingProject ? (
            <span style={{ width: 20, height: 20, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Elige un proyecto</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--font-body)' }}>Selecciona uno del panel izquierdo o crea uno nuevo</p>
              </div>
              <button onClick={() => setShowNewProject(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 22px', borderRadius: 12, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', boxShadow: '0 2px 12px rgba(0,0,0,0.14)', transition: 'transform 0.13s, box-shadow 0.13s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.14)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Crear proyecto
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header proyecto */}
          <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{selected.name}</h1>
                {selected.description && <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>{selected.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as IssuePriority | 'all')}
                  style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  <option value="all">Todas las prioridades</option>
                  {(['urgent', 'high', 'medium', 'low', 'none'] as IssuePriority[]).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
                <button onClick={() => runAI('summary')} style={btn}>Resumen IA</button>
                <button onClick={() => runAI('priorities')} style={btn}>Prioridades</button>
                <button onClick={() => runAI('blockers')} style={btn}>Bloqueos</button>
                <button onClick={() => runAI('import')} style={btn}>Importar texto</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#16a34a', borderRadius: 3, transition: 'width 0.4s ease' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>{progress}% completado · {selected.issues.filter(i => i.state === 'done').length}/{selected.issues.length} issues</span>
            </div>
          </div>

          {/* Panel IA */}
          {aiPanel && (
            <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {aiPanel === 'summary' ? 'Resumen IA' : aiPanel === 'priorities' ? 'Prioridades sugeridas' : aiPanel === 'blockers' ? 'Bloqueos detectados' : 'Importar issues desde texto'}
                </span>
                <button onClick={() => { setAiPanel(null); setAiResult('') }} style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cerrar</button>
              </div>
              {aiPanel === 'import' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <textarea value={importText} onChange={e => setImportText(e.target.value)}
                    placeholder="Pega texto, requisitos, notas de reunión... Daya extraerá los issues automáticamente."
                    rows={3}
                    style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.84rem', resize: 'vertical', outline: 'none', fontFamily: 'var(--font-body)' }} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={runImport} disabled={aiLoading || !importText.trim()}
                      style={{ ...btn, background: importText.trim() ? 'var(--text-primary)' : undefined, color: importText.trim() ? 'var(--bg-base)' : undefined, border: 'none' }}>
                      {aiLoading ? 'Importando...' : 'Extraer e importar'}
                    </button>
                    {aiResult && <span style={{ fontSize: '0.82rem', color: '#16a34a' }}>{aiResult}</span>}
                  </div>
                </div>
              ) : aiLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Analizando proyecto...</span>
                </div>
              ) : (
                <pre style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>{aiResult}</pre>
              )}
            </div>
          )}

          {/* Añadir issue */}
          <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border-default)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newIssueTitle} onChange={e => setNewIssueTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addIssue()}
              placeholder="Nuevo issue..."
              style={{ flex: 1, minWidth: 160, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
            <select value={newIssueState} onChange={e => setNewIssueState(e.target.value as IssueState)}
              style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {STATE_COLS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={newIssuePriority} onChange={e => setNewIssuePriority(e.target.value as IssuePriority)}
              style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {(['urgent', 'high', 'medium', 'low', 'none'] as IssuePriority[]).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
            <button onClick={addIssue} disabled={addingIssue || !newIssueTitle.trim()}
              style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: newIssueTitle.trim() ? 'var(--text-primary)' : 'var(--bg-elevated)', color: newIssueTitle.trim() ? 'var(--bg-base)' : 'var(--text-tertiary)', fontSize: '0.85rem', fontWeight: 700, cursor: newIssueTitle.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)' }}>
              {addingIssue ? '...' : 'Añadir'}
            </button>
          </div>

          {/* Columnas kanban */}
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', gap: 0 }}>
            {STATE_COLS.map(col => {
              const issues = selected.issues.filter(i => i.state === col.key && (filterPriority === 'all' || i.priority === filterPriority))
              const isDropTarget = dragOverCol === col.key && draggingId !== null
              return (
                <div key={col.key}
                  onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null) }}
                  onDrop={() => { if (draggingId) updateIssue(draggingId, { state: col.key }); setDraggingId(null); setDragOverCol(null) }}
                  style={{ minWidth: 220, flex: 1, borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: isDropTarget ? 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)' : undefined, transition: 'background 0.15s' }}>
                  <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: `2px solid ${isDropTarget ? col.color : 'var(--border-default)'}`, background: 'var(--bg-surface)', position: 'sticky', top: 0, transition: 'border-color 0.15s' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{col.label}</span>
                    <span style={{ marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700, padding: '0 5px' }}>{issues.length}</span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
                    {issues.map(issue => (
                      <div key={issue.id}
                        draggable
                        onDragStart={e => { setDraggingId(issue.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                        style={{ padding: '11px 12px', borderRadius: 11, border: '1px solid var(--border-default)', borderLeft: `3px solid ${PRIORITY_COLORS[issue.priority]}`, background: 'var(--bg-surface)', marginBottom: 7, display: 'flex', flexDirection: 'column', gap: 7, boxShadow: 'none', transition: 'box-shadow 0.15s, transform 0.15s, opacity 0.15s', cursor: draggingId === issue.id ? 'grabbing' : 'grab', opacity: draggingId === issue.id ? 0.4 : 1 }}
                        onMouseEnter={e => { if (draggingId !== issue.id) { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.09)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.45 }}>{issue.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.69rem', fontWeight: 700, color: PRIORITY_COLORS[issue.priority], background: PRIORITY_COLORS[issue.priority] + '18', padding: '2px 7px', borderRadius: 5 }}>
                            {PRIORITY_LABELS[issue.priority]}
                          </span>
                          <select value={issue.state}
                            onChange={e => updateIssue(issue.id, { state: e.target.value as IssueState })}
                            style={{ marginLeft: 'auto', fontSize: '0.72rem', border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-base)', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px 6px', fontFamily: 'var(--font-body)' }}>
                            {STATE_COLS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                          <button onClick={() => deleteIssue(issue.id)} title="Eliminar issue"
                            style={{ padding: '2px 5px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0, transition: 'color 0.12s' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    {issues.length === 0 && <div style={{ padding: '20px 8px', fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center', opacity: 0.6 }}>Sin issues</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
