import { prisma } from './lib/prisma'

const db = prisma as any

async function seed() {
  console.log('🌱 Seeding database...')

  // Create a demo user (if not exists)
  const demoEmail = 'demo@daya.ai'
  const existingUser = await db.user.findUnique({ where: { email: demoEmail } }).catch(() => null)

  if (!existingUser) {
    await db.user.create({
      data: {
        email: demoEmail,
        name: 'Demo User',
        passwordHash: '$2a$10$placeholder', // bcrypt of 'demo123'
        messagesUsed: 0,
        messagesLimit: 1000,
      },
    }).catch(() => {})
    console.log('  ✓ Demo user created (demo@daya.ai)')
  } else {
    console.log('  → Demo user already exists')
  }

  // Create sample MCP server config
  const configKey = 'mcp_servers'
  const existing = await db.dayaSystemConfig.findUnique({ where: { key: configKey } }).catch(() => null)
  if (!existing) {
    await db.dayaSystemConfig.create({
      data: { key: configKey, value: JSON.stringify([]) },
    }).catch(() => {})
    console.log('  ✓ MCP servers config initialized')
  }

  // Create sample prompt template
  const promptKey = 'prompt:system_prompt'
  const existingPrompt = await db.dayaSystemConfig.findUnique({ where: { key: promptKey } }).catch(() => null)
  if (!existingPrompt) {
    const defaultPrompt = {
      id: 'pv_default',
      name: 'system_prompt',
      version: 1,
      content: 'Eres DAYA, un asistente de IA personal. Responde de forma clara y útil.',
      trafficPercent: 100,
      isActive: true,
      metrics: { calls: 0, avgResponseLength: 0, avgLatencyMs: 0 },
      createdAt: Date.now(),
      createdAtISO: new Date().toISOString(),
    }
    await db.dayaSystemConfig.create({
      data: { key: promptKey, value: JSON.stringify([defaultPrompt]) },
    }).catch(() => {})
    console.log('  ✓ Default prompt template created')
  }

  console.log('🌱 Seed complete!')
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
