import { prisma } from '../lib/prisma'
import { chatSingle } from './openrouter'

// ============================================
// DAYA IA - Secret Self-Improvement System
// This system is internal and not visible to users
// ============================================

// Saves formatted conversation for future training
export async function saveTrainingData(
  userId: string,
  userMessage: string,
  aiResponse: string,
  category: string,
  quality: number = 0.5
): Promise<void> {
  try {
    await prisma.trainingData.create({
      data: {
        userId,
        userMessage,
        aiResponse,
        category,
        quality,
        source: 'chat',
      }
    })
  } catch { /* silent */ }
}

// Automatically detects the message category
export async function detectCategory(message: string): Promise<string> {
  const lower = message.toLowerCase()
  if (/(código|code|función|function|bug|error|programar|python|javascript|typescript|html|css|sql)/i.test(lower)) return 'codigo'
  if (/(redactar|escribir|correo|carta|email|texto|artículo|ensayo)/i.test(lower)) return 'escritura'
  if (/(analiza|análisis|compare|diferencia|ventaja|desventaja|explica)/i.test(lower)) return 'analisis'
  if (/(matemática|calcular|ecuación|fórmula|número|estadística)/i.test(lower)) return 'matematicas'
  if (/(imagen|foto|diseño|visual|color|arte)/i.test(lower)) return 'visual'
  if (/(documento|informe|reporte|presentación|pdf|word)/i.test(lower)) return 'documentos'
  if (/(negocio|empresa|marketing|ventas|estrategia|plan)/i.test(lower)) return 'negocios'
  return 'general'
}

// Main nightly process — runs at 3am
export async function nightlyLearningProcess(): Promise<void> {
  console.log('🌙 [DAYA SECRET] Iniciando proceso nocturno de aprendizaje...')

  try {
    await Promise.all([
      analyzePatterns(),
      updateSystemInstructions(),
      scoreTrainingData(),
      cleanLowQualityData(),
      generateDailyInsights(),
      fetchInternetKnowledge(),
    ])
    console.log('✅ [DAYA SECRET] Proceso nocturno completado')
  } catch (err) {
    console.error('❌ [DAYA SECRET] Error en proceso nocturno:', err)
  }
}

// Analyzes conversation patterns from the day
async function analyzePatterns(): Promise<void> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const recentData = await prisma.trainingData.findMany({
    where: { createdAt: { gte: yesterday } },
    select: { category: true, quality: true }
  })

  const categories: Record<string, number> = {}
  recentData.forEach((d: any) => {
    categories[d.category] = (categories[d.category] || 0) + 1
  })

  const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]
  if (topCategory) {
    await prisma.dayaInsight.create({
      data: {
        type: 'top_category',
        data: JSON.stringify({ category: topCategory[0], count: topCategory[1] }),
        date: new Date(),
      }
    })
  }

  console.log('📊 [DAYA SECRET] Patrones analizados:', categories)
}

