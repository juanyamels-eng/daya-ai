'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../store'
import WorkspaceTopBar from '../../components/layout/WorkspaceTopBar'
import NotebooksWorkspace from '../../components/notebooks/NotebooksWorkspace'

export default function NotebooksPage() {
  const { isAuthenticated, hasHydrated } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated])

  if (!hasHydrated || !isAuthenticated()) return null

  // Espacio PROPIO, no una pantalla del chat: sin la barra lateral, con su
  // cabecera y su salida. Cuadernos es una herramienta de investigación con sus
  // tres columnas (cuadernos · fuentes · chat con citas); meterle encima la
  // barra del chat dejaba cuatro columnas y ninguna con sitio para respirar.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Sin rótulo: la nav va como la de la landing, solo el logo. El nombre de
          la pantalla lo pone ella misma con su titular. */}
      <WorkspaceTopBar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <NotebooksWorkspace />
      </div>
    </div>
  )
}
