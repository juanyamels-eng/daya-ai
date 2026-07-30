'use client'
import { useState, useEffect } from 'react'
import { calendarAPI } from '../../lib/api'
import { useAuthStore } from '../../store'

const API = process.env.NEXT_PUBLIC_API_URL || ''
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// OJO: fecha LOCAL, no toISOString() (UTC). Con UTC, en husos como Perú (UTC-5) desde
// las ~7pm "hoy" caía en el día siguiente: el resaltado del calendario se corría un
// día y los eventos de la noche se agrupaban en la fecha equivocada.
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function sameDay(a: Date, b: Date) { return ymd(a) === ymd(b) }

export default function CalendarWorkspace() {
  const { token } = useAuthStore()
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState<Date>(today)
  const [events, setEvents] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editEvent, setEditEvent] = useState<any>(null)
  const [editForm, setEditForm] = useState({ title: '', time: '', notes: '' })

  const load = async () => {
    try {
      const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1).toISOString()
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0).toISOString()
      const { data } = await calendarAPI.listEvents(from, to)
      setEvents(data || [])
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [cursor])

  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))

  const eventsOn = (d: Date) => events.filter(e => sameDay(new Date(e.start), d))
  const selectedEvents = eventsOn(selected).sort((a, b) => +new Date(a.start) - +new Date(b.start))

  const addEvent = async () => {
    const t = title.trim()
    if (!t) return
    const start = new Date(selected)
    let allDay = true
    if (time) { const [h, m] = time.split(':').map(Number); start.setHours(h || 0, m || 0, 0, 0); allDay = false }
    setTitle(''); setTime(''); setNotes(''); setShowNotes(false)
    const { data } = await calendarAPI.createEvent({ title: t, notes: notes.trim(), start: start.toISOString(), allDay })
    setEvents(prev => [...prev, data])
  }

  const delEvent = async (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id))
    calendarAPI.deleteEvent(id).catch(() => {})
  }

  const openEdit = (ev: any) => {
    setEditEvent(ev)
    const d = new Date(ev.start)
    const timeStr = ev.allDay ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    setEditForm({ title: ev.title, time: timeStr, notes: ev.notes || '' })
  }

  const saveEdit = async () => {
    if (!editEvent || !editForm.title.trim()) return
    const start = new Date(editEvent.start)
    let allDay = !editForm.time
    if (editForm.time) {
      const [h, m] = editForm.time.split(':').map(Number)
      start.setHours(h || 0, m || 0, 0, 0)
    }
    const updated = { ...editEvent, title: editForm.title.trim(), notes: editForm.notes.trim(), allDay, start: start.toISOString() }
    setEvents(prev => prev.map(e => e.id === editEvent.id ? updated : e))
    await calendarAPI.updateEvent(editEvent.id, { title: updated.title, notes: updated.notes, start: updated.start, allDay: updated.allDay }).catch(() => {})
    setEditEvent(null)
  }

  const exportICS = async () => {
    try {
      const res = await fetch(`${API}/api/calendar/export.ics`, { headers: { Authorization: `Bearer ${token}` } })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'daya-calendario.ics'; a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  const move = (delta: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', animation: 'dayaRise 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>Calendario</h1>
        <button onClick={exportICS} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar .ics
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px', maxWidth: 980, width: '100%', margin: '0 auto', display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Calendario */}
        <div style={{ flex: '1 1 420px', minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => move(-1)} style={navBtn}>‹</button>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
            <button onClick={() => move(1)} style={navBtn}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', padding: '4px 0' }}>{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const isToday = sameDay(d, today)
              const isSel = sameDay(d, selected)
              const evs = eventsOn(d)
              return (
                <button key={i} onClick={() => setSelected(d)}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isToday ? 'var(--bg-elevated)' : 'var(--bg-surface)' }}
                  style={{ aspectRatio: '1', borderRadius: 12, border: `1.5px solid ${isSel ? 'var(--accent-500)' : isToday ? 'var(--accent-500)' : 'var(--border-default)'}`, background: isSel ? 'var(--accent-500)' : isToday ? 'var(--bg-elevated)' : 'var(--bg-surface)', color: isSel ? 'white' : isToday ? 'var(--accent-500)' : 'var(--text-primary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: '0.86rem', fontWeight: (isToday || isSel) ? 700 : 500, position: 'relative', transition: 'all 0.12s' }}>
                  {d.getDate()}
                  {evs.length > 0 && (
                    <span style={{ display: 'flex', gap: 2 }}>
                      {evs.slice(0, 3).map((_, k) => <span key={k} style={{ width: 4, height: 4, borderRadius: '50%', background: isSel ? 'white' : 'var(--accent-500)' }} />)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel del día seleccionado */}
        <div style={{ flex: '1 1 280px', minWidth: 260 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.04em', marginBottom: 10 }}>
            {selected.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
          </div>

          {/* Formulario nuevo evento */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && !showNotes && addEvent()}
                placeholder="Nuevo evento…" style={{ flex: 1, padding: '9px 12px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ width: 96, padding: '9px 8px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
              <button onClick={() => setShowNotes(s => !s)} title="Añadir descripción"
                style={{ width: 38, borderRadius: 10, background: showNotes ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${showNotes ? 'var(--border-strong)' : 'var(--border-default)'}`, color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button onClick={addEvent} disabled={!title.trim()} style={{ width: 38, borderRadius: 10, background: title.trim() ? 'var(--accent-500)' : 'var(--bg-elevated)', color: 'white', border: 'none', cursor: title.trim() ? 'pointer' : 'not-allowed', fontSize: '1.2rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
            {showNotes && (
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Descripción o notas (opcional)…" rows={2}
                style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none', fontFamily: 'var(--font-body)', resize: 'none' }} />
            )}
          </div>

          {loading ? <p style={{ color: 'var(--text-tertiary)', fontSize: '0.84rem' }}>Cargando…</p>
            : selectedEvents.length === 0 ? <p style={{ color: 'var(--text-tertiary)', fontSize: '0.84rem' }}>Sin eventos este día.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {selectedEvents.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                    <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: 'var(--accent-500)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>{e.title}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
                        {e.allDay ? 'Todo el día' : new Date(e.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {e.notes && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{e.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => openEdit(e)} title="Editar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 4 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                      </button>
                      <button onClick={() => delEvent(e.id)} title="Eliminar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 4 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* Modal editar evento */}
      {editEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={() => setEditEvent(null)}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Editar evento</span>
              <button onClick={() => setEditEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Título</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()}
                  style={{ width: '100%', padding: '10px 13px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Hora (vacío = todo el día)</label>
                <input type="time" value={editForm.time} onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))}
                  style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Descripción</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '10px 13px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none', fontFamily: 'var(--font-body)', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditEvent(null)} style={{ padding: '9px 18px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={!editForm.title.trim()} style={{ padding: '9px 18px', borderRadius: 10, background: 'var(--accent-500)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
}
