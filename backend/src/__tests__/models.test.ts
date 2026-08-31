import { describe, it, expect } from 'vitest'
import { ModelCache } from '../shared/services/models'

describe('ModelCache', () => {
  it('stores and retrieves a value', () => {
    const cache = new ModelCache()
    cache.set('gpt-4', 'hola', { ok: true })
    expect(cache.get('gpt-4', 'hola')).toEqual({ ok: true })
    cache.destroy()
  })

  it('returns null on a miss', () => {
    const cache = new ModelCache()
    expect(cache.get('gpt-4', 'no-existe')).toBeNull()
    cache.destroy()
  })

  it('expires entries after the TTL', async () => {
    const cache = new ModelCache()
    cache.set('gpt-4', 'hola', { ok: true }, 1)
    await new Promise((r) => setTimeout(r, 10))
    expect(cache.get('gpt-4', 'hola')).toBeNull()
    cache.destroy()
  })

  it('evicts the oldest entry when full', () => {
    const cache = new ModelCache(1000, 2)
    cache.set('m', 'a', 1)
    cache.set('m', 'b', 2)
    cache.set('m', 'c', 3)
    expect(cache.get('m', 'a')).toBeNull()
    expect(cache.get('m', 'b')).toBe(2)
    expect(cache.get('m', 'c')).toBe(3)
    cache.destroy()
  })

  it('clear resets the cache and stats', () => {
    const cache = new ModelCache()
    cache.set('m', 'a', 1)
    cache.clear()
    expect(cache.get('m', 'a')).toBeNull()
    expect(cache.getStats().size).toBe(0)
    cache.destroy()
  })

  it('tracks hits and misses', () => {
    const cache = new ModelCache()
    cache.get('m', 'x')
    cache.set('m', 'x', 1)
    cache.get('m', 'x')
    const stats = cache.getStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(1)
    cache.destroy()
  })
})
