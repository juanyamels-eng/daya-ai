// ============================================
// DAYA IA — Request Timeout Middleware
// Aborts requests that take too long to prevent resource exhaustion.
// ============================================
import { Request, Response, NextFunction } from 'express'

const DEFAULT_TIMEOUT_MS = 120_000 // 2 minutes

export function requestTimeout(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Don't timeout SSE/streaming connections
    if (req.headers['accept'] === 'text/event-stream') return next()

    const timer = setTimeout(() => {
      if (!res.headersSent && !res.writableEnded) {
        res.status(504).json({ error: 'Request timeout', timeoutMs })
      }
    }, timeoutMs)

    // Clean up timer when response finishes
    res.on('finish', () => clearTimeout(timer))
    res.on('close', () => clearTimeout(timer))

    next()
  }
}
