// ============================================================
// Daya — Notificaciones flotantes (toasts)
// Reemplaza los alert() del navegador por avisos elegantes que
// aparecen abajo al centro y se van solos. Cero dependencias.
// Uso:  toast('Conversación copiada', 'success')
// ============================================================

type ToastType = 'success' | 'error' | 'info'

export function toast(message: string, type: ToastType = 'info') {
  // Guardia para SSR: en el servidor no hay document.
  if (typeof document === 'undefined') return

  // Contenedor único (se crea la primera vez)
  let container = document.getElementById('daya-toasts')
  if (!container) {
    container = document.createElement('div')
    container.id = 'daya-toasts'
    container.setAttribute('role', 'status')
    container.setAttribute('aria-live', 'polite')
    container.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'z-index:99999;display:flex;flex-direction:column;gap:8px;' +
      'align-items:center;pointer-events:none;max-width:92vw;'
    document.body.appendChild(container)
  }

  const colors: Record<ToastType, string> = {
    success: 'var(--green, #16a34a)',
    error: 'var(--red, #dc2626)',
    info: 'var(--text-tertiary, #71717a)',
  }
  const icons: Record<ToastType, string> = { success: '✓', error: '✕', info: '·' }

  const el = document.createElement('div')
  el.style.cssText =
    'display:flex;align-items:center;gap:10px;' +
    'background:var(--bg-base, #fff);color:var(--text-primary, #0a0a0c);' +
    'border:1px solid var(--border-default, rgba(0,0,0,0.09));' +
    'box-shadow:0 12px 40px rgba(0,0,0,0.12);' +
    'padding:11px 16px;border-radius:12px;font-size:0.88rem;font-weight:500;' +
    "font-family:var(--font-body, 'DM Sans', system-ui, sans-serif);" +
    'opacity:0;transform:translateY(8px);transition:opacity .22s ease, transform .22s cubic-bezier(0.16,1,0.3,1);' +
    'max-width:100%;'

  const icon = document.createElement('span')
  icon.textContent = icons[type]
  icon.style.cssText =
    `color:${colors[type]};font-weight:700;font-size:0.95rem;line-height:1;flex-shrink:0;`

  const text = document.createElement('span')
  text.textContent = message
  text.style.cssText = 'line-height:1.4;'

  el.appendChild(icon)
  el.appendChild(text)
  container.appendChild(el)

  // Entrada animada
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
  })

  // Salida automática
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(8px)'
    setTimeout(() => {
      el.remove()
      // Si no quedan toasts, limpiar el contenedor
      if (container && !container.childElementCount) container.remove()
    }, 240)
  }, 3200)
}
