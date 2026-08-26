import { prisma } from '../../lib/prisma'
import { PLANS } from '../../config/plans'
import { resolveEffectivePlan, resetUsageIfDue, consumeQuota, refundQuota } from '../quota'
import { checkGlobalBudget } from '../monitoring'

export interface QuotaCheckResult {
  ok: boolean
  error?: string
  /** Código HTTP que corresponde al fallo: 404 usuario inexistente, 429 cupo agotado/saturado */
  status?: number
  periodTxt?: string
  planCfg?: any
  effectivePlan?: string
}

export interface QuotaReservationResult {
  reserved: boolean
  error?: string
}

export async function checkAndReserveQuota(userId: string): Promise<QuotaCheckResult & { reservation: QuotaReservationResult }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, plan: true, messagesUsed: true, messagesLimit: true, usageResetAt: true, planExpiresAt: true },
  })
  if (!user) return { ok: false, status: 404, error: 'Usuario no encontrado', reservation: { reserved: false } }

  const effectivePlan = await resolveEffectivePlan(user as any)
  ;(user as any).plan = effectivePlan
  await resetUsageIfDue(user as any)

  const planCfg = (PLANS as any)[effectivePlan] || PLANS.FREE
  const periodTxt = planCfg.limitPeriod === 'day' ? 'diario' : 'mensual'

  if (user.messagesUsed >= user.messagesLimit) {
    return { ok: false, error: `Alcanzaste tu límite ${periodTxt} de mensajes. Mejora tu plan para continuar.`, periodTxt, planCfg, effectivePlan, reservation: { reserved: false } }
  }

  const reserved = await prisma.$executeRaw`
    UPDATE "User" SET "messagesUsed" = "messagesUsed" + 1
    WHERE id = ${userId}::"text" AND "messagesUsed" < "messagesLimit"
  `
  if ((reserved as number) === 0) {
    return { ok: false, error: `Alcanzaste tu límite ${periodTxt} de mensajes. Mejora tu plan para continuar.`, periodTxt, planCfg, effectivePlan, reservation: { reserved: false } }
  }

  if (!checkGlobalBudget()) {
    await refundMessageQuota(userId)
    return { ok: false, error: 'El servicio está temporalmente saturado. Intenta de nuevo más tarde.', periodTxt, planCfg, effectivePlan, reservation: { reserved: false } }
  }

  return { ok: true, periodTxt, planCfg, effectivePlan, reservation: { reserved: true } }
}

export async function refundMessageQuota(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User" SET "messagesUsed" = GREATEST("messagesUsed" - 1, 0)
    WHERE id = ${userId}::"text"
  `.catch(() => {})
}

export async function handleSearchQuota(userId: string, triggered: boolean): Promise<{ triggered: boolean; exhausted: boolean }> {
  if (!triggered) return { triggered: false, exhausted: false }
  const { consumeQuota } = await import('../quota')
  const q = await consumeQuota(userId, 'search')
  if (!q.ok) return { triggered: false, exhausted: true }
  return { triggered: true, exhausted: false }
}

export async function refundSearchQuota(userId: string): Promise<void> {
  const { refundQuota } = await import('../quota')
  await refundQuota(userId, 'search')
}