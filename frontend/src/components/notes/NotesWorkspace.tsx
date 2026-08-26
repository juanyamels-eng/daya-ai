'use client'
import { useState, useEffect } from 'react'
import { notesAPI } from '../../lib/api'
import { useTabSync, publish } from '../../hooks/useTabSync'

const COLORS: Record<string, string> = {
  default: 'var(--bg-surface)', amber: '#fef3c7', green: '#dcfce7', blue: '#dbeafe', rose: '#ffe4e6',
}

interface Note { id: string; content?: string; title?: string; color?: string }

interface Task { id: string; title: string; done?: boolean }

export default function NotesWorkspace() {
  const [tab, setTab] = useState<'notes' | 'tasks'>('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [newNote, setNewNote] = useState('')
  const [newTask, setNewTask] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')

  const load = async () => {
    try {
      const [n, t] = await Promise.all([notesAPI.listNotes(), notesAPI.listTasks()])
      setNotes(n.data || []); setTasks(t.data || [])
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => {
    load()
  }, [])

  // Otra pestaña tocó notas o tareas: recargamos del servidor, que es quien manda.
  // Gana quien escribió último porque lo que recargamos es el estado ya guardado.
  useTabSync((ev) => { if (ev.type === 'notes' || ev.type === 'tasks') load() })

  // Notas
  const addNote = async () => {
    const content = newNote.trim()
    if (!content) return
    setNewNote('')
    const { data } = await notesAPI.createNote({ content })
    setNotes(prev => [data, ...prev])
    publish({ type: 'notes' })
  }
  const cycleColor = async (note: Note) => {
    const keys = Object.keys(COLORS)
    const next = keys[(keys.indexOf(note.color || 'default') + 1) % keys.length]
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, color: next } : n))
    notesAPI.updateNote(note.id, { color: next }).then(() => publish({ type: 'notes' })).catch(() => {})
  }
  const delNote = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    notesAPI.deleteNote(id).then(() => publish({ type: 'notes' })).catch(() => {})
  }
  const openEditNote = (note: Note) => { setEditNote(note); setEditContent(note.content || note.title || '') }
  const saveEditNote = async () => {
    if (!editNote) return
    const content = editContent.trim()
    setNotes(prev => prev.map(n => n.id === editNote.id ? { ...n, content, title: content } : n))
    notesAPI.updateNote(editNote.id, { content }).then(() => publish({ type: 'notes' })).catch(() => {})
    setEditNote(null)
  }

  // Tareas
  const addTask = async () => {
    const title = newTask.trim()
    if (!title) return
    setNewTask('')
    const { data } = await notesAPI.createTask({ title })
    setTasks(prev => [data, ...prev])
    publish({ type: 'tasks' })
  }
  const toggleTask = async (task: Task) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !t.done } : t))
    notesAPI.updateTask(task.id, { done: !task.done }).then(() => publish({ type: 'tasks' })).catch(() => {})
  }
  const delTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    notesAPI.deleteTask(id).then(() => publish({ type: 'tasks' })).catch(() => {})
  }
  const openEditTask = (task: Task) => { setEditTask(task); setEditTaskTitle(task.title) }
  const saveEditTask = async () => {
    if (!editTask) return
    const title = editTaskTitle.trim()
    if (!title) return
    setTasks(prev => prev.map(t => t.id === editTask.id ? { ...t, title } : t))
    notesAPI.updateTask(editTask.id, { title }).then(() => publish({ type: 'tasks' })).catch(() => {})
    setEditTask(null)
  }

  const q = search.toLowerCase()
  const filteredNotes = notes.filter(n => !q || (n.content || n.title || '').toLowerCase().includes(q))
  const filteredTasks = tasks.filter(t => !q || t.title.toLowerCase().includes(q))

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', animation: 'dayaRise 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>Notas y tareas</h1>

        {/* Buscador */}
        <div style={{ marginTop: 12, position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar notas y tareas…"
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2, display: 'flex' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 12, borderBottom: '1px solid var(--border-default)' }}>
          {(['notes', 'tasks'] as const).map(k => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--accent-500)' : 'transparent'}`, color: tab === k ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, fontFamily: 'var(--font-body)', marginBottom: -1 }}>
              {k === 'notes' ? `Notas (${filteredNotes.length})` : `Tareas (${filteredTasks.filter(t => !t.done).length})`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 880, width: '100%', margin: '0 auto' }}>
        {loading ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>Cargando…</p>
        ) : tab === 'notes' ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder="Escribe una nota rápida y pulsa Enter…"
                style={inputStyle} />
              <button onClick={addNote} disabled={!newNote.trim()} style={addBtn(!!newNote.trim())}>Añadir</button>
            </div>
            {filteredNotes.length === 0 ? (
              <Empty text={search ? 'Sin resultados' : 'Sin notas todavía'} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {filteredNotes.map(n => (
                  <div key={n.id} style={{ position: 'relative', padding: '14px 14px 36px', borderRadius: 12, background: COLORS[n.color || 'default'] || COLORS.default, border: '1px solid var(--border-default)', minHeight: 90, whiteSpace: 'pre-wrap', fontSize: '0.86rem', color: n.color === 'default' ? 'var(--text-primary)' : '#1c1c1f', lineHeight: 1.5, cursor: 'pointer' }}
                    onClick={() => openEditNote(n)}>
                    {n.content || n.title}
                    <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => cycleColor(n)} title="Cambiar color" style={miniBtn}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2a10 10 0 0 0 0 20c1.5 0 2-1 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.5 1.5-1.5H17a5 5 0 0 0 5-5c0-4.4-4.5-8-10-8z"/></svg>
                      </button>
                      <button onClick={() => delNote(n.id)} title="Eliminar" style={miniBtn}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="Nueva tarea y pulsa Enter…" style={inputStyle} />
              <button onClick={addTask} disabled={!newTask.trim()} style={addBtn(!!newTask.trim())}>Añadir</button>
            </div>
            {filteredTasks.length === 0 ? (
              <Empty text={search ? 'Sin resultados' : 'Sin tareas todavía'} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredTasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', opacity: t.done ? 0.55 : 1 }}>
                    <button onClick={() => toggleTask(t)} style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${t.done ? 'var(--accent-500)' : 'var(--border-strong)'}`, background: t.done ? 'var(--accent-500)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      {t.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                    </button>
                    <span onClick={() => openEditTask(t)} style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text-primary)', textDecoration: t.done ? 'line-through' : 'none', cursor: 'pointer' }}>{t.title}</span>
                    <button onClick={() => delTask(t.id)} style={{ ...miniBtn, color: 'var(--text-tertiary)' }} title="Eliminar">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal editar nota */}
      {editNote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={() => setEditNote(null)}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, width: 460, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Editar nota</span>
              <button onClick={() => setEditNote(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18 }}>×</button>
            </div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              autoFocus rows={6}
              style={{ width: '100%', padding: '11px 13px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditNote(null)} style={{ padding: '8px 16px', borderRadius: 9, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>Cancelar</button>
              <button onClick={saveEditNote} style={{ padding: '8px 16px', borderRadius: 9, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar tarea */}
      {editTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={() => setEditTask(null)}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Editar tarea</span>
              <button onClick={() => setEditTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18 }}>×</button>
            </div>
            <input value={editTaskTitle} onChange={e => setEditTaskTitle(e.target.value)}
              autoFocus onKeyDown={e => e.key === 'Enter' && saveEditTask()}
              style={{ width: '100%', padding: '11px 13px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditTask(null)} style={{ padding: '8px 16px', borderRadius: 9, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>Cancelar</button>
              <button onClick={saveEditTask} style={{ padding: '8px 16px', borderRadius: 9, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>{text}</div>
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '11px 14px', borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-body)',
}
const addBtn = (active: boolean): React.CSSProperties => ({
  padding: '0 18px', borderRadius: 11, background: active ? 'var(--accent-500)' : 'var(--bg-elevated)', color: active ? 'white' : 'var(--text-tertiary)',
  border: 'none', cursor: active ? 'pointer' : 'not-allowed', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)',
})
const miniBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.45)', display: 'flex', padding: 3, borderRadius: 5,
}
