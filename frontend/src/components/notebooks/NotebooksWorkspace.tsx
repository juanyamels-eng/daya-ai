'use client'
// ============================================
// Cuadernos — investigación anclada a fuentes (estilo NotebookLM, 100% Daya).
// Tres zonas: lista de cuadernos · fuentes + estudio · chat con citas [n].
// El chat responde SOLO con el material de las fuentes; las transformaciones
// (resumen denso, ideas clave, guía de estudio, FAQ) llegan como mensajes.
//
// ── Sobre el aspecto ────────────────────────────────────────────────────────
// Esta pantalla nació pintada con --accent-500 creyendo que era el color de
// marca. NO lo es: --accent-500 es GRIS (#5f6368). El violeta es --brand
// (#6d5cff). Por eso todo lo que debía cantar —los números de cita, el botón de
// enviar, la burbuja del usuario— salía del mismo gris que el resto y la
// pantalla se veía apagada.
//
// Ahora manda el lenguaje de la casa, el mismo del chat:
//  · Píldora para lo que es acción, radio 12 para superficies, --border-strong
//    como filo (con el borde por defecto los paneles se funden con el lienzo).
//  · Rótulos de sección en versalita monoespaciada con tracking 0.12em.
//  · --brand SOLO donde marca algo activo o una cita. No repinta cada botón.
//  · Burbuja del usuario y botón de enviar calcados de MessageBubble/ChatWindow,
//    para que Cuadernos no parezca otro producto.
// ============================================
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { notebooksAPI } from '../../lib/api'
import { useAuthStore } from '../../store'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

interface Notebook { id: string; title: string; updatedAt: string; sourceCount?: number }
interface Source { id: string; type: 'document' | 'url' | 'text' | 'audio'; title: string; docId?: string | null; createdAt: string }
interface Msg { role: 'user' | 'assistant'; content: string; label?: string; audio?: string; transcript?: string }

// Cada cuaderno estrena color de portada, como en NotebookLM. Sale del id (no se
// guarda nada): el mismo cuaderno luce siempre igual, y una lista de diez deja
// de ser diez filas de texto idéntico. Tonos apagados a propósito — tienen que
// convivir con el negro #131314 sin gritar.
// Seis tonos que se distinguen ENTRE SÍ sobre negro. La paleta anterior tenía
// dos cálidos (#c2703d y #b8893a) que, tintados sobre #1e1e1f, caían los dos en
// el mismo marrón sucio: dos colores distintos que se leían igual no sirven para
// reconocer un cuaderno de un vistazo, que es lo único que hacen aquí.
const COVERS = ['#6d5cff', '#4a86c8', '#2fa39b', '#4a9d5f', '#c9913f', '#cf5f6e']
// Emoji de portada, como en Gemini Notebook. Un icono concreto se reconoce de
// lejos mucho antes que una inicial: en una rejilla de doce, "C" y "C" son la
// misma mancha, 🌍 y 📊 no. Sale del id igual que el color (nada que guardar), y
// con un desplazamiento distinto para que color y emoji no vayan siempre juntos.
const GLYPHS = ['📘', '📊', '🔬', '🗂️', '🌍', '💡', '🧭', '📐', '🎓', '⚗️', '📰', '🧩',
  '🛠️', '🎯', '🧪', '📎', '🗺️', '🔭', '🪐', '🧬', '⚖️', '🏛️', '🎬', '🌱']
// Dos hashes con semilla y multiplicador distintos, no uno solo desplazado. Con
// `hash >>> 3` los bits altos apenas cambian entre ids parecidos y salían emoji
// repetidos: de cinco cuadernos, dos con 💡 y dos con 🌍.
const hashOf = (id: string, seed: number, mult: number) => {
  let h = seed
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), mult) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}
const coverOf = (id: string) => COVERS[hashOf(id, 0x811c9dc5, 16777619) % COVERS.length]
const glyphOf = (id: string) => GLYPHS[hashOf(id, 0x9e3779b9, 2246822519) % GLYPHS.length]

// Traduce el fallo a algo accionable. Los dos que importan y antes no se veían:
// 401 (la sesión ya no vale — te quedas mirando una app que no puede guardar
// nada) y 429 (el límite de peticiones, que se pasa solo esperando).
const errMsg = (e: any, fallback: string) => {
  const s = e?.response?.status
  if (s === 401 || s === 403) return 'Tu sesión ha caducado. Vuelve a entrar para seguir.'
  if (s === 429) return 'Demasiadas peticiones seguidas. Espera un momento y reinténtalo.'
  return e?.response?.data?.error || fallback
}

// La cita [n] de la maqueta de portada: en violeta y en versalita, el mismo hilo
// que une respuesta y fuente dentro de un cuaderno de verdad.
const Cite = ({ n }: { n: number }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 15, height: 15, padding: '0 3px', margin: '0 1px', borderRadius: 5, background: 'color-mix(in srgb, var(--brand) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 36%, transparent)', color: 'var(--brand)', fontSize: '0.56rem', fontWeight: 700, verticalAlign: 'text-top' }}>{n}</span>
)

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso)
    const days = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (days <= 0) return 'hoy'
    if (days === 1) return 'ayer'
    if (days < 7) return `hace ${days} días`
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

