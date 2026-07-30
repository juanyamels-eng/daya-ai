'use client'
import { ToastProvider } from './ui/Toast'

export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
