import { describe, it, expect, beforeEach } from 'vitest'

// El cache distribuido (Redis) es un bonus: sin REDIS_URL debe desactivarse
// sin lanzar errores. Estos tests validan el fallback en memoria.
describe('redis — fallback sin servidor', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL
  })

  it('getRedis devuelve null sin REDIS_URL', async () => {
    const { getRedis } = await import('../services/redis')
    expect(getRedis()).toBeNull()
  })

  it('redisGet devuelve null (miss) sin Redis', async () => {
    const { redisGet } = await import('../services/redis')
    expect(await redisGet('clave')).toBeNull()
  })

  it('redisSet no lanza sin Redis', async () => {
    const { redisSet } = await import('../services/redis')
    await expect(redisSet('clave', { a: 1 }, 60)).resolves.toBeUndefined()
  })
})
