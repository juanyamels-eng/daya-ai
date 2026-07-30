'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../store'
import Sidebar from '../../components/layout/Sidebar'
import ResearchWorkspace from '../../components/research/ResearchWorkspace'

export default function ResearchPage() {
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
      <ResearchWorkspace />
    </div>
  )
}
