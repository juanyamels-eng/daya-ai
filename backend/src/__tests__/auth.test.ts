import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    apiToken: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('../services/email', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPlanUpgradeEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('dns', () => ({
  promises: { resolveMx: vi.fn().mockResolvedValue([{ exchange: 'mx.gmail.com', priority: 1 }]) },
}))

import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { register, login } from '../controllers/authController'
import { signToken } from '../controllers/authController'
import { requireAuth } from '../middleware/auth'

const mockedPrisma = prisma as unknown as Record<string, any>

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}
function makeReq(body: unknown): Request {
  return { body } as unknown as Request
}

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret'
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('login (integración auth)', () => {
  it('rechaza payload inválido con 400', async () => {
    const res = makeRes()
    await login(makeReq({ email: 'no-es-un-email', password: '' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('devuelve mensaje genérico si el usuario no existe', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null)
    const res = makeRes()
    await login(makeReq({ email: 'nadie@test.com', password: 'secreto123' }), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Email o contraseña incorrectos.' })
  })

  it('guía a cuentas creadas con Google (sin passwordHash)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1', email: 'g@test.com', passwordHash: null,
    })
    const res = makeRes()
    await login(makeReq({ email: 'G@Test.com', password: 'x' }), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect((res.json as any).mock.calls[0][0].error).toContain('Google')
  })

  it('rechaza contraseña incorrecta sin revelar cuál es el fallo', async () => {
    const hash = await bcrypt.hash('correcta123', 4)
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1', email: 'u@test.com', passwordHash: hash,
    })
    const res = makeRes()
    await login(makeReq({ email: 'u@test.com', password: 'incorrecta999' }), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Email o contraseña incorrectos.' })
  })

  it('login correcto devuelve token JWT válido y datos del usuario', async () => {
    const hash = await bcrypt.hash('correcta123', 4)
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'u42', name: 'Ana', email: 'ana@test.com', plan: 'FREE',
      emailVerified: true, passwordHash: hash,
    })
    const res = makeRes()
    await login(makeReq({ email: 'ana@test.com', password: 'correcta123' }), res)
    expect(res.status).not.toHaveBeenCalledWith(401)
    const body = (res.json as any).mock.calls[0][0]
    const decoded = jwt.verify(body.token, 'test-secret') as { userId: string }
    expect(decoded.userId).toBe('u42')
    expect(body.user.email).toBe('ana@test.com')
  })
})

describe('register (integración auth)', () => {
  it('rechaza contraseñas menores de 8 caracteres', async () => {
    const res = makeRes()
    await register(makeReq({ name: 'Ana', email: 'a@real.com', password: 'corta' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('rechaza dominios desechables antes de tocar DNS ni BD', async () => {
    const res = makeRes()
    await register(makeReq({ name: 'Ana', email: 'a@mailinator.com', password: 'larga12345' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('rechaza correos ya registrados con 409', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existe' })
    const res = makeRes()
    await register(makeReq({ name: 'Ana', email: 'dup@gmail.com', password: 'larga12345' }), res)
    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('registra con hash bcrypt y devuelve token', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null)
    mockedPrisma.user.create.mockImplementationOnce(async ({ data }: any) => ({
      id: 'nuevo', ...data,
      profile: {},
    }))
    const res = makeRes()
    await register(makeReq({ name: 'Ana', email: 'nueva@gmail.com', password: 'larga12345' }), res)
    expect(res.status).toHaveBeenCalledWith(201)
    const created = mockedPrisma.user.create.mock.calls[0][0].data
    expect(created.passwordHash).not.toBe('larga12345')
    expect(await bcrypt.compare('larga12345', created.passwordHash)).toBe(true)
    const body = (res.json as any).mock.calls[0][0]
    expect(jwt.verify(body.token, 'test-secret')).toBeTruthy()
  })
})

describe('requireAuth (middleware)', () => {
  function run(token?: string) {
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction
    return { req, res, next }
  }

  it('401 sin cabecera Authorization', async () => {
    const { req, res, next } = run()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('acepta un JWT válido y setea req.userId', async () => {
    const { req, res, next } = run(signToken('user-9'))
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
    expect((req as any).userId).toBe('user-9')
  })

  it('rechaza un token expirado', async () => {
    const expired = jwt.sign({ userId: 'u1' }, 'test-secret', { expiresIn: '-10s' })
    const { req, res, next } = run(expired)
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rechaza un JWT firmado con otra clave', async () => {
    const forged = jwt.sign({ userId: 'u1' }, 'clave-mala', { expiresIn: '1h' })
    const { req, res, next } = run(forged)
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('token de API dy_ válido autentica por hash sha256', async () => {
    const raw = 'dy_' + 'a'.repeat(32)
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    mockedPrisma.apiToken.findUnique.mockResolvedValueOnce({ id: 't1', userId: 'api-user', tokenHash })
    const { req, res, next } = run(raw)
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
    expect((req as any).userId).toBe('api-user')
  })

  it('token de API desconocido → 401', async () => {
    mockedPrisma.apiToken.findUnique.mockResolvedValueOnce(null)
    const { req, res, next } = run('dy_' + 'b'.repeat(32))
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})
