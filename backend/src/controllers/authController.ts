import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { promises as dns } from 'dns'
import { prisma } from '../lib/prisma'
import { sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail } from '../services/email'
import { isBlocked, recordFailedAttempt, recordSuccessfulAttempt } from '../middleware/bruteForce'
import { auditLog } from '../services/auditLog'

// IP del cliente para el control de fuerza bruta (respeta proxy si está configurado)
function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

// Dominios de correo temporal/desechable más comunes — no se permite registrar con ellos
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'getnada.com', 'trashmail.com', 'sharklasers.com',
  'maildrop.cc', 'mintemail.com', 'mohmal.com', 'fakeinbox.com', 'tempmailo.com', 'dispostable.com',
  'emailondeck.com', 'spamgourmet.com', 'mailnesia.com', 'inboxbear.com', 'tmpmail.net', 'tempr.email',
])

// Verifica que el dominio del correo EXISTA y pueda recibir correo (registros MX por DNS).
// Esto distingue un correo real (gmail.com, outlook.com, dominios de empresa) de uno
// inventado (algo@inventado123.com). Falla "abierto" si el DNS no responde, para no
// bloquear a usuarios legítimos por un problema temporal de red.
async function emailDomainIsReal(email: string): Promise<{ ok: boolean; reason?: string }> {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain || !domain.includes('.')) return { ok: false, reason: 'El correo no es válido.' }
  if (DISPOSABLE_DOMAINS.has(domain)) return { ok: false, reason: 'No se permiten correos temporales o desechables. Usa un correo real.' }
  try {
    const lookup = dns.resolveMx(domain)
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('dns-timeout')), 4000))
    const mx = await Promise.race([lookup, timeout]) as { exchange: string }[]
    if (!mx || mx.length === 0) return { ok: false, reason: 'Ese dominio de correo no existe o no puede recibir correos. Revisa que esté bien escrito.' }
    return { ok: true }
  } catch (e) {
    // Sin registros MX → dominio no recibe correo → correo falso
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { ok: false, reason: 'Ese dominio de correo no existe. Revisa que esté bien escrito.' }
    }
    // Timeout u otro error de DNS: no bloqueamos al usuario (fail-open)
    return { ok: true }
  }
}

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(50),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

// Vigencia del token. Por defecto 3650d (sesión "infinita", el diseño actual).
// Se puede acortar sin tocar código con la variable JWT_EXPIRES_IN (ej. "90d").
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '3650d'

export function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] })
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Datos inválidos' })
  }
  const { name, password } = parsed.data
  const email = parsed.data.email.toLowerCase().trim()

  // Verifica que el correo sea REAL (dominio con servidores de correo) y no desechable
  const realCheck = await emailDomainIsReal(email)
  if (!realCheck.ok) return res.status(400).json({ error: realCheck.reason })

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'Este correo ya tiene una cuenta. Inicia sesión.' })

  const passwordHash = await bcrypt.hash(password, 12)
  const verifyToken = crypto.randomBytes(32).toString('hex')
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
  const user = await prisma.user.create({
    data: { name, email, passwordHash, verifyToken, verifyExpires, profile: { create: { language: 'es' } } }
  })
  const token = signToken(user.id)
  sendVerificationEmail(email, name, verifyToken).catch(() => {})
  sendWelcomeEmail(email, name).catch(() => {})
  auditLog({ userId: user.id, action: 'auth.register', ip: clientIp(req), success: true }).catch(() => {})
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan, emailVerified: false } })
}

// Verifica el correo con el token del email
export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Token requerido' })
  const user = await prisma.user.findFirst({
    where: { verifyToken: token, verifyExpires: { gt: new Date() } },
  })
  if (!user) return res.status(400).json({ error: 'El enlace de verificación expiró o no es válido.' })
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verifyToken: null, verifyExpires: null },
  })
  res.json({ success: true, message: 'Correo verificado correctamente' })
}

