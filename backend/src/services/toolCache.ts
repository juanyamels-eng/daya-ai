// ============================================
// DAYA IA — Tool Result Cache
// Caches tool execution results by input hash.
// Prevents re-executing expensive tools with the same arguments.
// ============================================
import crypto from 'crypto'

interface CacheEntry {
  result: string
  timestamp: number
  hits: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const MAX_ENTRIES = 500

function hashInput(tool: string, args: Record<string, unknown>, userId: string): string {
  const key = `${userId}:${tool}:${JSON.stringify(args, Object.keys(args).sort())}`
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
}

export function getCachedToolResult(tool: string, args: Record<string, unknown>, userId: string): string | null {
  const key = hashInput(tool, args, userId)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key)
    return null
  }
  entry.hits++
  return entry.result
}

export function setCachedToolResult(tool: string, args: Record<string, unknown>, userId: string, result: string): void {
  const key = hashInput(tool, args, userId)
  // Evict oldest if full
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { result, timestamp: Date.now(), hits: 0 })
}

export function getToolCacheStats() {
  let totalHits = 0
  let validEntries = 0
  const now = Date.now()
  for (const [, entry] of cache) {
    if (now - entry.timestamp <= TTL_MS) {
      validEntries++
      totalHits += entry.hits
    }
  }
  return { entries: validEntries, totalHits }
}
