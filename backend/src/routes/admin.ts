import { Router, Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { getTrainingStats } from '../services/training'
import { nightlyLearningProcess } from '../services/training'
import { prisma } from '../lib/prisma'
import { PLANS, PlanId, getMessageLimit } from '../config/plans'
import { adminLimiter } from '../middleware/rateLimiter'
import { auditLog } from '../services/auditLog'

const router = Router()

// Registra una acción de administración en el audit log (best-effort).
// No hay userId de sesión (el panel entra por clave), así que se firma como 'admin'.
function auditAdmin(req: Request, details: Record<string, unknown>, success = true) {
  auditLog({ userId: 'admin', action: 'admin.action', ip: req.ip, details, success }).catch(() => {})
}

// Apply admin rate limiter to all admin routes
router.use(adminLimiter)

// Middleware: solo el dueño de DAYA puede acceder.
// SEGURIDAD: si ADMIN_SECRET_KEY no está configurada, se DENIEGA todo (antes,
// con la variable vacía, undefined === undefined dejaba pasar a cualquiera).
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.ADMIN_SECRET_KEY
  const adminKey = req.headers['x-admin-key']
  if (!configured || !adminKey || adminKey !== configured) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  next()
}

// GET /api/admin/stats - Panel secreto de estadísticas
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [trainingStats, userStats, conversationStats] = await Promise.all([
      getTrainingStats(),
      prisma.user.groupBy({ by: ['plan'], _count: true }),
      prisma.conversation.count(),
    ])

    const totalUsers = await prisma.user.count()
    const todayUsers = await prisma.user.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } }
    })

    res.json({
      training: trainingStats,
      users: { total: totalUsers, today: todayUsers, byPlan: userStats },
      conversations: conversationStats,
      message: trainingStats.readyForFineTuning
        ? '🚀 ¡Listo para fine-tuning! Tienes suficientes datos.'
        : `📊 Necesitas ${500 - trainingStats.total} conversaciones más para fine-tuning`
    })
  } catch {
    res.status(500).json({ error: 'Error al obtener estadísticas' })
  }
})

// POST /api/admin/run-learning - Ejecutar proceso nocturno manualmente
router.post('/run-learning', requireAdmin, async (req, res) => {
  res.json({ message: 'Proceso de aprendizaje iniciado en background' })
  nightlyLearningProcess()
})

// GET /api/admin/model-health - Última alerta de modelos muertos en OpenRouter.
// POST con ?run=1 no hace falta: el POST re-chequea contra el catálogo en vivo.
router.get('/model-health', requireAdmin, async (req, res) => {
  try {
    const { getModelHealthAlert } = await import('../services/modelCatalog')
    const alert = await getModelHealthAlert()
    res.json({ ok: !alert || alert.deadModels.length === 0, alert })
  } catch {
    res.status(500).json({ error: 'No se pudo leer la salud de modelos' })
  }
})

// POST /api/admin/model-health - Fuerza el chequeo AHORA (refresca el catálogo
// de OpenRouter y verifica todos los IDs en uso). Devuelve el resultado.
router.post('/model-health', requireAdmin, async (req, res) => {
  try {
    const { refreshModelCatalog, getModelHealthAlert } = await import('../services/modelCatalog')
    await refreshModelCatalog()
    const alert = await getModelHealthAlert()
    res.json({ ok: !alert || alert.deadModels.length === 0, alert })
  } catch {
    res.status(500).json({ error: 'No se pudo ejecutar el chequeo de modelos' })
  }
})

// PATCH /api/system/instruction/:id - Aprueba o rechaza una propuesta de mejora
// de instrucciones generada por el aprendizaje nocturno. Solo lo APROBADO llega
// al system prompt del chat (getApprovedInstructionBlock).
router.patch('/instruction/:id', requireAdmin, async (req, res) => {
  const { action } = req.body as { action?: string }
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action debe ser approve o reject' })
  }
  try {
    const row = await prisma.dayaInsight.findUnique({ where: { id: req.params.id } })
    if (!row || row.type !== 'instruction_update') {
      return res.status(404).json({ error: 'Propuesta no encontrada' })
    }
    let parsed: { improvements?: unknown[] } | unknown[] = {}
    try { parsed = JSON.parse(row.data) } catch {}
    const improvements = Array.isArray(parsed) ? parsed : (parsed.improvements || [])
    const status = action === 'approve' ? 'approved' : 'rejected'
    await prisma.dayaInsight.update({
      where: { id: row.id },
      data: { data: JSON.stringify({ improvements, status, decidedAt: new Date().toISOString() }) },
    })
    const { invalidateInstructionCache } = await import('../services/training')
    invalidateInstructionCache()
    auditAdmin(req, { op: 'instruction.decide', id: row.id, status })
    res.json({ success: true, status })
  } catch {
    res.status(500).json({ error: 'No se pudo actualizar la propuesta' })
  }
})