export default function NotebooksWorkspace() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [active, setActive] = useState<Notebook | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [transforming, setTransforming] = useState('')
  const [addMode, setAddMode] = useState<'' | 'document' | 'url' | 'text'>('')
  const [savedNoteIdx, setSavedNoteIdx] = useState<number | null>(null)
  const [reporting, setReporting] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [libDocs, setLibDocs] = useState<any[]>([])
  const [urlValue, setUrlValue] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [textValue, setTextValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadList() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  // Los fallos de estas dos SE CUENTAN. Antes las dos llevaban `catch {}` vacío y
  // el resultado era una pantalla que mentía: si el servidor rechazaba la sesión,
  // la lista se veía igual que la de alguien sin cuadernos, y "Nuevo cuaderno" se
  // pulsaba sin que pasara nada ni se dijera nada. Callar un error de red no lo
  // hace desaparecer, solo deja al usuario dándole al botón.
  const loadList = async () => {
    try { setNotebooks((await notebooksAPI.list()).data || []); setError('') }
    catch (e: any) { setError(errMsg(e, 'No se pudieron cargar tus cuadernos.')) }
  }

  const openNotebook = async (nb: Notebook) => {
    setActive(nb); setMsgs([]); setError(''); setAddMode('')
    try {
      const r = await notebooksAPI.get(nb.id)
      setSources(r.data.sources || [])
    } catch { setSources([]) }
  }

  const createNotebook = async () => {
    setError('')
    try {
      const r = await notebooksAPI.create()
      await loadList()
      openNotebook(r.data)
    } catch (e: any) { setError(errMsg(e, 'No se pudo crear el cuaderno.')) }
  }

  const deleteNotebook = async (nb: Notebook, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar el cuaderno "${nb.title}"?`)) return
    try {
      await notebooksAPI.remove(nb.id)
      if (active?.id === nb.id) { setActive(null); setSources([]); setMsgs([]) }
      loadList()
    } catch {}
  }

  const commitTitle = async () => {
    setEditingTitle(false)
    const t = titleDraft.trim()
    if (!active || !t || t === active.title) return
    try {
      await notebooksAPI.rename(active.id, t)
      setActive({ ...active, title: t })
      loadList()
    } catch {}
  }

  const startAdd = async (mode: 'document' | 'url' | 'text') => {
    setAddMode(mode); setError('')
    if (mode === 'document') {
      try {
        const r = await notebooksAPI.library()
        const docs = Array.isArray(r.data) ? r.data : (r.data?.documents || [])
        setLibDocs(docs)
      } catch { setLibDocs([]) }
    }
  }

  const addSource = async (data: any) => {
    if (!active) return
    setAdding(true); setError('')
    try {
      const r = await notebooksAPI.addSource(active.id, data)
      setSources(s => [...s, r.data])
      setAddMode(''); setUrlValue(''); setTextTitle(''); setTextValue('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'No se pudo añadir la fuente.')
    } finally { setAdding(false) }
  }

  // Fuente de audio: se sube, se transcribe con Whisper y entra indexada.
  const onAudioPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !active) return
    setAdding(true); setError('')
    try {
      const { notebooksAPI: nbAPI } = await import('../../lib/api')
      const r = await nbAPI.addAudioSource(active.id, file)
      setSources(s => [...s, r.data])
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo transcribir el audio.')
    } finally { setAdding(false) }
  }

  // Informe PDF: se redacta con todo el material, se guarda en Biblioteca y se descarga.
  const runReport = async () => {
    if (!active || reporting) return
    setReporting(true); setError('')
    try {
      const r = await notebooksAPI.report(active.id)
      setMsgs(m => [...m, { role: 'assistant', content: `El informe **${r.data.title}** quedó guardado en tu Biblioteca y la descarga ya comenzó.`, label: 'Informe PDF' }])
      window.open(`${API_URL}/api/documents/download/${r.data.docId}`, '_blank', 'noopener')
    } catch (e: any) {
      setError(e.response?.data?.error || 'No se pudo generar el informe.')
    } finally { setReporting(false) }
  }

  // Guarda una respuesta o transformación como nota en Notas y tareas.
  const saveToNotes = async (m: Msg, idx: number) => {
    try {
      const { notesAPI } = await import('../../lib/api')
      await notesAPI.createNote({ title: m.label || `Cuaderno: ${active?.title || ''}`, content: m.content })
      setSavedNoteIdx(idx)
      setTimeout(() => setSavedNoteIdx(null), 2500)
    } catch { setError('No se pudo guardar la nota.') }
  }

  const removeSource = async (sid: string) => {
    if (!active) return
    try {
      await notebooksAPI.removeSource(active.id, sid)
      setSources(s => s.filter(x => x.id !== sid))
    } catch {}
  }

  const send = async () => {
    const q = input.trim()
    if (!q || !active || busy) return
    setInput(''); setError('')
    setMsgs(m => [...m, { role: 'user', content: q }])
    setBusy(true)
    try {
      const history = msgs.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const r = await notebooksAPI.chat(active.id, q, history)
      setMsgs(m => [...m, { role: 'assistant', content: r.data.answer }])
    } catch (e: any) {
      setError(e.response?.data?.error || 'No se pudo responder. Intenta de nuevo.')
    } finally { setBusy(false) }
  }

  // Resumen en audio (SSE): el backend reporta el avance y al final llega el MP3.
  const [audioStatus, setAudioStatus] = useState('')
  const runAudio = async () => {
    if (!active || audioStatus) return
    setAudioStatus('Preparando…'); setError('')
    try {
      const token = useAuthStore.getState().token
      const res = await fetch(`${API_URL}/api/notebooks/${active.id}/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: '{}',
      })
      const ctype = res.headers.get('content-type') || ''
      if (!res.ok || !ctype.includes('text/event-stream')) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'No se pudo generar el audio.')
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx); buf = buf.slice(idx + 2)
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data: ')) continue
            let ev: any
            try { ev = JSON.parse(line.slice(6)) } catch { continue }
            if (ev.status) setAudioStatus(ev.status)
            if (ev.error) throw new Error(ev.error)
            if (ev.done && ev.audio) {
              setMsgs(m => [...m, { role: 'assistant', content: '', label: ev.title || 'Resumen en audio', audio: `data:${ev.mime || 'audio/mpeg'};base64,${ev.audio}`, transcript: ev.transcript }])
            }
          }
        }
      }
    } catch (e: any) {
      setError(e.message || 'No se pudo generar el audio.')
    } finally { setAudioStatus('') }
  }

  const runTransform = async (kind: 'resumen' | 'ideas' | 'guia' | 'faq', label: string) => {
    if (!active || transforming) return
    setTransforming(kind); setError('')
    try {
      const r = await notebooksAPI.transform(active.id, kind)
      setMsgs(m => [...m, { role: 'assistant', content: r.data.content, label: r.data.title }])
    } catch (e: any) {
      setError(e.response?.data?.error || `No se pudo generar: ${label}.`)
    } finally { setTransforming('') }
  }

  const srcIcon = (type: string) => type === 'document'
    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    : type === 'url'
      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3.5" y1="12" x2="20.5" y2="12"/></svg>
      : type === 'audio'
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/></svg>

  // Rótulo técnico de sección: versalita monoespaciada, tracking 0.12em. Es la
  // misma voz con la que la landing y el resto de la app etiquetan las cosas.
  const kicker: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase' }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 13px', borderRadius: 12, background: 'var(--bg-base)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }
  // Acción = píldora. Filo fuerte, fondo transparente: se enciende al pasar.
  const pill: React.CSSProperties = { padding: '6px 13px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.74rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s, border-color 0.15s' }
  const pillHover = (on: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return
    e.currentTarget.style.background = on ? 'var(--bg-elevated)' : 'transparent'
    e.currentTarget.style.color = on ? 'var(--text-primary)' : 'var(--text-secondary)'
  }

  return (
    // ── Paneles flotantes, no columnas divididas ────────────────────────────
    // ── El lenguaje de la landing ────────────────────────────────────────────
    // Esto pasó por dos intentos fallidos: primero columnas separadas por filos
    // (una reja, y una reja siempre se ve), después paneles-caja en --bg-surface
    // sobre el lienzo. El segundo quitó las líneas, pero metía un escalón de tono
    // que la portada no tiene en ninguna parte.
    //
    // La landing no usa paneles: pone las TARJETAS (#1e1e1f, radio 16, sin filo,
    // hover a #282a2c) directamente sobre el lienzo #131314. El aire hace la
    // jerarquía. Eso es lo que se copia aquí — las zonas son transparentes y lo
    // único con superficie propia es el contenido.
    <div style={{ flex: 1, display: 'flex', minWidth: 0, gap: 20, padding: '0 24px 20px', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {!active ? (
        // LA GALERÍA, a pantalla completa. Aquí había además una columna
        // estrecha con la lista de cuadernos, y sobraba: repetía en 264px de
        // ancho y en texto lo mismo que la galería enseña en grande y con color.
        // Dos sitios para lo mismo, y el estrecho siempre peor. Ahora hay UN
        // sitio donde están tus cuadernos, y al abrir uno la galería cede el
        // espacio entero a las fuentes y al chat.
        <div className="nb-scroll" style={{ flex: 1, minWidth: 0, position: 'relative', overflowY: 'auto' }}>
          {/* La aurora de la landing, misma receta: dos manchas violeta a 0.06 de
              alfa muy desenfocadas. A esa opacidad no se lee como color, se lee
              como profundidad — es lo que separa un panel plano de algo con luz
              propia. Se congela con prefers-reduced-motion. */}
          <div className={`nb-aurora${notebooks.length === 0 ? ' nb-aurora--hero' : ''}`} aria-hidden="true" />

          {notebooks.length === 0 ? (
            <div style={{ position: 'relative', zIndex: 1, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 34px' }}>
              {/* En ancho, la maqueta va AL LADO del texto, no debajo. Apilado
                  medía ~590px de alto: en una ventana normal el botón de crear
                  quedaba cortado por abajo, que es el peor sitio para esconder la
                  única acción de la pantalla. En dos columnas cabe entero y de
                  paso se lee como una portada, no como una lista vertical.
                  Por debajo de 980px vuelve a apilarse y a centrarse. */}
              <div className="nb-hero" style={{ animation: 'dayaRise 0.45s cubic-bezier(0.16,1,0.3,1) both' }}>
               <div className="nb-hero-text">
                {/* Sin caja ni filo: el icono flota sobre su propio resplandor.
                    Una cajita con borde alrededor de un icono es justo el detalle
                    que delata una interfaz hecha a mano. */}
                <div className="nb-hero-ico" style={{ display: 'flex', marginBottom: 18 }}>
                  <span style={{ position: 'relative', width: 52, height: 52, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)', background: 'radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--brand) 26%, transparent), color-mix(in srgb, var(--brand) 8%, transparent))', boxShadow: '0 0 46px color-mix(in srgb, var(--brand) 26%, transparent)' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/></svg>
                  </span>
                </div>
                {/* Titular grande de verdad y en dos pesos: el nombre en blanco y
                    la promesa en violeta. Un solo bloque gris no es un titular,
                    es un párrafo en negrita. */}
                {/* La escala de `.lx-h1`: clamp fluido, -0.05em y #f8f9fa (más
                    blanco que --text-primary; en la portada los titulares
                    levantan un punto sobre el texto corrido).

                    El realce iba en degradado VIOLETA, y me lo había inventado:
                    en la landing `--lx-grad` es #ffffff, blanco puro. El violeta
                    de marca está reservado para la aurora y para lo que marca
                    algo —una cita, lo activo—, no para pintar titulares. */}
                <h2 style={{ fontSize: 'clamp(1.9rem, 3.2vw, 2.7rem)', fontWeight: 600, color: '#f8f9fa', margin: '0 0 18px', letterSpacing: '-0.05em', lineHeight: 1.08, textWrap: 'balance' } as React.CSSProperties}>
                  Pregunta a tus propias fuentes
                </h2>
                {/* 52ch, no 40: a 40 la frase caía en tres líneas y dejaba
                    "dato." solo en la última — una viuda justo debajo del
                    titular, que es donde más canta. */}
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.72, margin: '0 0 30px', maxWidth: '46ch' }}>
                  La IA responde solo con el material que tú le des, y cita de dónde salió cada dato.
                </p>
                <div className="nb-hero-cta" style={{ display: 'flex' }}>
                  <button onClick={createNotebook}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 999, border: 'none', background: '#f1f3f4', color: '#131314', fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.025em', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'filter 0.15s, transform 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Crear mi primer cuaderno
                  </button>
                </div>
                {/* El error vive AQUÍ además de en el chat: este es el único sitio
                    donde se pulsa "crear", y era justo donde no había dónde
                    enseñarlo. */}
                {error && (
                  <p style={{ marginTop: 18, padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--red) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 28%, transparent)', color: 'var(--red)', fontSize: '0.78rem', lineHeight: 1.55 }}>{error}</p>
                )}
               </div>
                {/* Antes aquí había una lista de tres pasos. Explicaba el
                    proceso, pero pedía LEER para entender qué hace esto — y lo
                    que hace se ve mejor que se cuenta. Ahora se enseña el momento
                    exacto que distingue a Cuadernos de un chat normal: una
                    respuesta con sus citas [n] colgando de fuentes reales.

                    Es una maqueta, no datos: `aria-hidden` para que un lector de
                    pantalla no lo lea como si fuera una respuesta de verdad. */}
               <div className="nb-hero-demo">
                <div aria-hidden="true" style={{ marginBottom: 24, borderRadius: 16, background: 'var(--bg-surface)', boxShadow: 'none', overflow: 'hidden', animation: 'dayaRise 0.55s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
                  <div style={{ padding: '19px 20px 17px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 15 }}>
                      <span style={{ padding: '8px 15px', borderRadius: '16px 16px 5px 16px', background: 'var(--bg-overlay)', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                        ¿Cuánto cayó el coste desde 2020?
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                      Un 62 % entre 2020 y 2025 <Cite n={1} />, sobre todo por el precio del panel <Cite n={2} />. El informe no da cifras posteriores a 2025.
                    </p>
                  </div>
                  {/* Las dos fuentes de las que cuelgan esas citas: el hilo
                      completo, que es justo la promesa de la pantalla. */}
                  <div style={{ display: 'flex', gap: 7, padding: '13px 20px 16px', background: 'color-mix(in srgb, var(--bg-base) 55%, transparent)', flexWrap: 'wrap' }}>
                    {[[1, 'informe-solar-2025.pdf'], [2, 'iea.org/renewables']].map(([n, t]) => (
                      <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px 6px 7px', borderRadius: 999, background: 'var(--bg-overlay)', fontSize: '0.67rem', color: 'var(--text-secondary)', maxWidth: '100%' }}>
                        <span style={{ flexShrink: 0, width: 17, height: 17, borderRadius: 6, background: 'color-mix(in srgb, var(--brand) 20%, transparent)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.57rem', fontWeight: 700 }}>{n}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
                      </span>
                    ))}
                  </div>
                </div>
               </div>
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '30px 34px 44px' }}>
              {/* Cabecera de la galería, como la de Gemini Notebook: el nombre a
                  la izquierda y la acción sólida a la derecha. Antes "crear" solo
                  vivía dentro de la rejilla, y con la lista llena había que
                  buscarla al final de todo. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#f8f9fa', margin: 0, letterSpacing: '-0.05em' }}>Tus cuadernos</h2>
                <span style={{ ...kicker, paddingTop: 4 }}>{notebooks.length}</span>
                <button onClick={createNotebook}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 999, border: 'none', background: '#f1f3f4', color: '#131314', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '-0.025em', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'filter 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.08)'}
                  onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Crear nuevo
                </button>
              </div>

              {error && (
                <p style={{ margin: '0 0 18px', padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--red) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 28%, transparent)', color: 'var(--red)', fontSize: '0.78rem', lineHeight: 1.55 }}>{error}</p>
              )}

              <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(226px, 1fr))', gap: 16 }}>
                {/* "Crear" va PRIMERO, como en la referencia: el hueco por llenar
                    se ofrece antes de la lista, no escondido detrás de ella. */}
                <button onClick={createNotebook} className="nb-newcard"
                  style={{ minHeight: 186, borderRadius: 16, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: 'var(--font-body)', fontSize: '0.84rem', fontWeight: 500, letterSpacing: '-0.025em', transition: 'color 0.15s, background 0.15s, border-color 0.15s' }}>
                  <span style={{ width: 46, height: 46, borderRadius: 999, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </span>
                  Crear cuaderno nuevo
                </button>

                {notebooks.map(nb => {
                  const c = coverOf(nb.id)
                  return (
                    // La tarjeta ES el color, entera — no una franja de degradado
                    // con el cuerpo gris debajo. Ese bloque macizo es lo que hace
                    // que la rejilla se recorra de un vistazo, y era la diferencia
                    // de fondo con la referencia.
                    //
                    // El tinte va al 22% sobre --bg-surface, no plano como en
                    // Gemini Notebook: allí el lienzo es blanco y admite pasteles
                    // saturados; aquí, sobre #131314, ese mismo pastel sería una
                    // linterna y el título blanco encima dejaría de leerse.
                    <div key={nb.id} onClick={() => openNotebook(nb)} className="daya-lift nb-card"
                      style={{ position: 'relative', minHeight: 186, borderRadius: 16, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', padding: '18px 18px 16px', background: `color-mix(in srgb, ${c} 26%, var(--bg-surface))` }}>
                      <span aria-hidden="true" style={{ fontSize: '1.9rem', lineHeight: 1, marginBottom: 'auto' }}>{glyphOf(nb.id)}</span>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f8f9fa', letterSpacing: '-0.035em', lineHeight: 1.32, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 16 }}>{nb.title}</div>
                      {/* Fecha antes que fuentes, como en la referencia: lo que
                          distingue dos cuadernos parecidos es cuándo los tocaste. */}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 9 }}>
                        {nb.updatedAt ? `${fmtDate(nb.updatedAt)} · ` : ''}{nb.sourceCount ?? 0} fuente{(nb.sourceCount ?? 0) === 1 ? '' : 's'}
                      </div>
                      <button onClick={e => deleteNotebook(nb, e)} title="Eliminar cuaderno" className="nb-del"
                        style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: 999, border: 'none', background: 'color-mix(in srgb, var(--bg-base) 55%, transparent)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s, opacity 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Columna 2: fuentes + estudio ── */}
          {/* Las transformaciones vivían apretadas en la cabecera del chat: seis
              botones que se partían en dos filas y empujaban el título. Bajan
              aquí, al pie de las fuentes, como el panel Estudio de NotebookLM:
              son cosas que se HACEN con el material, y su sitio es junto a él. */}
          {/* 340 y no 296: al quitar la columna de cuadernos sobran 264px, y este
              panel era el que los necesitaba. A 296 las fichas de Estudio se
              partían en "Resumen den…" y "Guía de est…", que es pedirle al
              usuario que adivine qué hace un botón. */}
          <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '13px 16px 14px', flexShrink: 0 }}>
              {/* La VUELTA a la galería. Al quitar la columna de cuadernos, este
                  era el camino que se quedaba sin puerta: sin él, abrir un
                  cuaderno era entrar en un callejón. Va lo primero y arriba del
                  todo, que es donde se busca volver. */}
              <button onClick={() => { setActive(null); setSources([]); setMsgs([]); setAddMode(''); setError('') }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 13, padding: '5px 12px 5px 8px', borderRadius: 999, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500, letterSpacing: '-0.01em', transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-overlay)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                Cuadernos
              </button>
              <div style={{ ...kicker, marginBottom: 11 }}>Fuentes · {sources.length}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([['document', 'Biblioteca'], ['url', 'Web'], ['text', 'Texto']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => startAdd(m)}
                    style={{ ...pill, ...(addMode === m ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--text-tertiary)' } : {}) }}
                    onMouseEnter={pillHover(true)} onMouseLeave={pillHover(addMode === m)}>
                    {label}
                  </button>
                ))}
                <button style={{ ...pill, opacity: adding ? 0.6 : 1 }} disabled={adding} onClick={() => audioInputRef.current?.click()}
                  onMouseEnter={pillHover(true)} onMouseLeave={pillHover(false)}>
                  {adding ? 'Transcribiendo…' : 'Audio'}
                </button>
                <input ref={audioInputRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" onChange={onAudioPicked} style={{ display: 'none' }} />
              </div>
            </div>

            {addMode && (
              <div style={{ margin: '0 12px 4px', padding: '13px 14px', borderRadius: 16, background: 'var(--bg-surface)', flexShrink: 0, animation: 'dayaRise 0.22s cubic-bezier(0.16,1,0.3,1) both' }}>
                {addMode === 'document' && (
                  <div className="nb-scroll" style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {libDocs.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>Tu Biblioteca está vacía. Sube documentos desde el chat o la Biblioteca.</span>}
                    {libDocs.map((d: any) => (
                      <button key={d.id} disabled={adding} onClick={() => addSource({ type: 'document', docId: d.id })}
                        style={{ ...pill, borderRadius: 10, textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '8px 11px' }}
                        onMouseEnter={pillHover(true)} onMouseLeave={pillHover(false)}>
                        {d.fileName || d.name || 'Documento'}
                      </button>
                    ))}
                  </div>
                )}
                {addMode === 'url' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input style={inputStyle} placeholder="https://ejemplo.com/articulo" value={urlValue} onChange={e => setUrlValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && urlValue.trim()) addSource({ type: 'url', url: urlValue.trim() }) }} />
                    <button disabled={adding || !urlValue.trim()} onClick={() => addSource({ type: 'url', url: urlValue.trim() })}
                      style={{ ...pill, background: '#f1f3f4', color: '#131314', border: 'none', fontWeight: 600, padding: '10px 18px', opacity: adding || !urlValue.trim() ? 0.5 : 1 }}>
                      {adding ? 'Leyendo la página…' : 'Añadir página'}
                    </button>
                  </div>
                )}
                {addMode === 'text' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input style={inputStyle} placeholder="Título de la fuente" value={textTitle} onChange={e => setTextTitle(e.target.value)} />
                    <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.55 }} placeholder="Pega aquí el texto…" value={textValue} onChange={e => setTextValue(e.target.value)} />
                    <button disabled={adding || textValue.trim().length < 40} onClick={() => addSource({ type: 'text', title: textTitle.trim(), content: textValue.trim() })}
                      style={{ ...pill, background: '#f1f3f4', color: '#131314', border: 'none', fontWeight: 600, padding: '10px 18px', opacity: adding || textValue.trim().length < 40 ? 0.5 : 1 }}>
                      {adding ? 'Añadiendo…' : 'Añadir texto'}
                    </button>
                  </div>
                )}
                <button onClick={() => setAddMode('')}
                  style={{ ...pill, border: 'none', background: 'transparent', marginTop: 6, padding: '4px 0', color: 'var(--text-tertiary)' }}>
                  Cancelar
                </button>
              </div>
            )}

            {/* Fuentes y Estudio comparten UN SOLO carril de scroll. Estudio
                estuvo clavado al fondo con flexShrink:0 y en una ventana de 543px
                dejaba la lista de fuentes en una tira de 60px, con el texto
                cortado a media frase: el panel se comía la columna entera. Así
                la lista crece, Estudio va detrás, y nada aplasta a nada. */}
            <div className="nb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '11px 12px' }}>
              {sources.length === 0 && !addMode && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.65, padding: '10px 4px' }}>
                  Añade tu primera fuente: un documento de tu Biblioteca, una página web, texto pegado o un audio.
                </p>
              )}
              {sources.map((s, i) => (
                <div key={s.id} className="nb-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 11px', borderRadius: 12, marginBottom: 5, background: 'var(--bg-surface)', animation: 'dayaRise 0.25s cubic-bezier(0.16,1,0.3,1) both' }}>
                  {/* El número ES la cita [n] que devolverá el chat, así que va en
                      --brand: es el único hilo que une respuesta y fuente. */}
                  <span style={{ flexShrink: 0, width: 21, height: 21, borderRadius: 7, background: 'color-mix(in srgb, var(--brand) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 34%, transparent)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 700, marginTop: 1 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, wordBreak: 'break-word', letterSpacing: '-0.015em' }}>{s.title}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {srcIcon(s.type)} {s.type === 'document' ? 'Biblioteca' : s.type === 'url' ? 'Página web' : s.type === 'audio' ? 'Audio transcrito' : 'Texto'}
                    </div>
                  </div>
                  <button onClick={() => removeSource(s.id)} title="Quitar fuente" className="nb-del"
                    style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s, opacity 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
              </div>

              {/* ── Estudio ── */}
              {/* marginTop:auto lo empuja al fondo cuando hay pocas fuentes (que
                  es donde se espera un panel de acciones) y lo deja fluir detrás
                  de la lista en cuanto ésta crece. */}
              <div style={{ marginTop: 'auto' }}>
                <StudioPanel
                  kicker={kicker}
                  disabled={sources.length === 0}
                  transforming={transforming}
                  reporting={reporting}
                  audioStatus={audioStatus}
                  onTransform={runTransform}
                  onReport={runReport}
                  onAudio={runAudio}
                />
              </div>
            </div>
          </div>

          {/* ── Columna 3: chat con citas ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Cabecera al fin callada: solo el título del cuaderno. Las seis
                acciones que la reventaban ahora viven en Estudio. */}
            <div style={{ padding: '0 22px', height: 58, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              {editingTitle ? (
                <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle} onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                  style={{ ...inputStyle, maxWidth: 360, fontWeight: 600, fontSize: '1rem' }} />
              ) : (
                <h2 onClick={() => { setTitleDraft(active.title); setEditingTitle(true) }} title="Pulsa para renombrar"
                  style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'text', letterSpacing: '-0.045em', padding: '4px 8px', margin: '0 -8px', borderRadius: 8, transition: 'background 0.15s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {active.title}
                </h2>
              )}
              {/* Aquí colgaba un "N FUENTES" que repetía el rótulo del panel de
                  al lado, a diez centímetros y con la misma letra. */}
            </div>

            <div className="nb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px 22px 8px' }}>
              <div style={{ maxWidth: 760, margin: '0 auto' }}>
                {msgs.length === 0 && (
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-tertiary)', lineHeight: 1.7, maxWidth: 500, padding: '4px 2px' }}>
                    {sources.length === 0
                      ? 'Este cuaderno aún no tiene fuentes. Añade al menos una para empezar a conversar.'
                      : 'Pregunta lo que quieras sobre tus fuentes. Cada respuesta citará [n] la fuente exacta de donde salió — y si algo no está en el material, te lo dirá.'}
                  </p>
                )}
                {msgs.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 20 }}>
                    {m.role === 'user' ? (
                      // Calcada de MessageBubble: pastilla con tinte suave, no un
                      // bloque de color macizo.
                      <div className="daya-user-bubble" style={{
                        maxWidth: '76%', padding: '10px 16px', borderRadius: '16px 16px 4px 16px',
                        background: 'color-mix(in srgb, var(--accent-500) 13%, var(--bg-surface))',
                        border: '1px solid color-mix(in srgb, var(--accent-500) 28%, transparent)',
                        color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.65,
                        fontFamily: 'var(--font-body)', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                        animation: 'dayaRise 0.3s cubic-bezier(0.16,1,0.3,1) both',
                      }}>
                        {m.content}
                      </div>
                    ) : (
                      // La respuesta va SUELTA sobre el lienzo, sin caja — como en
                      // el chat de casa. Solo lo generado por Estudio (m.label) se
                      // enmarca: eso sí es una pieza aparte, no una contestación.
                      <div style={{
                        maxWidth: '100%', width: m.label ? '100%' : 'auto',
                        padding: m.label ? '15px 17px' : 0,
                        borderRadius: m.label ? 14 : 0,
                        background: m.label ? 'var(--bg-surface)' : 'transparent',
                        animation: 'dayaRise 0.3s cubic-bezier(0.16,1,0.3,1) both',
                      }}>
                        {m.label && <div style={{ ...kicker, color: 'var(--brand)', marginBottom: 10 }}>{m.label}</div>}
                        {m.audio ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 280 }}>
                            <audio controls src={m.audio} style={{ width: '100%' }} />
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                              <a href={m.audio} download="resumen-audio.mp3"
                                style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none', borderBottom: '1px solid var(--border-strong)', paddingBottom: 1 }}>
                                Descargar MP3
                              </a>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Dos voces · generado con tus fuentes</span>
                            </div>
                            {m.transcript && (
                              <details>
                                <summary style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Ver transcripción</summary>
                                <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.65, marginTop: 8 }}>{m.transcript}</div>
                              </details>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="prose-daya" style={{ fontSize: '0.88rem' }}><ReactMarkdown>{m.content}</ReactMarkdown></div>
                            <button onClick={() => saveToNotes(m, i)}
                              style={{ marginTop: 10, padding: '4px 11px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'transparent', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500, color: savedNoteIdx === i ? 'var(--green)' : 'var(--text-tertiary)', fontFamily: 'var(--font-body)', transition: 'color 0.15s, background 0.15s' }}
                              onMouseEnter={e => { if (savedNoteIdx !== i) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                              onMouseLeave={e => { if (savedNoteIdx !== i) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' } }}>
                              {savedNoteIdx === i ? 'Guardado en Notas' : 'Guardar en Notas'}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {busy && (
                  <div style={{ display: 'flex', gap: 5, padding: '6px 2px 14px' }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', display: 'inline-block', animation: `nbTyping 1.1s ease-in-out ${i * 0.18}s infinite` }} />
                    ))}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            {error && (
              <div style={{ maxWidth: 760, width: '100%', margin: '0 auto 10px', padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--red) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 28%, transparent)', color: 'var(--red)', fontSize: '0.79rem', lineHeight: 1.5, boxSizing: 'border-box' }}>{error}</div>
            )}

            <div style={{ padding: '0 22px 18px', flexShrink: 0 }}>
              <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--bg-surface)', borderRadius: 18, padding: 8 }}>
                <textarea value={input} onChange={e => setInput(e.target.value)} rows={1}
                  placeholder={sources.length === 0 ? 'Añade una fuente para empezar…' : 'Pregunta sobre tus fuentes…'}
                  disabled={sources.length === 0 || busy}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.6, fontFamily: 'var(--font-body)', padding: '8px', maxHeight: 130 }} />
                {/* Círculo en --text-primary, el mismo botón de enviar del chat.
                    Antes era un cuadrado gris en --accent-500. */}
                <button onClick={send} disabled={!input.trim() || busy || sources.length === 0} title="Enviar"
                  style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 999, border: 'none', cursor: input.trim() && !busy && sources.length > 0 ? 'pointer' : 'not-allowed', background: input.trim() && !busy && sources.length > 0 ? '#f1f3f4' : 'var(--bg-elevated)', color: input.trim() && !busy && sources.length > 0 ? '#131314' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes nbTyping { 30% { transform: translateY(-4px); opacity: 1; } 60% { opacity: 0.4; } }
        /* Lo destructivo, escondido hasta que lo buscas */
        .nb-del { opacity: 0; }
        .nb-row:hover .nb-del, .nb-card:hover .nb-del, .nb-del:focus-visible { opacity: 1; }

        /* ── Aurora de marca ──────────────────────────────────────────────────
           Calcada de la landing (.lx-aurora): dos manchas violeta enormes y muy
           desenfocadas. Aquí va ABSOLUTE y no fixed —vive dentro de una columna
           flex, no de la ventana— y el contenido se levanta con z-index 1.
           A 0.06 de alfa no se percibe como color sino como profundidad; subirlo
           convertiría el panel en una pantalla morada. */
        .nb-aurora { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; filter: blur(80px); }
        .nb-aurora::before, .nb-aurora::after {
          content: ''; position: absolute; width: 42vw; height: 42vw; border-radius: 50%; will-change: transform; }
        .nb-aurora::before { top: -14vw; left: -8vw;
          background: radial-gradient(circle, rgba(109,92,255,0.06), transparent 68%);
          animation: nbFloatA 34s ease-in-out infinite; }
        .nb-aurora::after { bottom: -18vw; right: -10vw;
          background: radial-gradient(circle, rgba(109,92,255,0.045), transparent 68%);
          animation: nbFloatB 44s ease-in-out infinite; }
        /* En la portada (sin cuadernos todavía) la aurora sube: ahí no compite
           con ninguna tarjeta y es lo único que da atmósfera a la pantalla. En la
           galería se queda baja, porque detrás de las portadas de color el
           violeta empezaría a ensuciar los tonos. */
        .nb-aurora--hero::before { background: radial-gradient(circle, rgba(109,92,255,0.13), transparent 68%); }
        .nb-aurora--hero::after  { background: radial-gradient(circle, rgba(109,92,255,0.10), transparent 68%); }
        @keyframes nbFloatA {
          0%, 100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(8vw,6vw,0) scale(1.14); } }
        @keyframes nbFloatB {
          0%, 100% { transform: translate3d(0,0,0) scale(1.1); }
          50% { transform: translate3d(-9vw,-5vw,0) scale(1); } }

        /* Al pasar por encima, la tarjeta se enciende por el filo. El .daya-lift
           de la casa ya pone la subida y la sombra; esto solo añade el color. */
        /* ── Portada ──────────────────────────────────────────────────────────
           Estrecho: apilada y centrada. Ancho (≥980px): el texto a la izquierda
           y la maqueta a la derecha. Apilada medía ~590px y en una ventana normal
           cortaba el botón de crear por abajo — la única acción de la pantalla,
           escondida en el peor sitio posible. */
        .nb-hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0; max-width: 470px; width: 100%; }
        .nb-hero-text { display: flex; flex-direction: column; align-items: center; }
        .nb-hero-ico, .nb-hero-cta { justify-content: center; }
        .nb-hero-demo { width: 100%; }
        @media (min-width: 980px) {
          .nb-hero { flex-direction: row; align-items: center; text-align: left; gap: 52px; max-width: 940px; }
          .nb-hero-text { align-items: flex-start; flex: 0 1 400px; }
          .nb-hero-ico, .nb-hero-cta { justify-content: flex-start; }
          .nb-hero-demo { flex: 1 1 440px; min-width: 0; }
          .nb-hero-demo > div { margin-bottom: 0 !important; }
        }

        /* La tarjeta ya lleva su propio color, así que el hover no puede ser un
           gris fijo (lo mataría). Se aclara sobre sí misma. */
        .nb-card { transition: filter 0.18s ease; }
        .nb-card:hover { filter: brightness(1.16); }
        .nb-newcard:hover { color: var(--text-primary); background: var(--bg-surface); border-color: #5f6368; }

        /* Un fondo que respira solo es justo lo que molesta a quien pide menos
           movimiento: se congela, pero no desaparece (se conserva el ambiente). */
        @media (prefers-reduced-motion: reduce) {
          .nb-aurora::before, .nb-aurora::after { animation: none; }
        }
        /* Barra de desplazamiento fina, del color del filo. La misma decisión que
           en la barra lateral: se ve —hace falta para saber que sigue hacia
           abajo— pero no compite con el contenido. */
        .nb-scroll::-webkit-scrollbar { width: 8px; }
        .nb-scroll::-webkit-scrollbar-track { background: transparent; }
        .nb-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 99px; border: 2px solid transparent; background-clip: content-box; }
        .nb-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); background-clip: content-box; }
      `}</style>
    </div>
  )
}

// ============================================================================
// Estudio — lo que se puede HACER con las fuentes, al pie de la columna que las
// contiene (el panel Studio de NotebookLM, en la casa de Daya).
//
// El resumen en audio va arriba y a lo ancho porque es la pieza estrella; las
// cuatro transformaciones de texto, en rejilla de dos; el informe PDF cierra.
// Con el cuaderno sin fuentes todo queda apagado y sin cursor: no hay nada con
// lo que trabajar, y es mejor decirlo que dejar botones que fallan al pulsarlos.
// ============================================================================
function StudioPanel({ kicker, disabled, transforming, reporting, audioStatus, onTransform, onReport, onAudio }: {
  kicker: React.CSSProperties
  disabled: boolean
  transforming: string
  reporting: boolean
  audioStatus: string
  onTransform: (k: 'resumen' | 'ideas' | 'guia' | 'faq', label: string) => void
  onReport: () => void
  onAudio: () => void
}) {
  // Relleno tonal, sin contorno: es lo que hace que un panel de acciones se lea
  // como un bloque de fichas y no como una rejilla de casillas.
  const card = (on: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 14,
    border: 'none', background: 'var(--bg-surface)',
    color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)',
    fontSize: '0.72rem', fontWeight: 500, fontFamily: 'var(--font-body)',
    cursor: on ? 'pointer' : 'not-allowed', opacity: on ? 1 : 0.45,
    textAlign: 'left', letterSpacing: '-0.01em', minWidth: 0,
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
  })
  const enter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return
    e.currentTarget.style.background = 'var(--bg-elevated)'
    e.currentTarget.style.color = 'var(--text-primary)'
  }
  const leave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return
    e.currentTarget.style.background = 'var(--bg-surface)'
    e.currentTarget.style.color = 'var(--text-secondary)'
  }
  const on = !disabled

  const TRANSFORMS = [
    { k: 'resumen', label: 'Resumen denso', d: 'M4 6h16M4 11h16M4 16h9' },
    { k: 'ideas', label: 'Ideas clave', d: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z' },
    { k: 'guia', label: 'Guía de estudio', d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
    { k: 'faq', label: 'FAQ', d: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z' },
  ] as const

  return (
    <div style={{ padding: '18px 12px 14px', flexShrink: 0 }}>
      <div style={{ ...kicker, padding: '0 3px', marginBottom: 10 }}>Estudio</div>

      {/* La estrella: mini-podcast de dos voces. A lo ancho y con el filo en
          --brand, que aquí sí marca lo destacado del panel. */}
      <button onClick={onAudio} disabled={disabled || !!audioStatus}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 13px', borderRadius: 16, marginBottom: 7,
          border: 'none',
          background: on ? 'color-mix(in srgb, var(--brand) 15%, var(--bg-surface))' : 'var(--bg-surface)',
          color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
          cursor: on && !audioStatus ? 'pointer' : 'not-allowed', opacity: on ? 1 : 0.45,
          fontFamily: 'var(--font-body)', textAlign: 'left', transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'color-mix(in srgb, var(--brand) 24%, var(--bg-elevated))' }}
        onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'color-mix(in srgb, var(--brand) 15%, var(--bg-surface))' }}>
        <span style={{ flexShrink: 0, color: 'var(--brand)', display: 'flex' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="7" x2="8" y2="17"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="16" y1="8" x2="16" y2="16"/><line x1="20" y1="11" x2="20" y2="13"/>
          </svg>
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
            {audioStatus || 'Resumen en audio'}
          </span>
          <span style={{ display: 'block', fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: 1 }}>
            {audioStatus ? 'Esto tarda un poco…' : 'Dos voces conversando sobre tus fuentes'}
          </span>
        </span>
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        {TRANSFORMS.map(t => (
          <button key={t.k} disabled={disabled || !!transforming} onClick={() => onTransform(t.k, t.label)}
            style={{ ...card(on), opacity: on ? (transforming && transforming !== t.k ? 0.45 : 1) : 0.45 }}
            onMouseEnter={enter} onMouseLeave={leave}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={t.d} /></svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {transforming === t.k ? 'Generando…' : t.label}
            </span>
          </button>
        ))}
      </div>

      <button disabled={disabled || reporting} onClick={onReport}
        title="Redacta un informe ejecutivo con todo el material y lo entrega como PDF"
        style={{ ...card(on), width: '100%' }}
        onMouseEnter={enter} onMouseLeave={leave}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6M9.5 15.5 12 18l2.5-2.5"/></svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {reporting ? 'Redactando informe…' : 'Informe PDF'}
        </span>
      </button>

      {disabled && (
        <p style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', lineHeight: 1.55, margin: '10px 3px 0' }}>
          Añade una fuente para desbloquear el estudio.
        </p>
      )}
    </div>
  )
}
