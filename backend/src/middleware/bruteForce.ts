// ============================================
// DAYA IA — Brute Force Protection
// Blocks IPs/users after N failed login attempts.
// Uses in-memory store with configurable TTL.
// ============================================

interface AttemptRecord {
  count: number
  firstAttempt: number
  lastAttempt: number
  blockedUntil?: number
}

const records = new Map<string, AttemptRecord>()

const CONFIG = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,   // 15 min window
  lockoutMs: 30 * 60 * 1000,   // 30 min lockout
}

function getKey(type: 'ip' | 'email', value: string): string {
  return `bf:${type}:${value}`
}

export function recordFailedAttempt(type: 'ip' | 'email', value: string): { blocked: boolean; remaining: number; retryAfterMs: number } {
  const key = getKey(type, value)
  const now = Date.now()
  const record = records.get(key)

  if (record?.blockedUntil && now < record.blockedUntil) {
    return { blocked: true, remaining: 0, retryAfterMs: record.blockedUntil - now }
  }

  if (!record || now - record.firstAttempt > CONFIG.windowMs) {
    records.set(key, { count: 1, firstAttempt: now, lastAttempt: now })
    return { blocked: false, remaining: CONFIG.maxAttempts - 1, retryAfterMs: 0 }
  }

  record.count++
  record.lastAttempt = now

  if (record.count >= CONFIG.maxAttempts) {
    record.blockedUntil = now + CONFIG.lockoutMs
    console.warn(`[brute-force] Blocked ${type}:${value} for ${CONFIG.lockoutMs / 1000}s after ${record.count} attempts`)
    return { blocked: true, remaining: 0, retryAfterMs: CONFIG.lockoutMs }
  }

  return { blocked: false, remaining: CONFIG.maxAttempts - record.count, retryAfterMs: 0 }
}

export function recordSuccessfulAttempt(type: 'ip' | 'email', value: string): void {
  records.delete(getKey(type, value))
}

export function isBlocked(type: 'ip' | 'email', value: string): { blocked: boolean; retryAfterMs: number } {
  const key = getKey(type, value)
  const record = records.get(key)
  if (!record?.blockedUntil) return { blocked: false, retryAfterMs: 0 }
  if (Date.now() < record.blockedUntil) return { blocked: true, retryAfterMs: record.blockedUntil - Date.now() }
  records.delete(key)
  return { blocked: false, retryAfterMs: 0 }
}

// Clean up expired records every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of records) {
    if (record.blockedUntil && now > record.blockedUntil) records.delete(key)
    else if (now - record.firstAttempt > CONFIG.windowMs * 2) records.delete(key)
  }
}, 5 * 60 * 1000).unref()
