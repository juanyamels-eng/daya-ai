'use client'
import { useState } from 'react'
import { useAuthStore } from '../store'
import { userAPI } from '../lib/api'
import { toast } from '../lib/toast'
import { Button, IconButton } from '@/components/ui'

// Aviso sutil para que el usuario confirme su correo (si aún no lo ha hecho).
export default function VerifyEmailBanner() {
  const { user } = useAuthStore()
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Solo se muestra si sabemos con certeza que NO está verificado
  if (dismissed || !user || user.emailVerified !== false) return null

  const resend = async () => {
    setSending(true)
    try { await userAPI.resendVerification(); setSent(true); toast('Te reenviamos el correo de verificación', 'success') }
    catch { toast('No se pudo reenviar ahora', 'error') }
    finally { setSending(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)', fontSize: '0.85rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      <span style={{ flex: 1, minWidth: 0 }}>Confirma tu correo para asegurar tu cuenta. Te enviamos un enlace a <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong>.</span>
      {!sent && (
        <Button size="sm" onClick={resend} disabled={sending}>
          {sending ? 'Enviando…' : 'Reenviar'}
        </Button>
      )}
      <IconButton label="Cerrar" onClick={() => setDismissed(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </IconButton>
    </div>
  )
}
