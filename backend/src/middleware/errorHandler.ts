import { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return   // stream ya iniciado, no tocar el status

  const userId = (req as any).userId || 'anon'
  const route = `${req.method} ${req.path}`

  // Errores de validación Zod → 400 (mensaje legible para el usuario)
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
  }

  // Errores Prisma con código conocido
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Recurso no encontrado' })
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un registro con esos datos' })
    if (err.code === 'P2003') return res.status(400).json({ error: 'Referencia a recurso inexistente' })
    console.error(`[DB] ${err.code} — ${route} — user:${userId}`)
    return res.status(500).json({ error: 'Error de base de datos' })
  }

  // Prisma no puede conectar a la BD
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error(`[DB:INIT] ${route} — user:${userId}`)
    return res.status(503).json({ error: 'Servicio temporalmente no disponible' })
  }

  // Resto de errores: log completo en servidor, mensaje genérico al cliente
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd) {
    console.error(`[ERROR] ${route} — user:${userId} — ${err.message}`)
  } else {
    console.error(`[ERROR] ${route} — user:${userId}`, err)
  }

  res.status(500).json({
    error: isProd ? 'Error interno del servidor' : err.message,
  })
}
