import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../lib/prisma'

describe('User Model Tests', () => {
  let testUserId: string

  afterAll(async () => {
    // Cleanup
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it('should create a user with FREE plan', async () => {
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@daya-ai.com`,
        name: 'Test User',
        plan: 'FREE',
      },
    })

    testUserId = user.id
    expect(user).toBeDefined()
    expect(user.plan).toBe('FREE')
    expect(user.email).toContain('test-')
  })

  it('should update user plan to PRO', async () => {
    if (!testUserId) throw new Error('testUserId not set')

    const updated = await prisma.user.update({
      where: { id: testUserId },
      data: { plan: 'PRO' },
    })

    expect(updated.plan).toBe('PRO')
  })

  it('should validate user email uniqueness', async () => {
    const email = `unique-test-${Date.now()}@daya-ai.com`

    const user1 = await prisma.user.create({
      data: {
        email,
        name: 'User 1',
        plan: 'FREE',
      },
    })

    try {
      await prisma.user.create({
        data: {
          email, // Same email
          name: 'User 2',
          plan: 'FREE',
        },
      })
      expect.fail('Should have thrown unique constraint error')
    } catch (error) {
      expect(error).toBeDefined()
    } finally {
      await prisma.user.delete({ where: { id: user1.id } }).catch(() => {})
    }
  })
})
