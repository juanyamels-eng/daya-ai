'use client'
import GameCanvas from './GameCanvas'
import { create2048 } from './arcade'

/* ============================================================================
   El juego del panel del login: 2048, y solo ese.

   Los seis del arcade se juegan contrarreloj —aciertas o mueres— y eso, al
   lado de un formulario, es una carrera que nadie ha pedido correr. Este va del
   revés: no hay prisa, lo dejas a medias cuando quieras y engancha por la
   escalera. Cada potencia de dos que tocas por primera vez se queda contigo, y
   el rótulo de abajo te enseña siempre la siguiente. La ambición no es un
   número abstracto: es que te falta UNA ficha.

   Se guardan la mejor puntuación y la mejor ficha, que es el trofeo de verdad.
   ========================================================================== */
export default function LoginArcade() {
  return (
    <div className="lxa-arena">
      <div className="lxa-arena-bar">
        <span className="lxa-arena-dot" />
        <span>2048</span>
        <span className="lxa-arena-goal">Llega a 2048</span>
      </div>

      <div className="lxa-arena-stage">
        <GameCanvas
          make={create2048}
          hint="◀ ▲ ▼ ▶ mueven las fichas"
          ariaLabel="2048 — junta fichas hasta llegar a 2048"
          className="absolute inset-0"
        />
      </div>
    </div>
  )
}
