// ============================================
// DAYA IA — Auth por TOKEN DE API (para el CLI "DAYA Code" y scripts externos)
// El cliente manda Authorization: Bearer dy_xxx. Guardamos solo el hash sha256 del
// token (ver features/apitokens), así que aquí hasheamos el entrante y buscamos.
// ============================================
import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'

const db = prisma

export async function requireApiToken(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(dy_[A-Za-z0-9_-]+)$/)
  if (!m) return res.status(401).json({ error: 'Falta un token de API de DAYA (Authorization: Bearer dy_...).' })

  try {
    const tokenHash = crypto.createHash('sha256').update(m[1]).digest('hex')
    const token = await db.apiToken.findFirst({ where: { tokenHash }, select: { id: true, userId: true } })
    if (!token) return res.status(401).json({ error: 'Token de API inválido o revocado.' })

    req.userId = token.userId
    // Marca de uso (sin bloquear la petición si falla).
    db.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
    next()
  } catch {
    res.status(500).json({ error: 'No se pudo validar el token.' })
  }
}
