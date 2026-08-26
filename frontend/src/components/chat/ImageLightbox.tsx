'use client'
import { useEffect, useRef, useState } from 'react'
import { downloadImage } from '../../lib/download'

// Visor a pantalla completa para ampliar una imagen generada.
// Acciones DENTRO del visor: Copiar, Descargar y un editor básico de TEXTO
// (escribe, arrastra para posicionar; el texto se incrusta vía canvas al guardar).
export default function ImageLightbox({ url, prompt, onClose }: { url: string; prompt?: string; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [color, setColor] = useState<'#ffffff' | '#111111'>('#ffffff')
  const [sizeFrac, setSizeFrac] = useState(0.08)          // tamaño de fuente = fracción del ancho
  const [pos, setPos] = useState({ x: 0.5, y: 0.86 })     // posición en 0..1
  const [dispW, setDispW] = useState(0)                    // ancho mostrado del <img> (para la fuente en pantalla)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  // Mide el ancho mostrado de la imagen (para escalar la fuente del texto en pantalla).
  useEffect(() => {
    const measure = () => { if (imgRef.current) setDispW(imgRef.current.clientWidth) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const safeName = (prompt || 'daya').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'daya'

  // Dibuja la imagen + el texto en un canvas y devuelve el blob (mime png/jpeg).
  const renderToBlob = async (mime: string): Promise<Blob | null> => {
    try {
      const res = await fetch(url, { mode: 'cors' })
      const srcBlob = await res.blob()
      const bmp = await createImageBitmap(srcBlob)
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width
      canvas.height = bmp.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bmp, 0, 0)
      const t = text.trim()
      if (t) {
        const fontPx = sizeFrac * canvas.width
        ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = color === '#ffffff' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)'
        ctx.lineWidth = Math.max(2, fontPx * 0.09)
        ctx.fillStyle = color
        const x = pos.x * canvas.width
        const y = pos.y * canvas.height
        ctx.strokeText(t, x, y)
        ctx.fillText(t, x, y)
      }
      return await new Promise(resolve => canvas.toBlob(resolve, mime, 0.95))
    } catch {
      return null
    }
  }

  const handleDownload = async () => {
    setBusy(true)
    const blob = await renderToBlob('image/jpeg')
    setBusy(false)
    if (!blob) { downloadImage(url, `${safeName}.jpg`); return }   // respaldo: original
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl; a.download = `${safeName}.jpg`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000)
  }

  const handleCopy = async () => {
    try {
      setBusy(true)
      const blob = await renderToBlob('image/png')
      setBusy(false)
      const w = window as unknown as { ClipboardItem?: typeof ClipboardItem }
      if (!blob || !navigator.clipboard || typeof w.ClipboardItem === 'undefined') {
        window.open(url, '_blank', 'noopener'); return
      }
      await navigator.clipboard.write([new w.ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setBusy(false)
    }
  }

  // Arrastrar el texto: actualiza la posición (0..1) según el cursor dentro de la imagen.
  const moveFromEvent = (clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    })
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging.current) moveFromEvent(e.clientX, e.clientY) }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const btn: React.CSSProperties = { width: 42, height: 42, borderRadius: 11, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }
  const screenFont = sizeFrac * (dispW || 400)

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 'clamp(12px, 4vh, 56px)', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.18s ease' }}>

      {/* Acciones arriba a la derecha */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 2 }}>
        <button onClick={() => setEditing(v => !v)} title="Añadir texto"
          style={{ ...btn, background: editing ? 'rgba(59,130,246,0.4)' : btn.background as string, borderColor: editing ? 'rgba(59,130,246,0.6)' : (btn.border as string) }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        </button>
        <button onClick={handleCopy} title="Copiar al portapapeles" disabled={busy} style={btn}>
          {copied
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
        </button>
        <button onClick={handleDownload} title="Descargar" disabled={busy} style={btn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar" style={btn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Imagen + texto superpuesto */}
      <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', minHeight: 0 }}>
        <img ref={imgRef} src={url} alt={prompt || 'imagen'} onLoad={() => imgRef.current && setDispW(imgRef.current.clientWidth)}
          style={{ maxWidth: '100%', maxHeight: editing ? '64vh' : '82vh', width: 'auto', height: 'auto', display: 'block', borderRadius: 12, boxShadow: '0 20px 70px rgba(0,0,0,0.5)', animation: 'lightboxPop 0.24s cubic-bezier(0.16,1,0.3,1)' }} />
        {text.trim() && (
          <div onMouseDown={(e) => { e.stopPropagation(); dragging.current = true }}
            style={{ position: 'absolute', left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: 'translate(-50%, -50%)', color, fontSize: screenFont, fontWeight: 700, fontFamily: 'ui-sans-serif, system-ui, sans-serif', lineHeight: 1, whiteSpace: 'nowrap', cursor: editing ? 'move' : 'default', userSelect: 'none', textShadow: color === '#ffffff' ? '0 2px 8px rgba(0,0,0,0.6)' : '0 2px 8px rgba(255,255,255,0.5)', pointerEvents: editing ? 'auto' : 'none' }}>
            {text}
          </div>
        )}
      </div>

      {/* Barra del editor de texto */}
      {editing && (
        <div onMouseDown={e => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center', background: 'rgba(20,20,26,0.92)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '12px 16px', maxWidth: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
          <input value={text} onChange={e => setText(e.target.value.slice(0, 80))} placeholder="Escribe un texto…" autoFocus
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 9, padding: '8px 12px', color: '#fff', fontSize: '0.88rem', fontFamily: 'var(--font-body)', minWidth: 180, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['#ffffff', '#111111'] as const).map(c => (
              <button key={c} onClick={() => setColor(c)} title={c === '#ffffff' ? 'Blanco' : 'Negro'}
                style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: color === c ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.3)', cursor: 'pointer' }} />
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem' }}>
            Tamaño
            <input type="range" min={0.03} max={0.2} step={0.005} value={sizeFrac} onChange={e => setSizeFrac(Number(e.target.value))} style={{ width: 90 }} />
          </label>
          {text.trim() && <button onClick={() => setText('')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.8rem' }}>Quitar</button>}
        </div>
      )}

      {editing && <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.74rem' }}>Arrastra el texto para moverlo · Copiar/Descargar lo incrustan</div>}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lightboxPop { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  )
}