// Proposes improvements to DAYA's instructions based on what was learned.
// SECURITY: proposals are created in "pending" state and are NOT applied automatically;
// the admin approves or rejects them from the Training panel. Only the
// last APPROVED proposal gets injected into the system prompt (see
// getApprovedInstructionBlock).
async function updateSystemInstructions(): Promise<void> {
  const insights = await prisma.dayaInsight.findMany({
    where: { date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { date: 'desc' },
    take: 20
  })

  if (insights.length === 0) return

  const summary = insights.map((i: any) => `${i.type}: ${i.data}`).join('\n')

  const newInstructions = await chatSingle([{
    role: 'user',
    content: `Basándote en estos insights de uso de los últimos 7 días, genera mejoras específicas para el system prompt de una IA llamada DAYA. Sé muy concreto y práctico.

Insights:
${summary}

Responde SOLO con las mejoras en formato JSON:
{"improvements": ["mejora 1", "mejora 2", "mejora 3"]}`
  }], 'claude')

  try {
    const parsed = JSON.parse(newInstructions.replace(/```json|```/g, '').trim())
    if (!Array.isArray(parsed?.improvements) || parsed.improvements.length === 0) return
    await prisma.dayaInsight.create({
      data: {
        type: 'instruction_update',
        data: JSON.stringify({ improvements: parsed.improvements, status: 'pending' }),
        date: new Date(),
      }
    })
    console.log('[DAYA SECRET] Propuesta de instrucciones creada (pendiente de aprobación):', parsed.improvements)
  } catch { /* continuar */ }
}

// ── Approved instructions → system prompt ────────────────────────────────────
// Returns the block from the LAST proposal approved by the admin (or '' if there
// is none). 60s cache: buildSystemPrompt runs on every chat message.
let instrCache: { at: number; block: string } | null = null

export function invalidateInstructionCache(): void { instrCache = null }

export async function getApprovedInstructionBlock(): Promise<string> {
  if (instrCache && Date.now() - instrCache.at < 60_000) return instrCache.block
  let block = ''
  try {
    const rows = await prisma.dayaInsight.findMany({
      where: { type: 'instruction_update' },
      orderBy: { date: 'desc' },
      take: 10,
    })
    for (const r of rows) {
      try {
        const d = JSON.parse(r.data)
        // Old proposals (flat array, no status) are never applied.
        if (d?.status === 'approved' && Array.isArray(d.improvements) && d.improvements.length) {
          block = '\nMejoras de comportamiento aprobadas por el equipo (aplícalas siempre):\n'
            + d.improvements.map((x: string) => `- ${x}`).join('\n') + '\n'
          break
        }
      } catch { /* corrupt row: skip */ }
    }
  } catch { /* no DB: no block */ }
  instrCache = { at: Date.now(), block }
  return block
}

// Scores the quality of training data
async function scoreTrainingData(): Promise<void> {
  const unscored = await prisma.trainingData.findMany({
    where: { quality: 0.5 },
    take: 100
  })

  for (const item of unscored) {
    let score = 0.5

    // Longer and more detailed responses = better quality
    if (item.aiResponse.length > 500) score += 0.1
    if (item.aiResponse.length > 1000) score += 0.1

    // Responses with code = high technical quality
    if (item.aiResponse.includes('```')) score += 0.15

    // Responses with structure = better quality
    if (item.aiResponse.includes('\n')) score += 0.05

    // Penalize very short responses
    if (item.aiResponse.length < 100) score -= 0.2

    // Bonus for positive user feedback
    if (item.userFeedback === 1) score += 0.25
    if (item.userFeedback === -1) score -= 0.3

    score = Math.max(0, Math.min(1, score))

    await prisma.trainingData.update({
      where: { id: item.id },
      data: { quality: score }
    })
  }

  console.log(`⭐ [DAYA SECRET] ${unscored.length} datos puntuados`)
}

// Removes low quality data to avoid contaminating training
async function cleanLowQualityData(): Promise<void> {
  const deleted = await prisma.trainingData.deleteMany({
    where: {
      quality: { lt: 0.2 },
      createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  })
  console.log(`🗑️ [DAYA SECRET] ${deleted.count} datos de baja calidad eliminados`)
}

// Generates daily system insights
async function generateDailyInsights(): Promise<void> {
  const totalData = await prisma.trainingData.count()
  const highQuality = await prisma.trainingData.count({ where: { quality: { gte: 0.7 } } })
  const totalUsers = await prisma.user.count()

  await prisma.dayaInsight.create({
    data: {
      type: 'daily_stats',
      data: JSON.stringify({ totalData, highQuality, totalUsers, date: new Date().toISOString() }),
      date: new Date(),
    }
  })

  console.log(`📈 [DAYA SECRET] Stats: ${totalData} datos totales, ${highQuality} alta calidad, ${totalUsers} usuarios`)
}

// Fetches internet knowledge to enrich training
async function fetchInternetKnowledge(): Promise<void> {
  const topics = [
    'últimas noticias tecnología inteligencia artificial',
    'tendencias programación 2024',
    'novedades ciencia investigación'
  ]

  for (const topic of topics) {
    try {
      const knowledge = await chatSingle([{
        role: 'user',
        content: `Resume en 3 puntos clave las últimas tendencias sobre: "${topic}". Solo los puntos más importantes y recientes. Formato JSON: {"topic": "...", "points": ["punto1", "punto2", "punto3"]}`
      }], 'flash') // Gemini tiene acceso a info más reciente

      const parsed = JSON.parse(knowledge.replace(/```json|```/g, '').trim())
      await prisma.dayaInsight.create({
        data: {
          type: 'internet_knowledge',
          data: JSON.stringify(parsed),
          date: new Date(),
        }
      })
      } catch { /* continue with next topic */ }
  }

  console.log('🌐 [DAYA SECRET] Conocimiento de internet actualizado')
}

// Records user feedback (👍 = 1, 👎 = -1)
export async function saveFeedback(trainingId: string, feedback: 1 | -1): Promise<void> {
  await prisma.trainingData.update({
    where: { id: trainingId },
    data: { userFeedback: feedback }
  })
}

// Gets training system statistics (admin only)
export async function getTrainingStats() {
  const [total, highQuality, byCategory, recentInsights] = await Promise.all([
    prisma.trainingData.count(),
    prisma.trainingData.count({ where: { quality: { gte: 0.7 } } }),
    prisma.trainingData.groupBy({ by: ['category'], _count: true }),
    prisma.dayaInsight.findMany({ orderBy: { date: 'desc' }, take: 10 })
  ])

  return { total, highQuality, byCategory, recentInsights, readyForFineTuning: total >= 500 }
}
