'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../store'
import Sidebar from '../../components/layout/Sidebar'
import ImageEditorWorkspace from '../../components/imageeditor/ImageEditorWorkspace'

export default function ImageEditorPage() {
  const { isAuthenticated, hasHydrated } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated])

  if (!hasHydrated || !isAuthenticated()) return null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar />
      <ImageEditorWorkspace />
    </div>
  )
}
