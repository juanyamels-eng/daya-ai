// ============================================
// DAYA IA — Payment routes (PayPal + Payoneer)
// ============================================

import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { paymentsLimiter } from '../middleware/rateLimiter'
import { prisma } from '../lib/prisma'
import { createOrder, captureOrder, isPayPalConfigured, getPayoneerLink } from '../services/paypal'
import { PLANS, PlanId, getPublicPlans, getMessageLimit } from '../config/plans'
import { sendPlanUpgradeEmail } from '../services/email'
import { logger } from '../services/logger'

const router = Router()

interface WebhookEvent {
  event_type?: string
  type?: string
}

// FRONTEND_URL can be a comma-separated LIST (used by CORS). For PayPal
// redirects we take the FIRST one as canonical.
const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim()

// GET /api/payments/plans — public plan list (no auth required)
router.get('/plans', (_req: Request, res: Response) => {
  res.json({ plans: getPublicPlans(), paypalEnabled: isPayPalConfigured() })
})

// GET /api/payments/config — available payment methods
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    paypalEnabled: isPayPalConfigured(),
    payoneerLink: getPayoneerLink(),
  })
})

// Everything below requires authentication
router.use(requireAuth)

// Activates the user's plan after a confirmed payment (reusable)
// Idempotent: replaying the same PayPal capture (same chargeId + plan) does NOT
// reset the usage counters again — otherwise a retry/duplicate webhook would
// grant free extra usage on every replay.
export async function activatePlan(userId: string, planId: PlanId, chargeId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  if (chargeId && user.lastChargeId === chargeId && user.plan === planId) {
    return { updated: user, expires: user.planExpiresAt || new Date(), alreadyProcessed: true }
  }

  const now = new Date()
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const plan = PLANS[planId]

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      plan: planId,
      planActivatedAt: now,
      planExpiresAt: expires,
      lastChargeId: chargeId || null,
      messagesLimit: getMessageLimit(planId),
      // Resets ALL FOUR counters when activating the plan (not just messages): otherwise,
      // upgrading the plan would carry over already used images/searches/designs.
      messagesUsed: 0,
      imagesUsed: 0,
      searchesUsed: 0,
      studioUsed: 0,
      documentsUsed: 0,
      usageResetAt: now,
    },
  })

  sendPlanUpgradeEmail(user.email, user.name, plan.name).catch(() => {})
  return { updated, expires }
}

// POST /api/payments/paypal/create-order — creates the order and returns the approval link
router.post('/paypal/create-order', paymentsLimiter, async (req: Request, res: Response) => {
  const { planId } = req.body as { planId: PlanId }
  if (!planId || !PLANS[planId] || planId === 'FREE') {
    return res.status(400).json({ error: 'Plan inválido' })
  }

  const result = await createOrder({
    planId,
    returnUrl: `${FRONTEND}/planes?paypal=return&planId=${planId}`,
    cancelUrl: `${FRONTEND}/planes?paypal=cancel`,
  })

  if (!result.success) return res.status(402).json({ error: result.error })
  res.json({ orderId: result.orderId, approveUrl: result.approveUrl })
})

// POST /api/payments/paypal/capture — confirms payment and activates the plan
router.post('/paypal/capture', paymentsLimiter, async (req: Request, res: Response) => {
  const userId = req.userId
  const { orderId, planId } = req.body as { orderId: string; planId: PlanId }

  if (!orderId) return res.status(400).json({ error: 'Orden requerida' })
  if (!planId || !PLANS[planId] || planId === 'FREE') {
    return res.status(400).json({ error: 'Plan inválido' })
  }

  const capture = await captureOrder(orderId)
  if (!capture.success) return res.status(402).json({ error: capture.error })

  // Trusts PayPal's custom_id if present; otherwise uses the one from the body
  const finalPlan = (capture.planId as PlanId) || planId
  const activated = await activatePlan(userId, finalPlan, capture.captureId)
  if (!activated) return res.status(404).json({ error: 'Usuario no encontrado' })

  res.json({
    success: true,
    plan: finalPlan,
    expiresAt: activated.expires,
    user: {
      id: activated.updated.id,
      name: activated.updated.name,
      email: activated.updated.email,
      plan: activated.updated.plan,
    },
  })
})

// GET /api/payments/status — user's subscription status
router.get('/status', async (req: Request, res: Response) => {
  const userId = req.userId
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planActivatedAt: true, planExpiresAt: true, messagesUsed: true, messagesLimit: true },
  })
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

  const plan = PLANS[user.plan as PlanId] || PLANS.FREE
  res.json({
    plan: user.plan,
    planName: plan.name,
    activatedAt: user.planActivatedAt,
    expiresAt: user.planExpiresAt,
    messagesUsed: user.messagesUsed,
    messagesLimit: user.messagesLimit,
    limitPeriod: plan.limitPeriod,
  })
})

// POST /api/payments/webhook — PayPal notifications (public)
// IMPORTANT: verifies the signature so no one can fake a "successful payment".
// Requires the raw body (configured in index.ts with express.raw for this route).
export async function paymentsWebhook(req: Request, res: Response) {
  const crypto = await import('crypto')
  const secret = process.env.WEBHOOK_SECRET || ''
  const signature = (req.headers['x-webhook-signature'] as string) || ''

  if (secret) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body)
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
    const valid = signature.length > 0 && (() => {
      try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      } catch { return false }
    })()
    if (!valid) {
      console.warn('⚠️ Webhook con firma inválida — rechazado')
      return res.status(401).json({ error: 'Firma inválida' })
    }
  }

  let event: WebhookEvent | undefined
  try {
    event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body
  } catch {
    return res.status(400).json({ error: 'Payload inválido' })
  }

  logger.info(`🔔 Webhook verificado: ${event?.event_type || event?.type || 'evento'}`)
  res.status(200).json({ received: true })
}

export default router
