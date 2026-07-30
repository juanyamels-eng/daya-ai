import { nightlyLearningProcess } from './training'
import { refreshModelCatalog, applyStoredOverrides } from './modelCatalog'

// Scheduler simple sin dependencias externas
export function startScheduler(): void {
  console.log('⏰ Scheduler de DAYA iniciado')

  // Reaplica los cambios de modelo que ya se habían decidido: tras un despliegue
  // el código vuelve a los IDs escritos a mano, que pueden llevar días muertos.
  // Esto los corrige ya, sin esperar al refresco del catálogo.
  applyStoredOverrides().catch(() => {})

  // Revisa el catálogo de OpenRouter al arrancar (espera 20s a que todo cargue)
  setTimeout(() => { refreshModelCatalog() }, 20 * 1000)

  let lastCatalogDay = -1
  let lastLearningDay = -1
  let lastAuditDay = -1
  let lastExpiryDay = -1

  // Revisa cada minuto si es hora de correr los procesos programados
  setInterval(async () => {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const day = now.getDate()

    // Proceso nocturno de aprendizaje a las 3:00 AM (1 vez al día).
    // Ventana de 10 minutos para sobrevivir reinicios de Railway a esa hora.
    if (hour === 3 && minute < 10 && day !== lastLearningDay) {
      lastLearningDay = day
      await nightlyLearningProcess()
    }

    // Auto-actualización del catálogo de modelos: 1 vez al día (4:00 AM)
    if (hour === 4 && minute < 10 && day !== lastCatalogDay) {
      lastCatalogDay = day
      await refreshModelCatalog()
    }

    // Auditoría de memoria a las 3:30 AM (1 vez al día) para usuarios activos
    if (hour === 3 && minute >= 30 && minute < 40 && day !== lastAuditDay) {
      lastAuditDay = day
      const { prisma } = await import('../lib/prisma')
      const { auditMemories } = await import('../features/memoryskills/memorySkills')
      const users = await prisma.user.findMany({
        where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        select: { id: true },
        take: 50,
      }).catch(() => [])
      for (const u of users) await auditMemories(u.id).catch(() => {})
    }

    // Caducidad de planes: baja a FREE los planes de pago vencidos (2:00 AM).
    // Red de seguridad: la caducidad también se aplica al vuelo cuando el usuario
    // usa el chat/imágenes/Studio, pero esto cubre a quien no entra.
    if (hour === 2 && minute < 10 && day !== lastExpiryDay) {
      lastExpiryDay = day
      const { prisma } = await import('../lib/prisma')
      const { PLANS } = await import('../config/plans')
      await prisma.user.updateMany({
        where: { plan: { in: ['PRO'] as any }, planExpiresAt: { lt: new Date() } },
        data: { plan: 'FREE' as any, messagesLimit: PLANS.FREE.messageLimit },
      }).catch(() => {})
    }

    // Worker en segundo plano y automatizaciones programadas (cada minuto)
    const { runWorkerTick } = await import('../features/worker/backgroundWorker')
    await runWorkerTick().catch(() => {})
    const { runDueAutomations } = await import('../features/automations/engine')
    await runDueAutomations().catch(() => {})

  }, 60 * 1000) // cada minuto
}
