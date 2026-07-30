// Splash de carga: lo usan el dashboard mientras hidrata el estado y
// app/loading.tsx (fallback de navegación de TODAS las rutas), para que la
// espera sea siempre la misma pantalla en vez de un fogonazo en blanco.
//
// El fondo sale de --bg-base, no de un hex fijo: antes era #07060d y al pasar al
// dashboard (#131314) o a la landing se veía un salto de color — y en tema claro
// era directamente una pantalla negra.
//
// `delay`: aparece a los 260 ms. En una navegación rápida no llega a verse (un
// logo que parpadea 50 ms molesta más que no mostrar nada) y en una lenta entra
// suave. La duración se anula con prefers-reduced-motion pero el retraso no, así
// que sigue sin haber fogonazo.
//
// Qué cambió y por qué (jul 2026): era un logo suelto oscilando entre opacidad
// 0.32 y 0.68 sobre un color liso. Tres problemas — la marca se veía apagada en
// la única pantalla donde el usuario mira sin hacer nada, el parpadeo es el
// gesto de "cargando genérico", y no había ninguna señal de avance. Ahora:
//   · La marca va NÍTIDA y con su nombre, no solo el icono.
//   · Respira con una escala mínima en vez de parpadear: dice "vivo", no "espera".
//   · Una línea de progreso indeterminada arriba da acuse de recibo real.
//   · Una viñeta radial apoya la marca en un espacio en vez de flotar sobre nada.
export default function Splash({ delay = false }: { delay?: boolean }) {
  return (
    <div className={`daya-splash${delay ? ' daya-splash--delay' : ''}`}>
      <div className="daya-splash-bar" aria-hidden="true" />
      <div className="daya-splash-mark">
        <img className="daya-splash-logo" src="/logo.png" alt="" aria-hidden="true" />
        <span className="daya-splash-word">Daya</span>
      </div>
      <span className="daya-splash-sr" role="status" aria-live="polite">Cargando</span>
      {/* dangerouslySetInnerHTML y no `<style>{...}`: React escapa el texto hijo
          al serializar en el servidor, pero <style> es texto CRUDO y el navegador
          no decodifica entidades. Basta el `content: ''` de un pseudo-elemento
          para que el servidor emita &#x27; y el cliente ', romper la hidratación
          y tirar el HTML servido. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .daya-splash { position: relative; min-height: 100vh; min-height: 100dvh;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-base, #131314); color: var(--text-primary, #e3e3e3);
          overflow: hidden; }
        .daya-splash--delay { animation: dayaSplashIn 0.2s ease-out 0.26s both; }

        /* Viñeta: un halo apenas perceptible para que la marca no flote sobre un
           color liso. En claro se invierte (sombra en los bordes). */
        .daya-splash::before { content: ''; position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 60% 45% at 50% 46%, rgba(0,0,0,0.035), transparent 70%); }
        html.dark .daya-splash::before {
          background: radial-gradient(ellipse 58% 42% at 50% 46%, rgba(255,255,255,0.05), transparent 72%); }

        /* Línea de progreso indeterminada: el acuse de recibo que faltaba. */
        .daya-splash-bar { position: absolute; top: 0; left: 0; right: 0; height: 2px; overflow: hidden;
          /* Carril tenue: sin él, el segmento parece un reflejo suelto en lugar
             de una barra que avanza. */
          background: color-mix(in srgb, currentColor 9%, transparent); }
        .daya-splash-bar::after { content: ''; position: absolute; top: 0; bottom: 0; width: 30%;
          background: linear-gradient(90deg, transparent, currentColor 30%, currentColor 70%, transparent);
          opacity: 0.85; animation: dayaSplashSlide 1.25s cubic-bezier(0.4,0,0.2,1) infinite; }

        .daya-splash-mark { position: relative; display: flex; align-items: center; gap: 11px;
          animation: dayaSplashBreath 2.6s ease-in-out infinite; }
        .daya-splash-logo { width: 30px; height: 30px; object-fit: contain;
          filter: var(--logo-filter, invert(1) brightness(1.1)); }
        .daya-splash-word { font-family: var(--font-display, system-ui, sans-serif);
          font-size: 1.22rem; font-weight: 650; letter-spacing: -0.025em; }

        /* Texto solo para lectores de pantalla: una pantalla de carga sin ningún
           anuncio deja a quien navega con voz sin saber que algo está pasando. */
        .daya-splash-sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
          clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

        @keyframes dayaSplashIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dayaSplashSlide { from { transform: translateX(-110%) } to { transform: translateX(440%) } }
        @keyframes dayaSplashBreath {
          0%, 100% { transform: scale(1);     opacity: 0.9 }
          50%      { transform: scale(1.035); opacity: 1 }
        }
        @media (prefers-reduced-motion: reduce) {
          .daya-splash-mark { animation: none; opacity: 1 }
          .daya-splash-bar::after { animation: none; width: 100%; opacity: 0.18;
            background: currentColor; }
        }
      ` }} />
    </div>
  )
}