// Reenvía el correo de verificación al usuario autenticado
export async function resendVerification(req: Request, res: Response) {
  const userId = req.userId
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
  if (user.emailVerified) return res.json({ success: true, message: 'Tu correo ya está verificado' })
  const verifyToken = crypto.randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { id: userId },
    data: { verifyToken, verifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  })
  sendVerificationEmail(user.email, user.name, verifyToken).catch(() => {})
  res.json({ success: true, message: 'Correo de verificación reenviado' })
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Datos inválidos' })
  const email = parsed.data.email.toLowerCase().trim()
  const { password } = parsed.data
  const ip = clientIp(req)

  // Protección contra fuerza bruta: bloqueo por IP y por cuenta tras N fallos
  const ipBlock = isBlocked('ip', ip)
  const emailBlock = isBlocked('email', email)
  if (ipBlock.blocked || emailBlock.blocked) {
    const retryAfterMs = Math.max(ipBlock.retryAfterMs, emailBlock.retryAfterMs)
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000))
    return res.status(429).json({ error: `Demasiados intentos fallidos. Inténtalo de nuevo en ${Math.ceil(retryAfterMs / 60000)} minutos.` })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  // Mensaje genérico para no revelar si el email existe (evita enumeración de cuentas)
  const GENERIC = 'Email o contraseña incorrectos.'
  if (!user) {
    recordFailedAttempt('ip', ip)
    return res.status(401).json({ error: GENERIC })
  }

  // Cuenta creada con Google (sin contraseña): guiar al usuario al método correcto
  if (!user.passwordHash) {
    return res.status(401).json({ error: 'Esta cuenta usa acceso con Google. Inicia sesión con Google.' })
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    const fail = recordFailedAttempt('email', email)
    recordFailedAttempt('ip', ip)
    if (fail.blocked) {
      res.setHeader('Retry-After', Math.ceil(fail.retryAfterMs / 1000))
      return res.status(429).json({ error: `Demasiados intentos fallidos. Cuenta bloqueada temporalmente ${Math.ceil(fail.retryAfterMs / 60000)} minutos.` })
    }
    return res.status(401).json({ error: GENERIC })
  }

  // Login correcto: limpia los contadores de fallos de IP y cuenta
  recordSuccessfulAttempt('ip', ip)
  recordSuccessfulAttempt('email', email)
  auditLog({ userId: user.id, action: 'auth.login', ip, success: true }).catch(() => {})

  const token = signToken(user.id)
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan, emailVerified: user.emailVerified } })
}

export async function me(req: Request, res: Response) {
  const userId = req.userId
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, plan: true, messagesUsed: true, messagesLimit: true, avatarUrl: true, emailVerified: true, createdAt: true, profile: true }
  })
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
  // Usa el avatar del usuario o el del perfil (Google) como respaldo
  const avatarUrl = user.avatarUrl || user.profile?.avatarUrl || null
  res.json({ ...user, avatarUrl })
}

// ============================================
// RECUPERACIÓN DE ACCESO
// ============================================

// Paso 1: solicitar recuperación — genera token y envía email
export async function forgotPassword(req: Request, res: Response) {
  const email = (req.body.email || '').toLowerCase().trim()
  if (!email) return res.status(400).json({ error: 'Email requerido' })

  const user = await prisma.user.findUnique({ where: { email } })

  // Por seguridad respondemos igual exista o no el usuario (no revelamos cuentas)
  if (!user) {
    return res.json({ success: true, message: 'Si el email existe, recibirás instrucciones.' })
  }

  // Token aleatorio que expira en 1 hora
  const resetToken = crypto.randomBytes(32).toString('hex')
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000)

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetExpires },
  })

  sendPasswordResetEmail(email, user.name, resetToken).catch(() => {})

  res.json({ success: true, message: 'Si el email existe, recibirás instrucciones.' })
}

// Paso 2: validar token y establecer la nueva contraseña
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body
  if (!token) return res.status(400).json({ error: 'Token requerido' })
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' })
  }

  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetExpires: { gt: new Date() } },
  })

  if (!user) {
    return res.status(400).json({ error: 'El enlace expiró o no es válido. Solicita uno nuevo.' })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetExpires: null },
  })
  auditLog({ userId: user.id, action: 'auth.password_reset', ip: clientIp(req), success: true }).catch(() => {})

  const authToken = signToken(user.id)
  res.json({
    success: true,
    token: authToken,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
  })
}
