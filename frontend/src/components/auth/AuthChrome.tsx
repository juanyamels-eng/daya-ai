'use client'

// ══════════════════════════════════════════════════════════════════════════════
// Piel compartida de todas las pantallas de acceso (login, registro, recuperar,
// restablecer, verificar). Es el MISMO lenguaje visual que la landing de
// app/page.tsx: negro #131314, monoespaciada, píldoras, estrellas en paralaje y
// aurora violeta. Quien llega de fuera no debería notar el salto de la portada
// al formulario.
//
// Autocontenido en tokens --lxa-*: estas pantallas van SIEMPRE en oscuro, no
// siguen el tema claro/oscuro de la app, exactamente como la landing.
// ══════════════════════════════════════════════════════════════════════════════

// Las dos capas de fondo. Van dentro de .lxa, antes del contenido.
export function AuthBackground() {
  return (
    <>
      <div className="lxa-aurora" aria-hidden="true" />
      <div className="lxa-stars" aria-hidden="true" />
    </>
  )
}

// dangerouslySetInnerHTML y no `<style>{...}`: React ESCAPA el texto hijo al
// serializar en el servidor (' → &#x27;) pero <style> es un elemento de texto
// CRUDO, así que el navegador no lo decodifica y el HTML del cliente dejaba de
// coincidir con el del servidor. Una comilla en un comentario del CSS bastaba
// para tirar la hidratación (pasó en la landing, ver LandingStyles).
export function AuthStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .lxa {
        --lxa-bg: var(--surface-dark-bg);
        --lxa-text: var(--surface-dark-text);
        --lxa-text-2: var(--surface-dark-text-2);
        --lxa-text-3: var(--surface-dark-text-3);
        --lxa-accent: var(--surface-dark-accent);
        --lxa-card: var(--surface-dark-card);
        --lxa-card-hover: var(--surface-dark-card-hover);
        --lxa-border: var(--surface-dark-border);
        --lxa-red: #f28b82;
        --lxa-green: #81c995;
        /* El LangSelector se pinta con las variables globales del tema; aquí se
           le redefinen en oscuro para que no salga blanco si el usuario tiene
           el tema claro activo. */
        --bg-base: #131314; --bg-surface: #1e1e1f; --bg-elevated: #282a2c;
        --border-default: #444746; --border-strong: #5f6368;
        --text-primary: #e3e3e3; --text-secondary: #c4c7c5; --text-tertiary: #9aa0a6;
        --accent-500: #f1f3f4;
        /* overflow-x, no overflow: en pantallas bajas el formulario debe poder
           desplazarse. Las capas de fondo ya se recortan solas. */
        position: relative; min-height: 100dvh; display: flex; overflow-x: hidden;
        background: var(--lxa-bg); color: var(--lxa-text);
        font-family: var(--font-sans, system-ui, sans-serif);
        -webkit-font-smoothing: antialiased;
      }

      /* Fondo vivo, calcado de la landing: dos capas de estrellas a distinta
         velocidad (paralaje) animadas con transform sobre un pseudo del doble de
         alto, para que el trabajo se quede en la GPU. */
      .lxa-stars { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
      .lxa-stars::before, .lxa-stars::after {
        content: ''; position: absolute; left: 0; right: 0; top: 0; height: 200%; will-change: transform; }
      .lxa-stars::before { opacity: 0.55;
        background-image: radial-gradient(rgba(255,255,255,0.11) 1px, transparent 1.4px);
        background-size: 78px 78px; animation: lxaDrift 150s linear infinite; }
      .lxa-stars::after { opacity: 0.4;
        background-image: radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.4px);
        background-size: 52px 52px; background-position: 26px 32px; animation: lxaDrift 90s linear infinite; }
      @keyframes lxaDrift { from { transform: translate3d(0,0,0); } to { transform: translate3d(0,-50%,0); } }

      .lxa-aurora { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; filter: blur(80px); }
      .lxa-aurora::before, .lxa-aurora::after {
        content: ''; position: absolute; width: 46vw; height: 46vw; border-radius: 50%; will-change: transform; }
      .lxa-aurora::before { top: -12vw; left: -6vw;
        background: radial-gradient(circle, rgba(var(--brand-rgb),0.06), transparent 68%);
        animation: lxaFloatA 34s ease-in-out infinite; }
      .lxa-aurora::after { bottom: -16vw; right: -8vw;
        background: radial-gradient(circle, rgba(var(--brand-rgb),0.045), transparent 68%);
        animation: lxaFloatB 44s ease-in-out infinite; }
      @keyframes lxaFloatA { 0%, 100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(9vw,7vw,0) scale(1.14); } }
      @keyframes lxaFloatB { 0%, 100% { transform: translate3d(0,0,0) scale(1.1); } 50% { transform: translate3d(-11vw,-6vw,0) scale(1); } }

      /* ── Columnas ──
         Dos mitades en login y registro; .lxa-solo es la variante de una sola
         columna centrada (recuperar, restablecer, verificar). */
      .lxa-form { position: relative; z-index: 1; flex: 0 0 50%; display: flex; flex-direction: column;
        align-items: center; padding: 0 32px 48px; }
      .lxa-solo { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column;
        align-items: center; padding: 0 24px 48px; }
      .lxa-brand { position: relative; z-index: 1; flex: 0 0 50%; display: flex; overflow: hidden;
        border-left: 1px solid var(--lxa-border); background: #131314;
        animation: lxaUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.12s both; }
      .lxa-card { width: 100%; max-width: 420px; margin: auto;
        animation: lxaUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.05s both; }
      .lxa-card--narrow { max-width: 380px; }
      @keyframes lxaUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      @keyframes spin { to { transform: rotate(360deg) } }

      /* ── Barra superior (misma nav que la landing) ── */
      .lxa-topbar { width: 100%; max-width: 420px; display: flex; align-items: center; justify-content: space-between; padding: 20px 0; }
      /* En las pantallas de una columna la barra se alinea con el borde de la
         tarjeta estrecha, no con el carril de 420. */
      .lxa-solo .lxa-topbar { max-width: 380px; }
      .lxa-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; color: var(--lxa-text); }
      .lxa-logo span { font-size: 0.98rem; font-weight: 650; letter-spacing: -0.02em; }
      .lxa-topright { display: flex; align-items: center; gap: 8px; }
      .lxa-lang { display: inline-flex; }
      .lxa-navlink { display: inline-flex; align-items: center; padding: 9px 14px; border-radius: 999px;
        background: transparent; border: none; text-decoration: none; color: var(--lxa-text-2);
        font-size: 0.79rem; font-weight: 500; font-family: inherit; letter-spacing: -0.02em;
        transition: color 0.15s, background 0.15s; }
      .lxa-navlink:hover { color: var(--lxa-text); background: rgba(255,255,255,0.07); }

      /* ── Botones ── */
      .lxa-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer;
        background: var(--lxa-accent); color: #131314; font-weight: 600; font-family: inherit;
        letter-spacing: -0.025em; text-decoration: none; white-space: nowrap; border-radius: 999px;
        transition: background 0.2s, filter 0.15s; }
      .lxa-btn:hover:not(:disabled) { filter: brightness(1.08); }
      .lxa-btn:active:not(:disabled) { filter: brightness(0.96); }
      .lxa-btn-sm { padding: 10px 18px; font-size: 0.82rem; }
      .lxa-btn-lg { padding: 14px 20px; font-size: 0.9rem; }
      .lxa-btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;
        background: transparent; color: var(--lxa-text); font-weight: 600; font-family: inherit;
        letter-spacing: -0.025em; text-decoration: none; border: 1px solid var(--lxa-border);
        border-radius: 999px; transition: background 0.2s, border-color 0.2s; }
      .lxa-btn-ghost:hover:not(:disabled) { background: var(--lxa-card-hover); border-color: #5f6368; }
      .lxa-google { width: 100%; padding: 13px; font-size: 0.86rem; margin-bottom: 22px; }
      .lxa-google:disabled { cursor: not-allowed; opacity: 0.7; }
      .lxa-submit { width: 100%; }
      .lxa-submit:disabled { background: var(--lxa-card); color: var(--lxa-text-3); cursor: not-allowed; }

      /* ── Cabecera del formulario ── */
      .lxa-h1 { margin: 0 0 10px; color: #f8f9fa; font-weight: 650;
        font-size: clamp(1.9rem, 3.4vw, 2.6rem); line-height: 1.1; letter-spacing: -0.03em; text-wrap: balance; }
      .lxa-h1--sm { font-size: clamp(1.5rem, 2.6vw, 1.95rem); }
      .lxa-lead { margin: 0 0 28px; color: var(--lxa-text-2); font-size: 0.88rem; line-height: 1.6; }

      /* ── Divisor ── */
      .lxa-divider { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; color: var(--lxa-text-3); }
      .lxa-divider::before, .lxa-divider::after { content: ''; flex: 1; height: 1px; background: var(--lxa-border); }
      .lxa-divider span { font-size: 0.64rem; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; font-family: var(--font-mono, ui-monospace, monospace); }

      /* ── Campos ── */
      .lxa-fields { display: flex; flex-direction: column; gap: 16px; }
      /* Versalita con tracking abierto: la misma etiqueta técnica que usan las
         tarjetas de la landing. */
      .lxa-label { display: block; margin-bottom: 8px; color: var(--lxa-text-3);
        font-size: 0.66rem; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; }
      .lxa-input { width: 100%; box-sizing: border-box; padding: 13px 15px; border-radius: 12px;
        background: var(--lxa-card); border: 1px solid var(--lxa-border); color: var(--lxa-text);
        font-family: inherit; font-size: 0.86rem; letter-spacing: -0.015em; outline: none;
        transition: border-color 0.18s, background 0.18s, box-shadow 0.18s; }
      .lxa-input::placeholder { color: #6f7377; }
      .lxa-input:hover { border-color: #5f6368; }
      .lxa-input:focus { background: #131314; border-color: var(--lxa-accent);
        box-shadow: 0 0 0 3px rgba(241,243,244,0.1); }
      /* Chrome pinta los campos autocompletados con SU fondo azul claro y no hay
         forma de cambiarlo con background: se tapa con una sombra interior
         gigante. La transición eterna evita el fogonazo blanco del primer
         fotograma. Sin esto, quien vuelve al login se encontraba dos cajas
         blancas en mitad de una pantalla negra. */
      .lxa-input:-webkit-autofill,
      .lxa-input:-webkit-autofill:hover,
      .lxa-input:-webkit-autofill:focus {
        -webkit-text-fill-color: var(--lxa-text);
        -webkit-box-shadow: 0 0 0 1000px var(--lxa-card) inset;
        caret-color: var(--lxa-text);
        transition: background-color 9999s ease-out 0s; }
      .lxa-input:-webkit-autofill:focus { -webkit-box-shadow: 0 0 0 1000px #131314 inset, 0 0 0 3px rgba(241,243,244,0.1); }
      .lxa-input--pw { padding-right: 46px; }
      .lxa-input.is-bad { border-color: var(--lxa-red); box-shadow: 0 0 0 3px rgba(242,139,130,0.09); }
      .lxa-fielderr { margin: 6px 0 0 2px; font-size: 0.72rem; color: var(--lxa-red); }
      .lxa-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
        display: flex; align-items: center; justify-content: center; padding: 4px; border: none;
        background: none; cursor: pointer; color: var(--lxa-text-3); border-radius: 6px; transition: color 0.15s; }
      .lxa-eye:hover { color: var(--lxa-text); }

      .lxa-alert { display: flex; align-items: flex-start; gap: 8px; padding: 11px 13px; border-radius: 12px;
        background: rgba(242,139,130,0.08); border: 1px solid rgba(242,139,130,0.24);
        color: var(--lxa-red); font-size: 0.8rem; line-height: 1.5; }

      /* ── Medidor de fuerza de contraseña (registro) ── */
      .lxa-meter { margin-top: 9px; }
      .lxa-meter-bars { display: flex; gap: 4px; }
      .lxa-meter-seg { flex: 1; height: 3px; border-radius: 2px; background: var(--lxa-border); transition: background 0.25s; }
      .lxa-meter-txt { margin: 6px 0 0; font-size: 0.64rem; font-weight: 500;
        letter-spacing: 0.12em; text-transform: uppercase; transition: color 0.25s; }

      /* ── Aviso legal bajo el botón de registro ──
         Sustituye a las dos casillas: se acepta al crear la cuenta. */
      /* Aparece cuando el formulario ya está completo, así que entra con un
         fundido: si surgiera de golpe parecería un error de la página. */
      .lxa-legal { margin: 2px 0 0; text-align: center; color: var(--lxa-text-3);
        font-size: 0.7rem; line-height: 1.6;
        animation: lxaLegalIn 0.32s cubic-bezier(0.16,1,0.3,1) both; }
      @keyframes lxaLegalIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
      .lxa-legal a { color: var(--lxa-text-2); text-decoration: underline;
        text-underline-offset: 2px; transition: color 0.15s; }
      .lxa-legal a:hover { color: var(--lxa-text); }

      /* ── Enlaces de cierre ── */
      .lxa-foot { display: flex; flex-direction: column; gap: 10px; margin-top: 22px; text-align: center; }
      .lxa-foot a { color: var(--lxa-text-3); text-decoration: none; font-size: 0.8rem; transition: color 0.15s; }
      .lxa-foot a:hover { color: var(--lxa-text); }
      .lxa-foot p { margin: 0; font-size: 0.8rem; color: var(--lxa-text-3); }
      .lxa-foot-strong { color: var(--lxa-text) !important; font-weight: 600; }

      /* ── Insignia de icono (correo enviado, verificado) ── */
      .lxa-badge { width: 54px; height: 54px; border-radius: 16px; display: flex; align-items: center;
        justify-content: center; margin: 0 auto 22px; background: var(--lxa-card); border: 1px solid var(--lxa-border);
        color: var(--lxa-text); }
      .lxa-badge--ok { color: var(--lxa-green); border-color: rgba(129,201,149,0.35); background: rgba(129,201,149,0.08); }
      .lxa-spin-lg { width: 30px; height: 30px; margin: 0 auto 22px; border-radius: 50%;
        border: 2px solid var(--lxa-border); border-top-color: var(--lxa-accent); animation: spin 0.7s linear infinite; }

      /* ── Panel del arcade (login) ── */
      .lxa-arena { display: flex; flex-direction: column; width: 100%; height: 100%; background: #0e0e10; }
      .lxa-arena-bar { display: flex; align-items: center; gap: 10px; padding: 12px 18px;
        border-bottom: 1px solid var(--lxa-border); flex-shrink: 0;
        color: var(--lxa-text); font-size: 0.72rem; font-weight: 500;
        letter-spacing: 0.12em; text-transform: uppercase; }
      .lxa-arena-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lxa-text-3); flex-shrink: 0; }
      /* La meta, a la derecha del rótulo: lo primero que se lee al llegar. */
      .lxa-arena-goal { margin-left: auto; color: var(--lxa-text-3);
        font-size: 0.66rem; font-weight: 500; letter-spacing: 0.12em; }
      .lxa-arena-stage { position: relative; flex: 1; min-height: 0; }

      /* ── Panel de marca del registro: el plan gratis, en tarjeta plana ── */
      .lxa-brand--pitch { align-items: center; justify-content: center; padding: 56px 60px; }
      .lxa-pitch { width: 100%; max-width: 420px; }
      .lxa-pitch-h2 { margin: 0 0 26px; color: #f8f9fa; font-weight: 650;
        font-size: clamp(1.7rem, 2.9vw, 2.4rem); line-height: 1.12; letter-spacing: -0.03em; text-wrap: balance; }
      .lxa-pitch-h2 em { font-style: normal; color: var(--lxa-text-3); }
      .lxa-pitch-tag { margin: 0 0 14px; color: var(--lxa-text-3); font-size: 0.66rem;
        font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; font-family: var(--font-mono, ui-monospace, monospace); }
      .lxa-pitch-list { list-style: none; margin: 0; padding: 4px 22px; border-radius: 16px; background: var(--lxa-card); }
      .lxa-pitch-list li { display: flex; align-items: flex-start; gap: 12px; padding: 13px 0;
        border-top: 1px solid var(--lxa-border); color: var(--lxa-text-2); font-size: 0.84rem; line-height: 1.55; }
      .lxa-pitch-list li:first-child { border-top: none; }
      .lxa-pitch-list svg { flex-shrink: 0; margin-top: 3px; color: var(--lxa-text-3); }

      @media (max-width: 880px) {
        .lxa-brand { display: none; }
        .lxa-form { flex: 1; padding: 0 22px 40px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .lxa *, .lxa *::before, .lxa *::after { animation: none !important; }
      }
    ` }} />
  )
}

// ─── Iconos y piezas sueltas ─────────────────────────────────────────────────
export function Spinner({ color = 'currentColor' }: { color?: string }) {
  return (
    <div aria-hidden="true" style={{ width: 16, height: 16, border: `2px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
  )
}

export function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// El logo se invierte fijo: estas pantallas son oscuras siempre, y con
// var(--logo-filter) salía negro sobre negro si el usuario tenía el tema claro.
export function DayaLogo({ size = 26 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <img src="/logo.png" alt="Daya" style={{ filter: 'invert(1) brightness(1.15)', width: size, height: size, objectFit: 'contain', display: 'block' }} />
    </div>
  )
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export function CheckMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
