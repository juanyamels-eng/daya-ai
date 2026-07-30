'use client'
import { useEffect, useRef } from 'react'

/* ============================================================================
   Atajos de teclado — un solo listener por consumidor, declarativo.

   Antes cada pantalla enganchaba su propio `window.addEventListener('keydown')`
   con su propia idea de cuándo ignorar la pulsación. Aquí la regla vive en un
   sitio: por defecto un atajo NO se dispara mientras el usuario escribe (input,
   textarea, select o contenteditable), salvo que lo pida con `allowInInput`.

   La combinación se declara con `ctrl`, que significa Ctrl en Windows/Linux y ⌘
   en Mac: es el mismo atajo para el usuario, no dos.
   ========================================================================== */

export interface Shortcut {
  /** Tecla tal cual llega en KeyboardEvent.key; se compara sin mayúsculas. */
  key: string
  /** Ctrl (Windows/Linux) o ⌘ (Mac). */
  ctrl?: boolean
  /** Si se omite, da igual el estado de Shift. */
  shift?: boolean
  /** Deja que el atajo funcione aunque el foco esté en un campo de texto. */
  allowInInput?: boolean
  run: (e: KeyboardEvent) => void
}

/** ¿El foco está en algo donde el usuario está escribiendo? */
export function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null
  if (!n || typeof n.tagName !== 'string') return false
  const tag = n.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || n.isContentEditable === true
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  // En una ref para no reenganchar el listener en cada render: los handlers se
  // redefinen en cada pasada y montar/desmontar el listener 60 veces sobra.
  const ref = useRef(shortcuts)
  ref.current = shortcuts

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey) return // ningún atajo usa Alt: no le robamos los acentos a nadie
      const typing = isTypingTarget(e.target)
      const key = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey
      for (const s of ref.current) {
        if (s.key.toLowerCase() !== key) continue
        if (!!s.ctrl !== ctrl) continue
        if (s.shift !== undefined && s.shift !== e.shiftKey) continue
        if (typing && !s.allowInInput) continue
        e.preventDefault()
        s.run(e)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

/** Lo que se enseña en el modal de ayuda (`?`). Fuente única de la lista. */
export const SHORTCUT_HELP: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Paleta de comandos' },
  { keys: ['Ctrl', '↵'], label: 'Enviar el mensaje' },
  { keys: ['Ctrl', 'F'], label: 'Buscar dentro de la conversación' },
  { keys: ['/'], label: 'Buscar entre tus conversaciones' },
  { keys: ['N'], label: 'Conversación nueva' },
  { keys: ['?'], label: 'Ver esta ayuda' },
  { keys: ['Esc'], label: 'Cerrar lo que esté abierto' },
]
