// ============================================
// DAYA IA — Modo Agente: POST /api/agent/run
// Recibe el mensaje del usuario (y algo de historial) y deja que DAYA resuelva la
// tarea encadenando herramientas. Devuelve la respuesta + los pasos que dio.
//
// Esta ruta hace AHORA lo mismo que el chat normal con el intercambio: lo guarda
// en una conversación y lo cobra al plan. Antes no hacía ninguna de las dos:
//   · Nada se persistía. El frontend pintaba la respuesta en memoria y al
//     recargar la página el trabajo del agente desaparecía sin dejar rastro, ni
//     en el chat ni en el historial de la barra lateral.
//   · No se descontaba del cupo de mensajes. El chat sí lo comprueba, así que el
//     Modo Agente era la puerta de atrás del plan: mensajes ilimitados y encima
//     con el modelo caro.
// El camino es el MISMO que el de controllers/chatController.ts a propósito
// (misma reserva atómica, mismo texto de error, mismo titulado): dos caminos
// parecidos pero distintos es como se llega a que un usuario tenga dos cupos.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { heavyLimiter } from '../../middleware/rateLimiter'
import { prisma } from '../../lib/prisma'
import { PLANS } from '../../config/plans'
import { resolveEffectivePlan, resetUsageIfDue } from '../../services/quota'
import { checkGlobalBudget } from '../../services/monitoring'
import { cleanFallbackTitle, generateSmartTitle } from '../../controllers/chatController'
import { MODELS } from '../../services/openrouter'
import { runAgent, AgentStep } from './agent'

const router = Router()
router.use(requireAuth)

/* Devuelve el mensaje reservado. Se llama en CUALQUIER salida que no entregue
   respuesta: sin esto, un fallo del agente le costaba un mensaje al usuario. */
const devolverMensaje = (userId: string) =>
  prisma.$executeRaw`
    UPDATE "User" SET "messagesUsed" = GREATEST("messagesUsed" - 1, 0)
    WHERE id = ${userId}::"text"
  `.catch(() => {})

/* La línea de herramientas se compone AQUÍ y no en el navegador, porque el
   mensaje guardado y el que se ve en pantalla tienen que ser el mismo texto:
   si cada lado lo arma por su cuenta, al recargar la conversación cambia. */
const componer = (steps: AgentStep[], answer: string) => {
  const usadas = Array.isArray(steps) && steps.length
    ? `_Herramientas usadas: ${steps.map(s => s.tool).join(' → ')}_\n\n`
    : ''
  return usadas + (answer || 'No pude completar la tarea.')
}

router.post('/run', heavyLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const message = String(req.body?.message || '').trim()
  const conversationId = String(req.body?.conversationId || '').trim() || null
  const history = Array.isArray(req.body?.history)
    ? req.body.history
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-8)
        .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
    : []
  if (!message) return res.status(400).json({ error: 'Falta el mensaje.' })

  try {
    // ── 1. Cupo del plan ──────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, plan: true, messagesUsed: true, messagesLimit: true, usageResetAt: true, planExpiresAt: true },
    })
    if (!user) return res.status(401).json({ error: 'Sesión no válida.' })

    // Si el plan de pago venció, se calcula el cupo como FREE (igual que el chat).
    const effectivePlan = await resolveEffectivePlan(user as any)
    ;(user as any).plan = effectivePlan
    await resetUsageIfDue(user as any)

    const planCfg = (PLANS as any)[effectivePlan] || PLANS.FREE
    const periodTxt = planCfg.limitPeriod === 'day' ? 'diario' : 'mensual'

    // Reserva ATÓMICA: se incrementa solo si queda cupo, en la misma sentencia.
    // Con un check y luego un update, dos peticiones a la vez pasan las dos.
    const reservado = await prisma.$executeRaw`
      UPDATE "User" SET "messagesUsed" = "messagesUsed" + 1
      WHERE id = ${userId}::"text" AND "messagesUsed" < "messagesLimit"
    `
    if ((reservado as number) === 0) {
      return res.status(429).json({ error: `Alcanzaste tu límite ${periodTxt} de mensajes. Mejora tu plan para continuar.` })
    }

    // Tope global de gasto de la plataforma.
    if (!checkGlobalBudget()) {
      await devolverMensaje(userId)
      return res.status(503).json({ error: 'El servicio está temporalmente saturado. Intenta de nuevo más tarde.' })
    }

    // ── 2. Conversación ───────────────────────────────────────────────────
    // Filtrada por userId: sin eso, pasar el id de otro escribiría en su chat.
    let conversation = conversationId
      ? await prisma.conversation.findFirst({ where: { id: conversationId, userId } })
      : null
    const esPrimerIntercambio = !conversation

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId, title: cleanFallbackTitle(message), model: 'auto', mode: 'SINGLE' },
      })
    }

    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', content: message.slice(0, 8000) },
    })

    // ── 3. El agente trabaja ──────────────────────────────────────────────
    let result
    try {
      result = await runAgent(userId, message, history)
    } catch (e: any) {
      await devolverMensaje(userId)
      console.error('[agent] error:', e?.message || e)
      return res.status(500).json({ error: 'El agente no pudo completar la tarea. Intenta de nuevo.', conversationId: conversation.id })
    }

    // Respuesta vacía = no se entregó nada: se devuelve el mensaje al cupo.
    if (!result?.answer?.trim()) {
      await devolverMensaje(userId)
      return res.status(502).json({ error: 'El agente terminó sin respuesta. Intenta de nuevo.', conversationId: conversation.id })
    }

    const content = componer(result.steps, result.answer)

    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: content.slice(0, 8000), model: MODELS.claude },
    })

    // ── 4. Título y orden del historial ───────────────────────────────────
    // Mismo trato que el chat: solo en el primer intercambio, con margen de 6 s
    // para el modelo barato, y solo si el título sigue siendo el provisional
    // (el usuario ha podido renombrar el chat mientras el agente trabajaba).
    let title: string | undefined
    if (esPrimerIntercambio) {
      title = await Promise.race([
        generateSmartTitle(message, result.answer).catch(() => cleanFallbackTitle(message)),
        new Promise<string>(resolve => setTimeout(() => resolve(cleanFallbackTitle(message)), 6000)),
      ])
      await prisma.conversation.updateMany({
        where: { id: conversation.id, title: cleanFallbackTitle(message) },
        data: { title },
      }).catch(() => {})
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    }).catch(() => {})

    res.json({
      success: true,
      answer: result.answer,
      steps: result.steps,
      content,
      conversationId: conversation.id,
      ...(title ? { title } : {}),
    })
  } catch (e: any) {
    console.error('[agent] error:', e?.message || e)
    res.status(500).json({ error: 'El agente no pudo completar la tarea. Intenta de nuevo.' })
  }
})

export default router
