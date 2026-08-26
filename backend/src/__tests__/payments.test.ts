import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import type { Request, Response } from 'express'

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('../services/paypal', () => ({
  createOrder: vi.fn(),
  captureOrder: vi.fn(),
  isPayPalConfigured: vi.fn().mockReturnValue(false),
  getPayoneerLink: vi.fn().mockReturnValue(null),
}))

vi.mock('../services/email', () => ({
  sendPlanUpgradeEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../middleware/auth', () => ({
  requireAuth: vi.fn((_req, _res, next) => next()),
}))

import { prisma } from '../lib/prisma'
import { paymentsWebhook, activatePlan } from '../routes/payments'

const mockedPrisma = prisma as unknown as Record<string, any>

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

function makeWebhookReq(body: Buffer | unknown, signature?: string): Request {
  return {
    body,
    headers: signature ? { 'x-webhook-signature': signature } : {},
  } as unknown as Request
}

describe('paymentsWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('sin WEBHOOK_SECRET configurado acepta el evento (modo desarrollo)', async () => {
    vi.stubEnv('WEBHOOK_SECRET', '')
    const res = makeRes()
    await paymentsWebhook(makeWebhookReq(Buffer.from(JSON.stringify({ event_type: 'CHECKOUT.ORDER.APPROVED' }))), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
  })

  it('rechaza firma inválida con 401 aunque el payload diga "pago aprobado"', async () => {
    vi.stubEnv('WEBHOOK_SECRET', 'secreto-real')
    const res = makeRes()
    const body = Buffer.from(JSON.stringify({ event_type: 'CHECKOUT.ORDER.APPROVED' }))
    await paymentsWebhook(makeWebhookReq(body, 'firma-falsificada'), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Firma inválida' })
  })

  it('acepta payload con firma HMAC válida', async () => {
    vi.stubEnv('WEBHOOK_SECRET', 'secreto-real')
    const body = Buffer.from(JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED' }))
    const sig = crypto.createHmac('sha256', 'secreto-real').update(body).digest('hex')
    const res = makeRes()
    await paymentsWebhook(makeWebhookReq(body, sig), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
  })

  it('rechaza payload JSON corrupto con 400', async () => {
    vi.stubEnv('WEBHOOK_SECRET', '')
    const res = makeRes()
    await paymentsWebhook(makeWebhookReq(Buffer.from('{no-es-json')), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Payload inválido' })
  })
})

describe('activatePlan (idempotencia)', () => {
  const USER_ID = 'user-1'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('primera activación actualiza plan, resetea contadores y guarda chargeId', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: USER_ID, email: 'a@b.com', name: 'A', plan: 'FREE', lastChargeId: null,
    })
    mockedPrisma.user.update.mockResolvedValueOnce({
      id: USER_ID, plan: 'PRO', messagesUsed: 0, lastChargeId: 'CH-1',
    })

    const result = await activatePlan(USER_ID, 'PRO', 'CH-1')

    expect(result).not.toBeNull()
    expect((result as any).alreadyProcessed).toBeUndefined()
    expect(mockedPrisma.user.update).toHaveBeenCalledTimes(1)
    const data = mockedPrisma.user.update.mock.calls[0][0].data
    expect(data.plan).toBe('PRO')
    expect(data.messagesUsed).toBe(0)
    expect(data.imagesUsed).toBe(0)
    expect(data.lastChargeId).toBe('CH-1')
  })

  it('replay del mismo chargeId NO vuelve a resetear contadores', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: USER_ID, email: 'a@b.com', name: 'A', plan: 'PRO',
      lastChargeId: 'CH-1', planExpiresAt: new Date('2030-01-01'),
      messagesUsed: 5, imagesUsed: 3,
    })

    const result = await activatePlan(USER_ID, 'PRO', 'CH-1')

    expect((result as any).alreadyProcessed).toBe(true)
    expect(mockedPrisma.user.update).not.toHaveBeenCalled()
  })

  it('mismo chargeId con plan distinto SÍ reprocesa (cambio de plan legítimo)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: USER_ID, email: 'a@b.com', name: 'A', plan: 'FREE', lastChargeId: 'CH-1',
    })
    mockedPrisma.user.update.mockResolvedValueOnce({ id: USER_ID, plan: 'PRO' })

    const result = await activatePlan(USER_ID, 'PRO', 'CH-1')

    expect((result as any).alreadyProcessed).toBeUndefined()
    expect(mockedPrisma.user.update).toHaveBeenCalled()
  })

  it('usuario inexistente → null', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null)
    expect(await activatePlan('fantasma', 'PRO', 'CH-x')).toBeNull()
  })
})
