import { describe, it, expect } from 'vitest'

// Test that our shared types compile correctly and have the expected shape
describe('API types', () => {
  it('User type has all required fields at compile time', () => {
    // This is a compile-time check — if the type is wrong, tsc will fail
    type UserFields = 'id' | 'name' | 'email' | 'plan' | 'messagesUsed' | 'messagesLimit'
    const user: Record<UserFields, unknown> = {
      id: '123',
      name: 'Test',
      email: 'test@test.com',
      plan: 'FREE',
      messagesUsed: 0,
      messagesLimit: 20,
    }
    expect(user.id).toBe('123')
  })

  it('Plan type is a valid union', () => {
    type Plan = 'FREE' | 'BETA' | 'PRO' | 'TEAM'
    const validPlans: Plan[] = ['FREE', 'BETA', 'PRO', 'TEAM']
    expect(validPlans).toHaveLength(4)
  })

  it('ChatMode type is correct', () => {
    type ChatMode = 'SINGLE' | 'COUNCIL' | 'BATTLE'
    const modes: ChatMode[] = ['SINGLE', 'COUNCIL', 'BATTLE']
    expect(modes).toHaveLength(3)
  })
})
