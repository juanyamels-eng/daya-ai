import rateLimit from 'express-rate-limit'
import { Request } from 'express'

const isProd = process.env.NODE_ENV === 'production'

// Helper: valor desde env (entero) con fallback.
// Permite afinar cada límite por entorno sin tocar código (ver scripts/k6/).
function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

// Límite general — generoso para uso normal del chat
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutos
  max: envInt('RATE_LIMIT_GENERAL_MAX', isProd ? 300 : 500),
  message: { error: 'Demasiadas peticiones, intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',  // no limita el health check
})

// Límite estricto para autenticación — anti fuerza bruta
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutos
  max: envInt('RATE_LIMIT_AUTH_MAX', isProd ? 10 : 20),
  message: { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
  standardHeaders: true,
  legacyHeaders: false,
  // En producción, bloquear por IP + user agent para evitar evasión
  keyGenerator: (req: Request) => `${req.ip}:${req.get('user-agent') || 'unknown'}`,
  // Deshabilitar en tests
  skip: () => process.env.NODE_ENV === 'test',
})

// Límite para operaciones costosas (generar documentos, investigación profunda).
export const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,        // 1 hora
  max: envInt('RATE_LIMIT_HEAVY_MAX', isProd ? 20 : 40),
  message: { error: 'Has generado muchos documentos en poco tiempo. Espera un momento antes de continuar.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
})

// Límite específico para pagos — muy estricto
export const paymentsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,        // 1 hora
  max: envInt('RATE_LIMIT_PAYMENTS_MAX', isProd ? 5 : 10),
  message: { error: 'Demasiados intentos de pago. Espera una hora antes de volver a intentar.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
  skip: () => process.env.NODE_ENV === 'test',
})

// CANDADO ANTI-BOTS: límite de mensajes por MINUTO por usuario.
export const chatBurstLimiter = rateLimit({
  windowMs: 60 * 1000,             // 1 minuto
  max: envInt('RATE_LIMIT_CHAT_PER_MINUTE', parseInt(process.env.CHAT_PER_MINUTE || '', 10) || (isProd ? 10 : 20)),
  message: { error: 'Vas demasiado rápido. Espera unos segundos antes de enviar otro mensaje.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
  skip: () => process.env.NODE_ENV === 'test',
})

// Límite para endpoints de administración
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envInt('RATE_LIMIT_ADMIN_MAX', isProd ? 30 : 100),
  message: { error: 'Demasiadas peticiones de administración.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
  skip: () => process.env.NODE_ENV === 'test',
})

// Límite para webhooks (más permisivo para permitir reintentos de proveedores)
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt('RATE_LIMIT_WEBHOOK_MAX', isProd ? 60 : 200),
  message: { error: 'Demasiados webhooks.' },
  standardHeaders: true,
  legacyHeaders: false,
})
