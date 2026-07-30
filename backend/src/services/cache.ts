// Cache inteligente - reduce costos de OpenRouter hasta 40%
const cache = new Map<string, { response: string; timestamp: number; hits: number }>()
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 horas
const MAX_CACHE_SIZE = 1000

export function getCachedResponse(message: string): string | null {
  const key = normalizeMessage(message)
  const cached = cache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) { cache.delete(key); return null }
  cached.hits++
  return cached.response
}

export function setCachedResponse(message: string, response: string): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Eliminar el menos usado
    let leastUsed = ''
    let minHits = Infinity
    cache.forEach((v, k) => { if (v.hits < minHits) { minHits = v.hits; leastUsed = k } })
    if (leastUsed) cache.delete(leastUsed)
  }
  const key = normalizeMessage(message)
  cache.set(key, { response, timestamp: Date.now(), hits: 1 })
}

function normalizeMessage(msg: string): string {
  return msg.toLowerCase().trim().replace(/\s+/g, ' ')
}

export function getCacheStats() {
  return { size: cache.size, maxSize: MAX_CACHE_SIZE }
}
