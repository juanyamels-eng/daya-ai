'use client'
import { useEffect, useRef, useState } from 'react'

/* ============================================================================
   Host de canvas para los juegos de arcade.js.

   Se encarga de lo aburrido: bucle de rAF, DPR, redimensionado, pausa cuando
   el canvas no se ve (IntersectionObserver) y entrada de teclado/puntero.

   TECLADO. Se escucha keydown Y keyup para poder mantener pulsado: con solo
   keydown, girar o impulsar depende del repetido del sistema y va a tirones.

   FOCO. El juego solo responde si el canvas tiene el foco, porque en el login
   convive con un formulario y robarle las flechas a quien esta escribiendo su
   email seria un fallo grave. Como eso hace que el juego parezca roto hasta
   que haces clic, mientras no tiene el foco se muestra un velo que lo explica.

   PUNTERO. `pointer` es mover y `tap` es pulsar, y son cosas distintas: si se
   mezclan, un juego que salta al pulsar (la Carrera) salta sin parar con solo
   pasar el raton por encima.
   ========================================================================== */
export default function GameCanvas({ make, className = '', ariaLabel, hint }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    const game = make()

    let W = 0, H = 0, raf = 0, last = 0, running = false, visible = false

    const size = () => {
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (game.reset) game.reset(W, H)
    }

    const frame = (now) => {
      // dt NUNCA puede ser negativo ni absurdo. requestAnimationFrame entrega la
      // marca de INICIO del fotograma, que puede ser anterior al performance.now()
      // guardado al arrancar el bucle; ese dt negativo hacía correr los juegos
      // hacia atrás (y al circuito le dejaba la posición negativa, indexando la
      // carretera en -1). Fuera de rango se asume un fotograma de 60 Hz.
      const raw = now - last
      const dt = raw > 0 && raw < 100 ? raw : 16
      last = now
      ctx.clearRect(0, 0, W, H)
      game.update(dt, W, H)
      game.draw(ctx, W, H)
      raf = requestAnimationFrame(frame)
    }
    const play = () => { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame) } }
    const stop = () => { running = false; cancelAnimationFrame(raf); raf = 0 }

    size()
    // Gancho de pruebas: permite comprobar desde fuera que el juego responde
    // al mando de verdad, en vez de conformarse con que dibuje algo.
    if (game.state) canvas.__game = game

    const ro = new ResizeObserver(size); ro.observe(canvas)
    const io = new IntersectionObserver(
      (es) => { visible = es[0].isIntersecting; if (visible) play(); else stop() },
      { threshold: 0.15 }
    )
    io.observe(wrap)

    const KEYS = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right',
      ' ': 'fire', Enter: 'fire',
    }
    const onKey = (down) => (e) => {
      if (!visible || !game.key) return
      if (document.activeElement !== canvas) return
      const k = KEYS[e.key]
      if (!k) return
      game.key(k, down)
      if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
    }
    const kd = onKey(true), ku = onKey(false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    const at = (e) => {
      const r = canvas.getBoundingClientRect()
      const p = e.touches ? e.touches[0] : e
      return [p.clientX - r.left, p.clientY - r.top]
    }
    const onMove = (e) => { if (game.pointer) game.pointer(...at(e)) }
    // preventScroll: enfocar arrastra la página hasta el elemento, y en el login
    // eso daba un salto seco al empezar a jugar.
    const onDown = (e) => { canvas.focus({ preventScroll: true }); if (game.tap) game.tap(...at(e)) }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('touchmove', onMove, { passive: true })
    canvas.addEventListener('pointerdown', onDown)

    // Al soltar el foco, las teclas mantenidas se quedarian "pegadas".
    const onBlurKeys = () => { if (game.key) ['up', 'down', 'left', 'right'].forEach((k) => game.key(k, false)) }
    canvas.addEventListener('blur', onBlurKeys)

    return () => {
      stop(); ro.disconnect(); io.disconnect()
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('blur', onBlurKeys)
    }
  }, [make])

  // El contenedor exterior lleva SOLO la clase del padre. Añadirle `relative`
  // aqui rompia los sitios que pasan `absolute inset-0`: en Tailwind gana la
  // regla que va despues en la hoja, `relative` anulaba al `absolute` y la
  // caja se quedaba sin altura. El contexto de posicionamiento lo pone la capa
  // interior, que siempre es relative y ocupa el 100%.
  return (
    <div ref={wrapRef} className={className}>
      <div className="relative h-full w-full">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label={ariaLabel || 'Juego jugable'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="block h-full w-full outline-none"
        />
        {!focused && (
          <button
            type="button"
            onClick={() => canvasRef.current?.focus({ preventScroll: true })}
            className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 bg-[#131314]/45 text-center transition-colors hover:bg-[#131314]/25"
          >
            <span className="rounded-full border border-[#444746] bg-[#131314]/90 px-4 py-1.5 text-xs font-semibold text-[#e3e3e3]">
              Haz clic para jugar
            </span>
            {hint && <span className="px-4 text-[11px] text-[#9aa0a6]">{hint}</span>}
          </button>
        )}
      </div>
    </div>
  )
}