// GET /api/admin/insights - Ver insights generados
router.get('/insights', requireAdmin, async (req, res) => {
  try {
    const insights = await prisma.dayaInsight.findMany({
      orderBy: { date: 'desc' },
      take: 50
    })
    res.json(insights)
  } catch {
    res.status(500).json({ error: 'Error al obtener insights' })
  }
})

// GET /api/admin/training-data - Ver datos de entrenamiento
router.get('/training-data', requireAdmin, async (req, res) => {
  try {
    const { category, minQuality = '0.7', page = '1' } = req.query
    // Validación: evita NaN en skip si llega un page no numérico (?page=abc)
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const skip = (pageNum - 1) * 20
    const minQ = parseFloat(minQuality as string)
    const qualityGte = Number.isFinite(minQ) ? minQ : 0.7

    const data = await prisma.trainingData.findMany({
      where: {
        ...(category ? { category: category as string } : {}),
        quality: { gte: qualityGte }
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      skip
    })

    const total = await prisma.trainingData.count({
      where: { quality: { gte: qualityGte } }
    })

    res.json({ data, total, pages: Math.ceil(total / 20) })
  } catch {
    res.status(500).json({ error: 'Error al obtener datos de entrenamiento' })
  }
})

// POST /api/admin/export-training - Exportar datos para fine-tuning
router.post('/export-training', requireAdmin, async (req, res) => {
  try {
    const highQualityData = await prisma.trainingData.findMany({
      where: { quality: { gte: 0.7 }, usedInTraining: false },
      orderBy: { quality: 'desc' }
    })

    // Formato JSONL para fine-tuning con Llama/OpenAI
    const jsonl = highQualityData.map((d) => JSON.stringify({
      messages: [
        { role: 'system', content: 'Eres DAYA, una asistente de IA avanzada, empática e inteligente.' },
        { role: 'user', content: d.userMessage },
        { role: 'assistant', content: d.aiResponse }
      ]
    })).join('\n')

    // Marcar como usados
    await prisma.trainingData.updateMany({
      where: { id: { in: highQualityData.map((d) => d.id) } },
      data: { usedInTraining: true }
    })

    res.setHeader('Content-Type', 'application/jsonl')
    res.setHeader('Content-Disposition', 'attachment; filename="daya-training-data.jsonl"')
    res.send(jsonl)
  } catch {
    res.status(500).json({ error: 'Error al exportar datos de entrenamiento' })
  }
})

// GET /api/system/users - Lista todos los usuarios
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, plan: true, messagesUsed: true, messagesLimit: true, createdAt: true }
    })
    res.json({ users, total: users.length })
  } catch {
    res.status(500).json({ error: 'Error al obtener usuarios' })
  }
})

// PATCH /api/system/users/:id - Editar usuario
router.patch('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { plan, messagesLimit } = req.body
    // El plan debe ser uno válido; el límite se deriva de la config central
    // de planes (única fuente de verdad) para no desincronizarse con plans.ts.
    if (plan && !PLANS[plan as PlanId]) {
      return res.status(400).json({ error: 'Plan inválido' })
    }
    const data: Prisma.UserUncheckedUpdateInput = {}
    if (plan) {
      data.plan = plan
      data.messagesLimit = typeof messagesLimit === 'number' ? messagesLimit : getMessageLimit(plan as PlanId)
    } else if (typeof messagesLimit === 'number') {
      data.messagesLimit = messagesLimit
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' })
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data })
    auditAdmin(req, { op: 'user.update', targetUserId: req.params.id, changes: data })
    res.json(user)
  } catch (error) {
    // P2025 = registro no encontrado
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' })
    res.status(500).json({ error: 'Error al actualizar usuario' })
  }
})

// DELETE /api/system/users/:id - Eliminar usuario
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } })
    auditAdmin(req, { op: 'user.delete', targetUserId: req.params.id })
    res.json({ success: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' })
    res.status(500).json({ error: 'Error al eliminar usuario' })
  }
})

export default router
