// ============================================
// DAYA IA — Structured Logger (Pino)
// Replaces console.log/error/warn with structured JSON logging.
// In development, uses pino-pretty for human-readable output.
// ============================================
import pino from 'pino'
import type { Request, Response, NextFunction } from 'express'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } : undefined,
  base: { service: 'daya-api' },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
})

// Convenience child loggers for different subsystems
export function childLogger(component: string, extra?: Record<string, unknown>) {
  return logger.child({ component, ...extra })
}

// Request-scoped logger middleware
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  const start = Date.now()
  _res.on('finish', () => {
    const duration = Date.now() - start
    const level = _res.statusCode >= 500 ? 'error' : _res.statusCode >= 400 ? 'warn' : 'info'
    logger[level]({
      method: req.method,
      url: req.originalUrl,
      status: _res.statusCode,
      duration,
      userId: req.userId || req.headers?.['x-user-id'],
      ip: req.ip,
    }, `${req.method} ${req.originalUrl} ${_res.statusCode} ${duration}ms`)
  })
  next()
}
