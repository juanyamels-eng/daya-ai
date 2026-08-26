// ============================================
// DAYA IA — Cuotas por recurso (imágenes, búsquedas, diseños de Studio)
// --------------------------------------------------------------------------
// Reutiliza el mismo patrón que el límite de mensajes del chat:
//   - reinicio automático por período (FREE = día, planes de pago = mes)
//   - incremento ATÓMICO (solo si queda cupo) para evitar carreras
//   - caducidad de plan: si el plan de pago venció, se baja a FREE
// Todos los contadores comparten la MISMA ventana `usageResetAt` (coherente:
// en FREE todo es diario y en planes de pago todo es mensual).
// ============================================

import { prisma } from '../lib/prisma'
import { PLANS, PlanId } from '../config/plans'

// Cada cuota → su columna en User, su campo de límite en el plan y su etiqueta.
const QUOTAS = {
  image:    { col: 'imagesUsed',    lim: 'imageLimit',  label: 'imágenes' },
  search:   { col: 'searchesUsed',  lim: 'searchLimit', label: 'búsquedas' },
  studio:   { col: 'studioUsed',    lim: 'studioLimit', label: 'diseños' },
  document: { col: 'documentsUsed', lim: 'docLimit',    label: 'documentos' },
} as const

export type QuotaKind = keyof typeof QUOTAS

interface UserUsage {
  id: string
  plan: PlanId
  planExpiresAt: Date | null
  usageResetAt: Date | null
  messagesUsed: number
  imagesUsed: number
  searchesUsed: number
  studioUsed: number
  documentsUsed: number
}

export async function resolveEffectivePlan(user: UserUsage): Promise<PlanId> {
  const plan = (user.plan || 'FREE') as PlanId
  const isPaid = plan === 'PRO'
  if (isPaid && user.planExpiresAt && new Date(user.planExpiresAt).getTime() < Date.now()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { plan: 'FREE', messagesLimit: PLANS.FREE.messageLimit },
    }).catch(() => {})
    user.plan = 'FREE'
    return 'FREE'
  }
  return plan
}

// Reinicia TODOS los contadores si ya pasó la ventana del período del plan.
export async function resetUsageIfDue(user: UserUsage): Promise<void> {
  const planCfg = PLANS[user.plan] || PLANS.FREE
  const now = new Date()
  const lastReset = user.usageResetAt ? new Date(user.usageResetAt) : new Date(0)
  const resetMs = planCfg.limitPeriod === 'day' ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
  if (now.getTime() - lastReset.getTime() >= resetMs) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        messagesUsed: 0, imagesUsed: 0, searchesUsed: 0, studioUsed: 0, documentsUsed: 0,
        messagesLimit: planCfg.messageLimit, usageResetAt: now,
      },
    })
    user.messagesUsed = 0; user.imagesUsed = 0; user.searchesUsed = 0; user.studioUsed = 0; user.documentsUsed = 0
    user.usageResetAt = now
  }
}

export interface QuotaResult {
  ok: boolean
  error?: string
}

// Consume 1 unidad de la cuota indicada. Resuelve caducidad + reinicio, luego
// incrementa atómicamente solo si queda cupo. Devuelve { ok:false, error } si
// se alcanzó el límite (el llamador responde con 429).
export async function consumeQuota(userId: string, kind: QuotaKind): Promise<QuotaResult> {
  const q = QUOTAS[kind]
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, plan: true, planExpiresAt: true, usageResetAt: true,
      messagesUsed: true, imagesUsed: true, searchesUsed: true, studioUsed: true, documentsUsed: true,
    },
  }) as UserUsage | null
  if (!user) return { ok: false, error: 'Usuario no encontrado' }

  const plan = await resolveEffectivePlan(user)
  await resetUsageIfDue(user)

  const planCfg = PLANS[plan] || PLANS.FREE
  const limit = planCfg[q.lim] as number
  const periodTxt = planCfg.limitPeriod === 'day' ? 'diario' : 'mensual'

  // Límite -1 = ilimitado (PRO en documentos): incrementa para estadística pero
  // NUNCA bloquea. Sin este caso, la fórmula atómica de abajo (col < -1) daría siempre
  // 0 filas y bloquearía a esos planes por error.
  if (limit < 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "${q.col}" = "${q.col}" + 1 WHERE id = $1::text`,
      userId
    ).catch(() => {})
    return { ok: true }
  }

  // Incremento atómico: solo si aún hay cupo (la columna está en una lista fija,
  // sin interpolar entrada del usuario → sin inyección).
  const reserved = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "${q.col}" = "${q.col}" + 1 WHERE id = $1::text AND "${q.col}" < $2`,
    userId, limit
  )
  if (Number(reserved) === 0) {
    return { ok: false, error: `Alcanzaste tu límite ${periodTxt} de ${q.label}. Mejora tu plan para continuar.` }
  }
  return { ok: true }
}

// Devuelve 1 unidad de una cuota ya consumida cuando el recurso NO se llegó a
// entregar (p.ej. la búsqueda web se cobró pero falló/dio timeout). Nunca baja de 0.
export async function refundQuota(userId: string, kind: QuotaKind): Promise<void> {
  const q = QUOTAS[kind]
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "${q.col}" = GREATEST("${q.col}" - 1, 0) WHERE id = $1::text`,
    userId
  ).catch(() => {})
}
