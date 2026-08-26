import rateLimit from 'express-rate-limit'
import { Request } from 'express'

const isProd = process.env.NODE_ENV === 'production'

// Límite general — generoso para uso normal del chat
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutos
  max: isProd ? 300 : 500,         // 300 en prod, 500 en dev
  message: { error: 'Demasiadas peticiones, intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',  // no limita el health check
})

// Límite estricto para autenticación — anti fuerza bruta
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutos
  max: isProd ? 10 : 20,           // 10 en prod, 20 en dev
  message: { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
  standardHeaders: true,
  legacyHeaders: false,
  // En producción, bloquear por IP + user agent para evitar evasión
  keyGenerator: (req: Request) => `${req.ip}:${req.get('user-agent') || 'unknown'}`,
  // Deshabilitar en tests
  skip: (req) => process.env.NODE_ENV === 'test',
})

// Límite para operaciones costosas (generar documentos, investigación profunda).
export const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,        // 1 hora
  max: isProd ? 20 : 40,           // 20 en prod, 40 en dev
  message: { error: 'Has generado muchos documentos en poco tiempo. Espera un momento antes de continuar.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
})

// Límite específico para pagos — muy estricto
export const paymentsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,        // 1 hora
  max: isProd ? 5 : 10,            // 5 intentos de pago/hora en prod
  message: { error: 'Demasiados intentos de pago. Espera una hora antes de volver a intentar.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
  skip: (req) => process.env.NODE_ENV === 'test',
})

// CANDADO ANTI-BOTS: límite de mensajes por MINUTO por usuario.
export const chatBurstLimiter = rateLimit({
  windowMs: 60 * 1000,             // 1 minuto
  max: parseInt(process.env.CHAT_PER_MINUTE || (isProd ? '10' : '20'), 10),
  message: { error: 'Vas demasiado rápido. Espera unos segundos antes de enviar otro mensaje.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
  skip: (req) => process.env.NODE_ENV === 'test',
})

// Límite para endpoints de administración
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 30 : 100,
  message: { error: 'Demasiadas peticiones de administración.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
  skip: (req) => process.env.NODE_ENV === 'test',
})

// Límite para webhooks (más permisivo para permitir reintentos de proveedores)
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 60 : 200,
  message: { error: 'Demasiados webhooks.' },
  standardHeaders: true,
  legacyHeaders: false,
})
