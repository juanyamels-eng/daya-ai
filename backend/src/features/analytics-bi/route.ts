import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'

const db = prisma as any
const router = Router()

// ============================================
// BUSINESS INTELLIGENCE DASHBOARD
// ============================================

// Revenue metrics
router.get('/revenue', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { period = '30d' } = req.query

  // Check admin
  const isAdmin = await isAdminUser(userId)
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [payments, subscriptions] = await Promise.all([
    db.payment.aggregate({
      where: { createdAt: { gte: startDate }, status: 'completed' },
      _sum: { amount: true },
      _count: true,
    }),
    db.user.groupBy({
      by: ['plan'],
      _count: true,
    }),
  ])

  const mrr = subscriptions.reduce((acc: number, s: any) => {
    const price = s.plan === 'PRO' ? 20 : s.plan === 'TEAM' ? 50 : 0
    return acc + (price * s._count)
  }, 0)

  res.json({
    revenue: {
      total: payments._sum.amount || 0,
      transactions: payments._count,
      mrr,
      arr: mrr * 12,
    },
    subscriptions: subscriptions.map((s: any) => ({
      plan: s.plan,
      count: s._count,
    })),
  })
})

// User analytics
router.get('/users', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { period = '30d' } = req.query

  const isAdmin = await isAdminUser(userId)
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [totalUsers, newUsers, activeUsers, usersByPlan] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: startDate } } }),
    db.user.count({ where: { updatedAt: { gte: dayAgo } } }),
    db.user.groupBy({ by: ['plan'], _count: true }),
  ])

  // Growth rate
  const previousPeriodStart = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000)
  const previousNewUsers = await db.user.count({
    where: { createdAt: { gte: previousPeriodStart, lt: startDate } },
  })
  const growthRate = previousNewUsers > 0 ? ((newUsers - previousNewUsers) / previousNewUsers) * 100 : 0

  res.json({
    users: {
      total: totalUsers,
      new: newUsers,
      active: activeUsers,
      growthRate: Math.round(growthRate * 10) / 10,
    },
    byPlan: usersByPlan.map((p: any) => ({ plan: p.plan, count: p._count })),
  })
})

// Feature usage analytics
router.get('/features', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { period = '30d' } = req.query

  const isAdmin = await isAdminUser(userId)
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await db.analyticsEvent.groupBy({
    by: ['eventType'],
    where: { createdAt: { gte: startDate } },
    _count: true,
    orderBy: { _count: { eventType: 'desc' } },
  })

  // Daily active users trend
  const dailyActive = await db.$queryRaw`
    SELECT DATE("createdAt") as date, COUNT(DISTINCT "userId") as active
    FROM "AnalyticsEvent"
    WHERE "createdAt" >= ${startDate}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

  res.json({
    features: events.map((e: any) => ({
      name: e.eventType,
      count: e._count,
    })),
    dailyActiveUsers: dailyActive,
  })
})

// Churn analytics
router.get('/churn', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { period = '30d' } = req.query

  const isAdmin = await isAdminUser(userId)
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Users who downgraded or cancelled
  const [downgrades, cancellations] = await Promise.all([
    db.user.count({
      where: {
        planExpiresAt: { gte: startDate },
        plan: 'FREE',
      },
    }),
    db.user.count({
      where: {
        planExpiresAt: { gte: startDate },
        messagesUsed: 0,
      },
    }),
  ])

  const totalUsers = await db.user.count()
  const churnRate = totalUsers > 0 ? ((downgrades + cancellations) / totalUsers) * 100 : 0

  res.json({
    churn: {
      downgrades,
      cancellations,
      rate: Math.round(churnRate * 10) / 10,
    },
  })
})

// API usage metrics
router.get('/api-usage', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { period = '24h' } = req.query

  const isAdmin = await isAdminUser(userId)
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const hours = period === '1h' ? 1 : period === '7d' ? 168 : 24
  const startDate = new Date(Date.now() - hours * 60 * 60 * 1000)

  const [totalCalls, errorRate, avgLatency] = await Promise.all([
    db.analyticsEvent.count({
      where: {
        eventType: 'api_call',
        createdAt: { gte: startDate },
      },
    }),
    db.analyticsEvent.aggregate({
      where: {
        eventType: 'api_call',
        metadata: { path: ['error'], equals: true },
        createdAt: { gte: startDate },
      },
      _count: true,
    }),
    db.$queryRaw`
      SELECT AVG(("metadata"->>'latency')::numeric) as avg_latency
      FROM "AnalyticsEvent"
      WHERE "eventType" = 'api_call'
        AND "createdAt" >= ${startDate}
    `,
  ])

  const errorRatePercent = totalCalls > 0 ? (errorRate._count / totalCalls) * 100 : 0

  res.json({
    api: {
      totalCalls,
      errorRate: Math.round(errorRatePercent * 10) / 10,
      avgLatency: avgLatency[0]?.avg_latency || 0,
    },
  })
})

// Export analytics as CSV
router.get('/export', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { format = 'csv' } = req.query

  const isAdmin = await isAdminUser(userId)
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const metrics = await db.dailyMetric.findMany({
    orderBy: { date: 'desc' },
    take: 90,
  })

  if (format === 'csv') {
    const headers = 'Date,Total Users,Active Users,New Signups,Messages,Revenue\n'
    const rows = metrics.map((m: any) =>
      `${m.date.toISOString().split('T')[0]},${m.totalUsers},${m.activeUsers},${m.newSignups},${m.messagesSent},${m.revenue}`
    ).join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv')
    res.send(headers + rows)
  } else {
    res.json({ metrics })
  }
})

async function isAdminUser(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId } })
  return user?.plan === 'PRO' || user?.plan === 'TEAM'
}

export default router
