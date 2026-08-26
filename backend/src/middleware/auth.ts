import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'

const db = prisma

// Autenticación: acepta tanto un JWT de sesión como un token de API (prefijo "dy_").
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  const token = authHeader.slice(7)

  // ── Token de API (acceso programático) ──
  if (token.startsWith('dy_')) {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const record = await db.apiToken.findUnique({ where: { tokenHash } })
      if (!record) return res.status(401).json({ error: 'Token de API inválido' })
      // Marca último uso (sin bloquear la petición)
      db.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
      req.userId = record.userId
      return next()
    } catch {
      return res.status(401).json({ error: 'Token de API inválido' })
    }
  }

  // ── JWT de sesión (comportamiento original) ──
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}
