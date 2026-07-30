'use client'
import { useEffect } from 'react'
import { useAuthStore, systemTheme } from '../store'

// Envuelve TODAS las rutas: transición de página + tema consistente en toda la app.
// El script inline del layout aplica .dark antes del primer pintado; este efecto lo
// mantiene sincronizado al navegar y cuando el usuario cambia el tema.
//
// Con la preferencia en 'system' escuchamos prefers-color-scheme, así que si el SO
// pasa a oscuro de noche la app cambia sola, sin recargar.
export default function Template({ children }: { children: React.ReactNode }) {
  const themePref = useAuthStore((s) => s.themePref)
  const theme = useAuthStore((s) => s.theme)

  useEffect(() => {
    const apply = () => {
      const resolved = themePref === 'system' ? systemTheme() : themePref
      document.documentElement.classList.toggle('dark', resolved === 'dark')
      // Deja el tema resuelto en el store: lo leen los componentes que pintan a mano
      // (gráficas, mermaid, editor) y el script sin-parpadeo del próximo arranque.
      if (useAuthStore.getState().theme !== resolved) useAuthStore.setState({ theme: resolved })
    }
    apply()
    if (themePref !== 'system' || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [themePref, theme])

  return <div className="pg-in">{children}</div>
}
