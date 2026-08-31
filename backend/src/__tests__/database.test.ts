import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../lib/prisma'
import { DB_AVAILABLE } from './dbAvailable'

describe.skipIf(!DB_AVAILABLE)('Database Connection', () => {
  beforeAll(async () => {
    // Ensure connection
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('should connect to database successfully', async () => {
    const result = await prisma.$queryRaw`SELECT 1`
    expect(result).toBeDefined()
  })

  it('should count users in database', async () => {
    const count = await prisma.user.count()
    expect(typeof count).toBe('number')
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('should validate User model schema', async () => {
    // This test ensures the Prisma client is properly generated
    const userFields = Object.keys(prisma.user.fields || {})
    expect(userFields.length).toBeGreaterThan(0)
    expect(userFields).toContain('id')
    expect(userFields).toContain('email')
    expect(userFields).toContain('plan')
  })
})
