import { Router } from 'express'
import { register, login, me, forgotPassword, resetPassword, verifyEmail, resendVerification, signToken } from '../controllers/authController'
import { requireAuth } from '../middleware/auth'
import { authLimiter } from '../middleware/rateLimiter'
import { prisma } from '../lib/prisma'
import { sendWelcomeEmail } from '../services/email'

const router = Router()

router.post('/register', authLimiter, register)
router.post('/login', authLimiter, login)
router.get('/me', requireAuth, me)

// Recuperación de acceso
router.post('/forgot', authLimiter, forgotPassword)
router.post('/reset', authLimiter, resetPassword)

// Verificación de correo
router.post('/verify', verifyEmail)
router.post('/resend-verification', requireAuth, resendVerification)

// Google OAuth callback.
// SEGURIDAD: NO confiamos en el email que manda el cliente. Verificamos el
// access_token emitido por Supabase contra la propia API de Supabase y usamos
// el email REAL que devuelve. Así nadie puede hacerse pasar por otra cuenta
// mandando un email cualquiera a este endpoint.
router.post('/google', async (req, res) => {
  const { accessToken } = req.body as { accessToken?: string }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({
      error: 'El acceso con Google no está configurado en el servidor. Falta SUPABASE_URL / SUPABASE_ANON_KEY.',
    })
  }
  if (!accessToken) {
    return res.status(401).json({ error: 'Falta el token de Google.' })
  }

  // Verificar el token contra Supabase: devuelve el usuario sólo si es válido.
  let verifiedEmail = ''
  let verifiedName = ''
  try {
    const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      console.error('[auth/google] Supabase respondió', r.status, body.slice(0, 200))
      return res.status(401).json({ error: 'Sesión de Google inválida o expirada.' })
    }
    const supaUser: any = await r.json()
    verifiedEmail = (supaUser?.email || '').toLowerCase().trim()
    verifiedName = supaUser?.user_metadata?.full_name || supaUser?.user_metadata?.name || ''
    if (!verifiedEmail) return res.status(401).json({ error: 'No se pudo verificar el correo de Google.' })
  } catch (e: any) {
    // Muestra el motivo real (antes se ocultaba) para poder diagnosticar.
    console.error('[auth/google] Falló la verificación con Supabase:', e?.message || e)
    return res.status(502).json({ error: 'No se pudo contactar al proveedor de identidad: ' + (e?.message || 'error de red') })
  }

  // Crear/obtener el usuario y emitir el token. Si la BASE DE DATOS falla,
  // se devuelve un error claro en vez de tumbar el proceso (causa típica del 502).
  try {
    if (!process.env.JWT_SECRET) {
      console.error('[auth/google] Falta JWT_SECRET')
      return res.status(503).json({ error: 'El servidor no tiene configurado JWT_SECRET.' })
    }
    let user = await prisma.user.findUnique({ where: { email: verifiedEmail } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: verifiedName || verifiedEmail.split('@')[0],
          email: verifiedEmail,
          emailVerified: true, // Google ya verificó el correo
          profile: { create: { language: 'es' } },
        },
      })
      // Solo para usuarios NUEVOS de Google (dentro del if !user): bienvenida
      // fire-and-forget para no romper el login si Resend falla.
      sendWelcomeEmail(user.email, user.name).catch(() => {})
    }
    const token = signToken(user.id)
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } })
  } catch (e: any) {
    console.error('[auth/google] Error de base de datos:', e?.message || e)
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos: ' + (e?.message || 'error') })
  }
})

export default router
