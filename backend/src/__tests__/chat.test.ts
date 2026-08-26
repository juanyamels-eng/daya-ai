import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    conversation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'conv-1', ...data })),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    message: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('../services/openrouter', () => ({
  chatStream: vi.fn(),
  chatSingle: vi.fn().mockResolvedValue(''),
  chatChainStream: vi.fn(),
}))

vi.mock('../services/memory', () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue('system'),
}))

vi.mock('../services/modelSelector', () => ({
  classifyMessage: vi.fn().mockResolvedValue({ task: 'general' }),
  selectBestModel: vi.fn().mockReturnValue('test-model'),
  selectChain: vi.fn().mockReturnValue(null),
}))

vi.mock('../services/quota', () => ({
  resolveEffectivePlan: vi.fn().mockResolvedValue('FREE'),
  resetUsageIfDue: vi.fn().mockResolvedValue(undefined),
  consumeQuota: vi.fn().mockResolvedValue({ ok: true }),
  refundQuota: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/monitoring', () => ({
  checkGlobalBudget: vi.fn().mockReturnValue(true),
}))

import { prisma } from '../lib/prisma'
import { chatStream } from '../services/openrouter'
import { sendMessage } from '../controllers/chatController'

const mockedPrisma = prisma as unknown as Record<string, any>

function makeSSERes() {
  const chunks: string[] = []
  const res: any = {
    headersSent: false,
    writableEnded: false,
    written: chunks,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((s: string) => { chunks.push(s); return true }),
    end: vi.fn(() => { res.writableEnded = true }),
    flush: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    socket: { setNoDelay: vi.fn(), setTimeout: vi.fn() },
    on: vi.fn(),
  }
  return res as Response & { written: string[] }
}

function makeReq(message: string): Request {
  return { userId: 'user-1', body: { message }, on: vi.fn() } as unknown as Request
}

function events(res: ReturnType<typeof makeSSERes>) {
  return res.written.map((raw) => JSON.parse(raw.replace(/^data: /, '').trim()))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedPrisma.user.findUnique.mockResolvedValue({
    id: 'user-1', plan: 'FREE', messagesUsed: 0, messagesLimit: 30, usageResetAt: new Date(),
  })
})

function assistantCreates() {
  return mockedPrisma.message.create.mock.calls.filter((c: any[]) => c[0]?.data?.role === 'assistant')
}

describe('sendMessage — streaming SSE', () => {
  it('rechaza mensaje vacío con 400 antes de abrir el stream', async () => {
    const res = makeSSERes()
    await sendMessage(makeReq('   '), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.setHeader).not.toHaveBeenCalled()
  })

  it('rechaza usuario inexistente con 404', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null)
    const res = makeSSERes()
    await sendMessage(makeReq('hola'), res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('bloquea con 429 al alcanzar el límite del plan (sin abrir stream)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1', plan: 'FREE', messagesUsed: 30, messagesLimit: 30, usageResetAt: new Date(),
    })
    const res = makeSSERes()
    await sendMessage(makeReq('hola'), res)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.setHeader).not.toHaveBeenCalled()
  })

  it('stream feliz: emite conversationId, model, chunks y done sin fallo', async () => {
    ;(chatStream as any).mockImplementation(async function* () {
      yield 'Hola'
      yield ' mundo'
    })
    const res = makeSSERes()
    await sendMessage(makeReq('saluda'), res)

    const evs = events(res)
    expect(evs[0]).toEqual({ conversationId: 'conv-1' })
    expect(evs.some((e) => e.chunk === 'Hola')).toBe(true)
    expect(evs.some((e) => e.chunk === ' mundo')).toBe(true)
    const done = evs.find((e) => e.done)
    expect(done.failed).toBe(false)
    // Persistió la respuesta completa como mensaje del asistente
    expect(mockedPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'assistant', content: 'Hola mundo' }) })
    )
  })

  it('proveedor LLM cae a mitad de stream: avisa error y DEVUELVE el cupo', async () => {
    ;(chatStream as any).mockImplementation(async function* () {
      yield 'Empiezo a respond'
      throw new Error('provider exploded')
    })
    const res = makeSSERes()
    await sendMessage(makeReq('pregunta'), res)

    const evs = events(res)
    expect(evs.some((e) => e.error)).toBe(true)
    expect(evs.find((e) => e.done)?.failed).toBe(true)
    // NO persiste respuesta parcial
    expect(assistantCreates()).toHaveLength(0)
    // Devuelve el cupo: reserve + refund = 2 ejecuciones raw
    expect(mockedPrisma.$executeRaw).toHaveBeenCalledTimes(2)
  })

  it('proveedor no devuelve nada: se trata como fallo y reembolsa cupo', async () => {
    ;(chatStream as any).mockImplementation(async function* () { /* stream vacío */ })
    const res = makeSSERes()
    await sendMessage(makeReq('pregunta'), res)

    const done = events(res).find((e) => e.done)
    expect(done.failed).toBe(true)
    expect(assistantCreates()).toHaveLength(0)
  })

  it('stream fallido desde el inicio emite evento error legible por el frontend', async () => {
    ;(chatStream as any).mockImplementation(async function* () {
      throw new Error('502 bad gateway del proveedor')
    })
    const res = makeSSERes()
    await sendMessage(makeReq('hola'), res)

    const evs = events(res)
    expect(evs.some((e) => e.error === 'La IA tuvo un problema al responder. Intenta de nuevo.')).toBe(true)
  })
})
