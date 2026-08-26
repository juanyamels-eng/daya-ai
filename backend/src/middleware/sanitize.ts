// ============================================
// DAYA IA — Input Sanitization Middleware
// Strips dangerous characters, enforces length limits,
// and prevents injection in request bodies/queries.
// ============================================
import { Request, Response, NextFunction } from 'express'
import type { ParsedQs } from 'qs'

const MAX_BODY_SIZE = 1024 * 1024 // 1MB
const MAX_STRING_LENGTH = 50000
const MAX_ARRAY_DEPTH = 5

// Patterns that indicate injection attempts
const DANGEROUS_PATTERNS = [
  /\$\{.*\}/g,           // Template literal injection
  /<script[\s>]/gi,       // XSS script tags
  /javascript:/gi,        // javascript: URLs
  /on\w+\s*=/gi,          // Inline event handlers
  /data:text\/html/gi,    // data: URLs
  /eval\s*\(/gi,          // eval() calls
  /expression\s*\(/gi,    // CSS expression()
  /\bexec\s*\(/gi,        // exec() calls
  /\bSystem\b.*\beval\b/gi, // System.eval
]

function sanitizeString(value: string): string {
  let clean = value
  for (const pattern of DANGEROUS_PATTERNS) {
    clean = clean.replace(pattern, '')
  }
  return clean.slice(0, MAX_STRING_LENGTH)
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_ARRAY_DEPTH) return '[DEPTH_LIMIT]'
  if (typeof value === 'string') return sanitizeString(value)
  if (Array.isArray(value)) return value.map(v => sanitizeValue(v, depth + 1))
  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      clean[sanitizeString(k)] = sanitizeValue(v, depth + 1)
    }
    return clean
  }
  return value
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  // Skip raw body routes (webhooks)
  if (req.is('text/plain') || req.is('application/octet-stream')) return next()

  const bodySize = JSON.stringify(req.body || {}).length
  if (bodySize > MAX_BODY_SIZE) {
    _res.status(413).json({ error: 'Request body too large' })
    return
  }

  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body)
  }

  // Sanitize query params
  if (req.query && typeof req.query === 'object') {
    const sanitized: ParsedQs = {}
    for (const [k, v] of Object.entries(req.query)) {
      sanitized[k] = typeof v === 'string' ? sanitizeString(v) : v
    }
    req.query = sanitized
  }

  next()
}
