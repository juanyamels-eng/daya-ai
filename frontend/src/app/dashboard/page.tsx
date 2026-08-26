'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, useChatStore, ACTIVE_CONV_KEY } from '@/store'
import { authAPI, chatAPI } from '@/lib/api'
import Sidebar from '@/components/layout/Sidebar'
import ChatWindow from '@/components/chat/ChatWindow'
import Onboarding from '@/components/Onboarding'
import VerifyEmailBanner from '@/components/VerifyEmailBanner'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import Splash from '@/components/Splash'

// Dashboard = la app principal: Sidebar (conversaciones, navegación) + ChatWindow.
// El panel de insights vive aparte en /insights.
export default function DashboardPage() {
  const { isAuthenticated, setUser, hasHydrated } = useAuthStore()
  const router = useRouter()
  const restored = useRef(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated()) { router.push('/auth/login'); return }
    authAPI.me().then(r => setUser(r.data)).catch((err: any) => {
      if (err?.response?.status === 401) router.push('/auth/login')
    })
  }, [hasHydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reabre la conversación que estaba activa antes de recargar (F5).
  // Corre una sola vez. CLAVE: solo borra el id guardado si la conversación ya no
  // existe (404). Ante errores transitorios (backend arrancando en frío, red),
  // REINTENTA sin borrar — antes un solo timeout destruía el id y el chat se
  // perdía para siempre, abriendo uno nuevo.
  useEffect(() => {
    if (!hasHydrated || restored.current) return
    if (!isAuthenticated()) return
    restored.current = true
    if (useChatStore.getState().activeConversation) return
    let savedId: string | null = null
    try { savedId = sessionStorage.getItem(ACTIVE_CONV_KEY) } catch {}
    if (!savedId) return
    const tryRestore = (attempt = 0) => {
      chatAPI.getConversation(savedId!)
        .then(r => useChatStore.getState().setActiveConversation(r.data))
        .catch((err: any) => {
          if (err?.response?.status === 404) {
            // La conversación fue borrada: limpiar y quedarse en chat nuevo.
            try { sessionStorage.removeItem(ACTIVE_CONV_KEY) } catch {}
          } else if (attempt < 3) {
            // Error transitorio (cold-start, red): reintentar SIN borrar el id.
            setTimeout(() => tryRestore(attempt + 1), 800 * (attempt + 1))
          }
          // Tras agotar reintentos: NO borrar el id (se reintenta en la próxima carga).
        })
    }
    tryRestore()
  }, [hasHydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasHydrated) return <Splash />
  if (!isAuthenticated()) return <Splash />

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <ErrorBoundary label="Sidebar"><Sidebar /></ErrorBoundary>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <VerifyEmailBanner />
        <ErrorBoundary label="Chat"><ChatWindow /></ErrorBoundary>
      </div>
      <Onboarding />
    </div>
  )
}
