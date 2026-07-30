import rateLimit from 'express-rate-limit'

// Límite general — generoso para uso normal del chat
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutos
  max: 500,                         // 500 peticiones por ventana (uso intenso normal)
  message: { error: 'Demasiadas peticiones, intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',  // no limita el health check
})

// Límite estricto para autenticación — anti fuerza bruta
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutos
  max: 20,                          // 20 intentos de login/registro por ventana
  message: { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Límite para operaciones costosas (generar documentos, investigación profunda).
// Protege tu factura de IA: estas operaciones consumen mucho más que un chat normal.
export const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,        // 1 hora
  max: 40,                          // 40 documentos/investigaciones por hora por usuario
  message: { error: 'Has generado muchos documentos en poco tiempo. Espera un momento antes de continuar.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
})

// CANDADO ANTI-BOTS: límite de mensajes por MINUTO por usuario.
// Un humano no manda 20 mensajes en 60 segundos; un bot sí. Esto los congela
// automáticamente sin afectar el uso normal. Configurable con CHAT_PER_MINUTE.
export const chatBurstLimiter = rateLimit({
  windowMs: 60 * 1000,             // 1 minuto
  max: parseInt(process.env.CHAT_PER_MINUTE || '20', 10),
  message: { error: 'Vas demasiado rápido. Espera unos segundos antes de enviar otro mensaje.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => (typeof req.userId === 'string' && req.userId) ? req.userId : (req.ip || 'anon'),
})
