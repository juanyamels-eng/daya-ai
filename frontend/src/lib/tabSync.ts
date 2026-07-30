/* ============================================================================
   Sincronización entre pestañas.

   Si tienes Daya abierta en dos pestañas y escribes en una, la otra se entera:
   no hace falta recargar. Va por BroadcastChannel, que es un canal directo entre
   pestañas del mismo origen; donde no existe (Safari viejo) cae al evento
   `storage`, que salta en las OTRAS pestañas cuando se escribe en localStorage.

   Lo que viaja es solo un aviso ("los mensajes de la conversación X han
   cambiado"), NUNCA los datos: quien lo recibe vuelve a pedirlos al backend. Así
   el servidor sigue siendo la única fuente de verdad y no hay que fusionar dos
   copias divergentes en el cliente.

   CARRERAS: cada aviso lleva la pestaña que lo emitió y su hora. Regla —
   1) nadie se aplica sus propios avisos;
   2) gana el último en escribir, porque quien recibe RECARGA del servidor y lo
      que hay en el servidor es lo último que se guardó;
   3) una pestaña que está recibiendo una respuesta en streaming ignora el aviso
      mientras dura (recargar a media respuesta la cortaría en seco) y se
      refresca al terminar.
   ========================================================================== */

const CHANNEL = 'daya-sync'

/** Identifica a ESTA pestaña para poder descartar los ecos propios. */
export const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36)

export type TabEvent =
  /** La lista de conversaciones cambió (nueva, borrada, renombrada, reordenada). */
  | { type: 'conversations' }
  /** Hay mensajes nuevos en una conversación concreta. */
  | { type: 'messages'; convId: string }
  | { type: 'notes' }
  | { type: 'tasks' }

interface Envelope { tab: string; at: number; ev: TabEvent }

let bc: BroadcastChannel | null = null
let bcTried = false
function channel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (bcTried) return bc
  bcTried = true
  try { if ('BroadcastChannel' in window) bc = new BroadcastChannel(CHANNEL) } catch { bc = null }
  return bc
}

export function publish(ev: TabEvent) {
  if (typeof window === 'undefined') return
  const env: Envelope = { tab: TAB_ID, at: Date.now(), ev }
  const ch = channel()
  if (ch) { try { ch.postMessage(env); return } catch {} }
  // Fallback: se escribe y se borra en el acto. Borrarlo importa — si dos avisos
  // seguidos son idénticos, el segundo no dispararía `storage` (mismo valor).
  try {
    localStorage.setItem(CHANNEL, JSON.stringify(env))
    localStorage.removeItem(CHANNEL)
  } catch {}
}

export function subscribe(handler: (ev: TabEvent, at: number) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const deliver = (env: Envelope | null | undefined) => {
    if (!env || !env.ev || env.tab === TAB_ID) return
    handler(env.ev, env.at)
  }
  const ch = channel()
  const onMsg = (e: MessageEvent) => deliver(e.data as Envelope)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== CHANNEL || !e.newValue) return
    try { deliver(JSON.parse(e.newValue)) } catch {}
  }
  ch?.addEventListener('message', onMsg)
  // Se escucha siempre, aunque tengamos BroadcastChannel: la otra pestaña puede
  // ser un navegador sin él y estar emitiendo por localStorage.
  window.addEventListener('storage', onStorage)
  return () => {
    ch?.removeEventListener('message', onMsg)
    window.removeEventListener('storage', onStorage)
  }
}
