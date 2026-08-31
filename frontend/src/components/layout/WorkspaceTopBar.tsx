'use client'

/* ============================================================================
   Cabecera de los espacios PROPIOS (Cuadernos, y el mismo patrón en Studio).

   Cuadernos y Studio no son pantallas del chat: son herramientas con su propio
   sitio, y por eso no arrastran la barra lateral NI llevan botón de volver. Se
   abren en pestaña nueva (ver Sidebar.openInNewTab), así que la salida normal es
   cerrarla: al hacerlo sigues donde estabas, con tu chat intacto. Un botón de
   "volver" aquí insinuaría que estás dentro de otra cosa, y no lo estás.

   El logo ES un enlace a Daya. No es un "volver" disfrazado: es lo que hace el
   logo en cualquier sitio, y cubre a quien llega por URL directa o marcador, que
   no tiene ninguna pestaña que cerrar. Enlace de verdad (<a>, no un onClick):
   Ctrl+clic y rueda abren en otra pestaña, y el navegador enseña a dónde va.

   ── Es la nav de la landing, no otra cosa ────────────────────────────────────
   Calcada de `.lx-nav` en app/page.tsx: fondo translúcido con desenfoque, sin
   filo, el logo a 26px con su inversión y el wordmark a 0.98rem/-0.04em.

   Aquí probé el logo sobre pastilla clara para esquivar la inversión. Se veía
   más nítido, sí, pero era un logo que la marca no usa en ningún otro sitio: la
   portada lleva el invertido, y dos logos distintos entre la web y la app es
   exactamente lo que este proyecto lleva evitando desde que app y landing
   comparten voz. Manda la landing.

   El rótulo de sitio ("CUADERNOS" en versalita) ya NO va aquí: la nav de la
   portada es solo el logo, y dentro la pantalla ya se presenta con su propio
   titular. Decirlo dos veces a dos centímetros era ruido. `label` se conserva
   opcional por si algún espacio futuro necesita nombrarse.
   ========================================================================== */
export default function WorkspaceTopBar({ label, right }: { label?: string; right?: React.ReactNode }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0,
      padding: '0 24px', height: 58,
      // Translúcido + desenfoque, como la nav de la landing. Al no llevar filo,
      // el contenido pasa por debajo sin que nada corte la pantalla.
      background: 'color-mix(in srgb, var(--bg-base) 72%, transparent)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      position: 'relative', zIndex: 5,
    }}>
      <a href="/dashboard" title="Ir a Daya"
        style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', borderRadius: 999, padding: '5px 10px', margin: '0 -10px', transition: 'background 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
        <img src="/logo.png" alt="" aria-hidden="true" style={{ width: 26, height: 26, objectFit: 'contain', filter: 'var(--logo-filter)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.98rem', fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Daya</span>
      </a>

      {label && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      )}

      {right && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </header>
  )
}
