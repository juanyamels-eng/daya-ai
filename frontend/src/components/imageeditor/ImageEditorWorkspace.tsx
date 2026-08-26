'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from '../../lib/toast'

// Editor de imágenes propio (Canvas, 100% en el navegador). Sin modelos pesados.
export default function ImageEditorWorkspace() {
  const baseRef = useRef<HTMLCanvasElement | null>(null)   // fuente de verdad (pixeles)
  const viewRef = useRef<HTMLCanvasElement | null>(null)   // lienzo visible
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [hasImage, setHasImage] = useState(false)
  const [bright, setBright] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [satur, setSatur] = useState(100)
  const [preset, setPreset] = useState<'none' | 'grayscale' | 'sepia' | 'vintage'>('none')
  const [cropMode, setCropMode] = useState(false)
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [imgHistory, setImgHistory] = useState<{ id: string; url: string; date: number }[]>([])
  useEffect(() => {
    try { const h = localStorage.getItem('daya_imgedit_history'); if (h) setImgHistory(JSON.parse(h)) } catch {}
  }, [])
  const saveImgToHistory = (url: string) => {
    setImgHistory(prev => {
      let next = [{ id: Date.now().toString(), url, date: Date.now() }, ...prev].slice(0, 8)
      // Si excede la cuota del navegador, recorta hasta que entre
      while (next.length > 1) {
        try { localStorage.setItem('daya_imgedit_history', JSON.stringify(next)); break }
        catch { next = next.slice(0, next.length - 1) }
      }
      return next
    })
  }

  // Cadena de filtros CSS según los ajustes actuales
  const filterStr = useCallback(() => {
    let f = `brightness(${bright}%) contrast(${contrast}%) saturate(${satur}%)`
    if (preset === 'grayscale') f += ' grayscale(1)'
    if (preset === 'sepia') f += ' sepia(0.8)'
    if (preset === 'vintage') f += ' sepia(0.4) contrast(1.1) brightness(1.05) saturate(1.2)'
    return f
  }, [bright, contrast, satur, preset])

  // Copia base -> vista y aplica el filtro vía CSS (preview en vivo)
  const paint = useCallback(() => {
    const base = baseRef.current, view = viewRef.current
    if (!base || !view) return
    view.width = base.width; view.height = base.height
    const ctx = view.getContext('2d')!
    ctx.clearRect(0, 0, view.width, view.height)
    ctx.drawImage(base, 0, 0)
    view.style.filter = filterStr()
  }, [filterStr])

  useEffect(() => { paint() }, [paint])
  // Al cargar una imagen nueva, el lienzo recién se monta; pinta cuando ya está en el DOM.
  useEffect(() => { if (hasImage) requestAnimationFrame(() => paint()) }, [hasImage])

  // Cargar imagen (semilla del editor de docs o archivo del usuario)
  const loadFromSrc = (src: string) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const base = document.createElement('canvas')
      const max = 1400
      let { width, height } = img
      if (width > max || height > max) { const r = Math.min(max / width, max / height); width = Math.round(width * r); height = Math.round(height * r) }
      base.width = width; base.height = height
      base.getContext('2d')!.drawImage(img, 0, 0, width, height)
      baseRef.current = base
      setHasImage(true); setBright(100); setContrast(100); setSatur(100); setPreset('none'); setSel(null); setCropMode(false)
    }
    img.onerror = () => toast('No se pudo cargar la imagen', 'error')
    img.src = src
  }

  useEffect(() => {
    try {
      const seed = sessionStorage.getItem('daya_image_seed')
      if (seed) { sessionStorage.removeItem('daya_image_seed'); loadFromSrc(seed) }
    } catch {}
  }, [])

  const onFile = (f?: File) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => loadFromSrc(reader.result as string)
    reader.readAsDataURL(f)
  }

  // ── Operaciones destructivas (se hornean en baseRef) ──
  const commit = (draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => { w: number; h: number }) => {
    const base = baseRef.current; if (!base) return
    const tmp = document.createElement('canvas')
    const tctx = tmp.getContext('2d')!
    const out = draw(tctx, base.width, base.height)
    baseRef.current = tmp
    void out
    paint()
  }
  const rotate = (dir: 1 | -1) => commit((ctx) => {
    const base = baseRef.current!
    ctx.canvas.width = base.height; ctx.canvas.height = base.width
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2)
    ctx.rotate(dir * Math.PI / 2)
    ctx.drawImage(base, -base.width / 2, -base.height / 2)
    return { w: ctx.canvas.width, h: ctx.canvas.height }
  })
  const flip = (axis: 'h' | 'v') => commit((ctx) => {
    const base = baseRef.current!
    ctx.canvas.width = base.width; ctx.canvas.height = base.height
    ctx.translate(axis === 'h' ? base.width : 0, axis === 'v' ? base.height : 0)
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1)
    ctx.drawImage(base, 0, 0)
    return { w: base.width, h: base.height }
  })

  // Quita-fondo básico: hace transparentes los colores parecidos al de las esquinas
  const removeBackground = () => {
    const base = baseRef.current; if (!base) return
    const ctx = base.getContext('2d')!
    const img = ctx.getImageData(0, 0, base.width, base.height)
    const d = img.data
    // color promedio de las 4 esquinas
    const corners = [0, (base.width - 1) * 4, (base.width * (base.height - 1)) * 4, (base.width * base.height - 1) * 4]
    let r = 0, g = 0, b = 0
    corners.forEach(c => { r += d[c]; g += d[c + 1]; b += d[c + 2] })
    r /= 4; g /= 4; b /= 4
    const thr = 60
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - r) < thr && Math.abs(d[i + 1] - g) < thr && Math.abs(d[i + 2] - b) < thr) d[i + 3] = 0
    }
    ctx.putImageData(img, 0, 0)
    paint()
    toast('Fondo quitado (básico)', 'success')
  }

  // ── Recorte por arrastre ──
  const viewToCanvas = (e: React.MouseEvent) => {
    const view = viewRef.current!; const rect = view.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (view.width / rect.width), y: (e.clientY - rect.top) * (view.height / rect.height) }
  }
  const applyCrop = () => {
    if (!sel || sel.w < 5 || sel.h < 5) { setCropMode(false); setSel(null); return }
    commit((ctx) => {
      const base = baseRef.current!
      ctx.canvas.width = Math.round(sel.w); ctx.canvas.height = Math.round(sel.h)
      ctx.drawImage(base, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h)
      return { w: sel.w, h: sel.h }
    })
    setCropMode(false); setSel(null)
  }

  // ── Exportar (hornea los filtros) ──
  const toDataURL = (): string | null => {
    const base = baseRef.current; if (!base) return null
    const out = document.createElement('canvas')
    out.width = base.width; out.height = base.height
    const ctx = out.getContext('2d')!
    ctx.filter = filterStr()
    ctx.drawImage(base, 0, 0)
    return out.toDataURL('image/png')
  }
  const download = () => {
    const url = toDataURL(); if (!url) return
    saveImgToHistory(url)
    const a = document.createElement('a'); a.href = url; a.download = 'imagen-daya.png'; document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div className="daya-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Editor de imágenes</h1>
        {hasImage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={download} style={ghostBtn}>Descargar</button>
          </div>
        )}
      </div>

      <div className="imgedit-body" style={{ flex: 1, overflow: 'auto', display: 'flex', gap: 18, padding: 18 }}>
        {/* Lienzo */}
        <div className="imgedit-canvas" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-default)', borderRadius: 16, padding: 16, position: 'relative' }}>
          {!hasImage ? (
            <button onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 40, border: '2px dashed var(--border-strong)', borderRadius: 16, background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Sube una imagen para editar</span>
            </button>
          ) : (
            <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}
              onMouseDown={e => { if (!cropMode) return; const p = viewToCanvas(e); dragStart.current = p; setSel({ x: p.x, y: p.y, w: 0, h: 0 }) }}
              onMouseMove={e => { if (!cropMode || !dragStart.current) return; const p = viewToCanvas(e); const s = dragStart.current; setSel({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }) }}
              onMouseUp={() => { dragStart.current = null }}>
              <canvas ref={viewRef} style={{ maxWidth: '100%', maxHeight: '64vh', borderRadius: 8, display: 'block', cursor: cropMode ? 'crosshair' : 'default' }} />
              {cropMode && sel && viewRef.current && (
                <div style={{ position: 'absolute', border: '2px solid var(--accent-500)', background: 'rgba(0,0,0,0.15)', pointerEvents: 'none',
                  left: `${(sel.x / viewRef.current.width) * 100}%`, top: `${(sel.y / viewRef.current.height) * 100}%`,
                  width: `${(sel.w / viewRef.current.width) * 100}%`, height: `${(sel.h / viewRef.current.height) * 100}%` }} />
              )}
            </div>
          )}
        </div>

        {/* Panel de herramientas */}
        {hasImage && (
          <div className="imgedit-tools" style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <Group title="Transformar">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <ToolBtn onClick={() => rotate(-1)} label="Rotar ⟲" />
                <ToolBtn onClick={() => rotate(1)} label="Rotar ⟳" />
                <ToolBtn onClick={() => flip('h')} label="Voltear ⇆" />
                <ToolBtn onClick={() => flip('v')} label="Voltear ⇅" />
                <ToolBtn onClick={() => { setCropMode(c => !c); setSel(null) }} label={cropMode ? 'Cancelar' : 'Recortar'} active={cropMode} />
                {cropMode && <ToolBtn onClick={applyCrop} label="Aplicar" />}
              </div>
            </Group>

            <Group title="Ajustes">
              <Slider label="Brillo" value={bright} onChange={setBright} />
              <Slider label="Contraste" value={contrast} onChange={setContrast} />
              <Slider label="Saturación" value={satur} onChange={setSatur} />
            </Group>

            <Group title="Filtros">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {(['none', 'grayscale', 'sepia', 'vintage'] as const).map(p => (
                  <ToolBtn key={p} onClick={() => setPreset(p)} active={preset === p}
                    label={p === 'none' ? 'Normal' : p === 'grayscale' ? 'B/N' : p === 'sepia' ? 'Sepia' : 'Vintage'} />
                ))}
              </div>
            </Group>

            <Group title="Avanzado">
              <ToolBtn onClick={removeBackground} label="Quitar fondo (básico)" full />
              <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>Funciona mejor con fondos lisos. Para recortes perfectos por IA haría falta un servicio aparte.</p>
              <ToolBtn onClick={() => { setBright(100); setContrast(100); setSatur(100); setPreset('none') }} label="Restablecer ajustes" full />
              <ToolBtn onClick={() => fileInputRef.current?.click()} label="Cambiar imagen" full />
            </Group>

            {imgHistory.length > 0 && (
              <Group title="Recientes">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {imgHistory.map(h => (
                    <button key={h.id} onClick={() => loadFromSrc(h.url)} title="Reabrir esta imagen"
                      style={{ padding: 0, border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: 'var(--bg-elevated)' }}>
                      <img src={h.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
                <button onClick={() => { setImgHistory([]); try { localStorage.removeItem('daya_imgedit_history') } catch {} }}
                  style={{ marginTop: 8, width: '100%', padding: '7px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>Borrar recientes</button>
              </Group>
            )}
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />

      <style>{`
        @media (max-width: 820px) {
          .imgedit-body { flex-direction: column; }
          .imgedit-tools { width: 100% !important; }
        }
        .imgedit-tools input[type=range] {
          -webkit-appearance: none; appearance: none; height: 5px; border-radius: 999px;
          background: var(--border-default); outline: none; cursor: pointer;
        }
        .imgedit-tools input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: var(--accent-500); border: 2px solid var(--bg-surface); box-shadow: 0 1px 4px rgba(0,0,0,0.25); cursor: pointer;
        }
        .imgedit-tools input[type=range]::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%; background: var(--accent-500);
          border: 2px solid var(--bg-surface); cursor: pointer;
        }
        .imgedit-toolbtn:hover { border-color: var(--border-strong) !important; color: var(--text-primary) !important; }
        .imgedit-canvas {
          background-color: var(--bg-surface);
          background-image:
            linear-gradient(45deg, var(--bg-elevated) 25%, transparent 25%),
            linear-gradient(-45deg, var(--bg-elevated) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, var(--bg-elevated) 75%),
            linear-gradient(-45deg, transparent 75%, var(--bg-elevated) 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }
      `}</style>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}
function ToolBtn({ onClick, label, active, full }: { onClick: () => void; label: string; active?: boolean; full?: boolean }) {
  return (
    <button onClick={onClick} className={active ? '' : 'imgedit-toolbtn'} style={{ gridColumn: full ? '1 / -1' : undefined, width: full ? '100%' : undefined, marginBottom: full ? 8 : 0, padding: '9px 10px', borderRadius: 9, background: active ? 'var(--accent-500)' : 'var(--bg-elevated)', color: active ? 'white' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent-500)' : 'var(--border-default)'}`, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.13s' }}>{label}</button>
  )
}
function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
        <span>{label}</span><span style={{ color: 'var(--text-tertiary)' }}>{value}%</span>
      </div>
      <input type="range" min={0} max={200} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-500)' }} />
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
}
