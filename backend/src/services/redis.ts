// ============================================
// Cliente Redis perezoso y tolerante a fallos.
//
// El cache distribuido es un BONUS, no un requisito: si no hay REDIS_URL o la
// conexión falla, todo cae al cache en memoria sin tirar errores ni bloquear.
// Por eso:
//   - `lazyConnect` + sin reintentos ni cola offline → fallback inmediato.
//   - Cada helper envuelve su llamada en try/catch silencioso.
// ============================================
import { Redis } from 'ioredis'
import { logger } from './logger'

let client: Redis | null | undefined

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (client !== undefined) return client
  try {
    const c = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null, // no reintentar: fallback rápido
    })
    c.on('error', (err) => logger.warn({ err }, 'redis error (fallback a memoria)'))
    c.connect().catch(() => { client = null })
    client = c
  } catch (err) {
    logger.warn({ err }, 'redis no disponible (fallback a memoria)')
    client = null
  }
  return client
}

// Lee un valor (JSON) con fallback silencioso. Devuelve null si no hay Redis
// o si la clave no existe o falla.
export async function redisGet<T = unknown>(key: string): Promise<T | null> {
  const r = getRedis()
  if (!r) return null
  try {
    const v = await r.get(key)
    return v == null ? null : (JSON.parse(v) as T)
  } catch {
    return null
  }
}

// Escribe un valor (JSON) con TTL en segundos. Nunca lanza.
export async function redisSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = getRedis()
  if (!r) return
  try {
    await r.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (err) {
    logger.warn({ err }, 'redis set fallido')
  }
}
