import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

// Includes con relaciones ausentes en el schema generado: se mantiene el acceso dinámico histórico.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const router = Router()

// ============================================
// SSO CONFIGURATION (Admin only)
// ============================================

// Get SSO config for org
router.get('/orgs/:orgId/sso', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { orgId } = req.params

  // Verify admin
  const membership = await db.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const settings = await db.orgSettings.findUnique({ where: { orgId } })
  res.json({
    ssoEnabled: settings?.ssoEnabled || false,
    ssoProvider: settings?.ssoProvider || null,
    ssoConfig: settings?.ssoConfig || null,
  })
})

// Update SSO config
router.put('/orgs/:orgId/sso', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { orgId } = req.params
  const { enabled, provider, config } = req.body

  const membership = await db.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })
  if (!membership || membership.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only owner can configure SSO' })
  }

  await db.orgSettings.update({
    where: { orgId },
    data: {
      ssoEnabled: enabled,
      ssoProvider: provider,
      ssoConfig: config ? JSON.stringify(config) : null,
    },
  })

  res.json({ ok: true })
})

// ============================================
// SSO LOGIN FLOW
// ============================================

// Initialize SSO login
router.post('/auth/sso', async (req: Request, res: Response) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email requerido' })
  }

  // Find user by email
  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado. Contacta a tu administrador.' })
  }

  // Check if user has SSO enabled via their org
  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    include: { org: { include: { settings: true } } },
  })

  if (!membership?.org?.settings?.ssoEnabled) {
    return res.status(400).json({ error: 'SSO no está habilitado para tu organización' })
  }

  // Generate SSO token
  const ssoToken = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  await db.ssoToken.create({
    data: {
      userId: user.id,
      orgId: membership.orgId,
      token: ssoToken,
      expires,
    },
  })

  // Return redirect URL based on provider
  const provider = membership.org.settings.ssoProvider
  const config = JSON.parse(membership.org.settings.ssoConfig || '{}')

  let redirectUrl: string

  switch (provider) {
    case 'okta':
      redirectUrl = `${config.oktaDomain}/oauth2/default/v1/authorize?` +
        `client_id=${config.clientId}&response_type=code&scope=openid+email+profile&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${ssoToken}`
      break

    case 'azure':
      redirectUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?` +
        `client_id=${config.clientId}&response_type=code&scope=openid+email+profile&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${ssoToken}`
      break

    case 'google':
      redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${config.clientId}&response_type=code&scope=openid+email+profile&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${ssoToken}`
      break

    default:
      return res.status(400).json({ error: 'Proveedor SSO no soportado' })
  }

  res.json({ redirectUrl, ssoToken })
})

// SSO callback
router.post('/auth/sso/callback', async (req: Request, res: Response) => {
  const { code, state } = req.body

  if (!code || !state) {
    return res.status(400).json({ error: 'Código y state requeridos' })
  }

  // Find SSO token
  const ssoTokenRecord = await db.ssoToken.findFirst({
    where: { token: state, used: false },
    include: { user: true, org: { include: { settings: true } } },
  })

  if (!ssoTokenRecord) {
    return res.status(400).json({ error: 'Token SSO inválido o ya usado' })
  }

  if (new Date() > ssoTokenRecord.expires) {
    return res.status(400).json({ error: 'Token SSO expirado' })
  }

  // Mark token as used
  await db.ssoToken.update({
    where: { id: ssoTokenRecord.id },
    data: { used: true },
  })

  // Exchange code for tokens (simplified - real implementation would call provider API)
  // For now, we'll just create a session

  const token = jwt.sign(
    { userId: ssoTokenRecord.userId },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )

  res.json({
    token,
    user: {
      id: ssoTokenRecord.user.id,
      email: ssoTokenRecord.user.email,
      name: ssoTokenRecord.user.name,
      plan: ssoTokenRecord.user.plan,
    },
  })
})

// ============================================
// SSO PROVIDERS LIST
// ============================================

router.get('/providers', async (_req: Request, res: Response) => {
  res.json({
    providers: [
      { id: 'okta', name: 'Okta', icon: '🔐', description: 'Enterprise Identity' },
      { id: 'azure', name: 'Azure AD', icon: '🔷', description: 'Microsoft Identity' },
      { id: 'google', name: 'Google Workspace', icon: '🔴', description: 'Google Identity' },
      { id: 'github', name: 'GitHub', icon: '⚫', description: 'Developer SSO' },
    ],
  })
})

export default router
