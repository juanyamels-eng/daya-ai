'use client'
import { useEffect, useRef } from 'react'
import { subscribe, type TabEvent } from '../lib/tabSync'

// Escucha los avisos de las demás pestañas. El handler se guarda en una ref para
// no volver a suscribirse en cada render (cerraría y abriría el canal sin parar).
export function useTabSync(handler: (ev: TabEvent, at: number) => void, enabled = true) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    return subscribe((ev, at) => ref.current(ev, at))
  }, [enabled])
}

export { publish } from '../lib/tabSync'
export type { TabEvent } from '../lib/tabSync'
