import { describe, it, expect, vi } from 'vitest'
import { sanitizeBody } from '../middleware/sanitize'
import type { Request, Response } from 'express'

function makeReq(body: unknown, query: unknown = {}): Request {
  return { body, query, is: () => false } as unknown as Request
}
function makeRes(): Response {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), headersSent: false } as unknown as Response
  return res
}
function mockNext() {}

describe('sanitizeBody', () => {
  it('passes through empty body', () => {
    const req = makeReq(undefined)
    const next = vi.fn()
    sanitizeBody(req, makeRes(), next)
    expect(next).toHaveBeenCalled()
  })
  it('strips script tags from strings', () => {
    const req = makeReq({ name: '<script>alert(1)</script>Hello' })
    const next = vi.fn()
    sanitizeBody(req, makeRes(), next)
    expect(req.body.name).not.toContain('<script')
    expect(req.body.name).toContain('Hello')
  })
  it('strips javascript: URLs', () => {
    const req = makeReq({ url: 'javascript:alert(1)' })
    const next = vi.fn()
    sanitizeBody(req, makeRes(), next)
    expect(req.body.url).not.toContain('javascript:')
  })
  it('strips eval() calls', () => {
    const req = makeReq({ code: 'eval("malicious")' })
    const next = vi.fn()
    sanitizeBody(req, makeRes(), next)
    expect(req.body.code).not.toContain('eval(')
  })
  it('truncates long strings', () => {
    const longStr = 'a'.repeat(60000)
    const req = makeReq({ text: longStr })
    const next = vi.fn()
    sanitizeBody(req, makeRes(), next)
    expect(req.body.text.length).toBeLessThanOrEqual(50000)
  })
  it('sanitizes nested objects', () => {
    const req = makeReq({ nested: { deep: '<script>xss</script>ok' } })
    const next = vi.fn()
    sanitizeBody(req, makeRes(), next)
    expect(req.body.nested.deep).not.toContain('<script')
  })
  it('sanitizes query parameters', () => {
    const req = makeReq({}, { q: '<script>hack</script>search' })
    const next = vi.fn()
    sanitizeBody(req, makeRes(), next)
    expect(req.query.q).not.toContain('<script')
  })
})
