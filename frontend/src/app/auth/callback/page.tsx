'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../../store'
import { AuthBackground, AuthStyles } from '../../../components/auth/AuthChrome'

export default function AuthCallback() {
  const router = useRouter()
  const { setUser, setToken } = useAuthStore()
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) {
          setError('El acceso con Google no está configurado (faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).')
          return
        }

        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            // false: que SOLO el exchangeCodeForSession manual (más abajo) canjee el
            // ?code=. Con true, el cliente lo canjeaba también al construirse y competía
            // con el canje manual por el mismo código (de un solo uso) → race condition
            // que hacía fallar el login con Google de forma intermitente.
            detectSessionInUrl: false,
            flowType: 'pkce',
            storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          },
        })

        const params = new URLSearchParams(window.location.search)

        // Si Google/Supabase devolvió un error explícito, muéstralo
        const errParam = params.get('error_description') || params.get('error')
        if (errParam) { setError(decodeURIComponent(errParam)); return }

        let session: any = null
        let exchangeMsg = ''

        // 1) Flujo PKCE: intercambiar el ?code= por una sesión real.
        // IMPORTANTE: exchangeCodeForSession espera SOLO el código, no la URL entera.
        // Pasar window.location.href mandaba la URL completa como auth_code y el
        // servidor respondía "invalid flow state, no valid flow state found".
        const code = params.get('code')
        if (code) {
          try {
            const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code)
            if (!exErr) session = data?.session ?? null
            else exchangeMsg = exErr.message || String(exErr)
          } catch (e: any) { exchangeMsg = e?.message || String(e) }
        }

        // 2) Plan B: leer la sesión con reintentos (por si la URL aún se está procesando)
        for (let i = 0; i < 10 && !session?.user; i++) {
          const { data } = await supabase.auth.getSession()
          session = data.session
          if (!session?.user) await new Promise(r => setTimeout(r, 250))
        }

        if (!session?.user) {
          // Superficie del motivo REAL. El caso típico es un fallo de PKCE
          // ("code verifier") por desajuste de origin (www vs apex): el verifier
          // se guardó en un origin y aquí se lee en otro. Mostramos el origin
          // actual para diagnosticarlo de un vistazo.
          const diag = `[origin: ${window.location.origin}]${exchangeMsg ? ` ${exchangeMsg}` : ''}`
          setError(`No se recibió la sesión de Google. ${diag}. Revisa que este mismo dominio + /auth/callback esté en Supabase → URL Configuration.`)
          return
        }

        // 3) Canjear la sesión de Google por nuestro token de Daya
        const API = process.env.NEXT_PUBLIC_API_URL || ''
        const res = await fetch(`${API}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: session.access_token }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.token) {
          setToken(data.token)
          setUser(data.user)
          router.replace('/dashboard')
          return
        }
        setError(data.error || 'No se pudo completar el inicio de sesión con Google.')
      } catch (e: any) {
        setError(e?.message || 'Ocurrió un error iniciando sesión con Google.')
      }
    }
    run()
  }, [])

  return (
    <div className="lxa">
      <AuthBackground />

      <div className="lxa-solo" style={{ justifyContent: 'center' }}>
        <div className="lxa-card lxa-card--narrow" style={{ textAlign: 'center' }}>
          {!error ? (
            <>
              <div className="lxa-spin-lg" aria-hidden="true" />
              <p className="lxa-lead" style={{ marginBottom: 0 }}>Iniciando sesión con Google…</p>
            </>
          ) : (
            <>
              <div className="lxa-badge" style={{ color: 'var(--lxa-red)', borderColor: 'rgba(242,139,130,0.3)', background: 'rgba(242,139,130,0.08)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h1 className="lxa-h1 lxa-h1--sm">No se pudo entrar con Google</h1>
              <p className="lxa-lead">{error}</p>
              <Link href="/auth/login" className="lxa-btn lxa-btn-lg">Volver al inicio de sesión</Link>
            </>
          )}
        </div>
      </div>

      <AuthStyles />
    </div>
  )
}
