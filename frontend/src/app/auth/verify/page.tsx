'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { AxiosError } from 'axios'
import { api } from '../../../lib/api'
import { AuthBackground, AuthStyles, DayaLogo, CheckMark } from '../../../components/auth/AuthChrome'

function VerifyContent() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setError('Enlace inválido o incompleto.'); return }
    api.post('/auth/verify', { token })
      .then(() => { setStatus('ok'); setTimeout(() => router.replace('/dashboard'), 2000) })
      .catch((e: unknown) => {
        const err = e as AxiosError<{ error?: string }>
        setStatus('error'); setError(err.response?.data?.error || 'El enlace expiró o no es válido.')
      })
  }, [])

  return (
    <div className="lxa">
      <AuthBackground />

      <div className="lxa-solo">
        <div className="lxa-topbar">
          <Link href="/" className="lxa-logo">
            <DayaLogo size={26} />
            <span>Daya</span>
          </Link>
        </div>

        <div className="lxa-card lxa-card--narrow" style={{ textAlign: 'center' }}>
          {status === 'loading' && (
            <>
              <div className="lxa-spin-lg" aria-hidden="true" />
              <h1 className="lxa-h1 lxa-h1--sm">Verificando tu correo...</h1>
              <p className="lxa-lead" style={{ marginBottom: 0 }}>Un momento, por favor.</p>
            </>
          )}

          {status === 'ok' && (
            <>
              <div className="lxa-badge lxa-badge--ok"><CheckMark /></div>
              <h1 className="lxa-h1 lxa-h1--sm">Correo verificado</h1>
              <p className="lxa-lead" style={{ marginBottom: 0 }}>Te estamos llevando a tu panel...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <h1 className="lxa-h1 lxa-h1--sm">Enlace no válido</h1>
              <p className="lxa-lead">{error}</p>
              <Link href="/dashboard" className="lxa-btn lxa-btn-lg">Ir a mi panel</Link>
            </>
          )}
        </div>
      </div>

      <AuthStyles />
    </div>
  )
}

export default function VerifyPage() {
  return <Suspense fallback={null}><VerifyContent /></Suspense>
}
