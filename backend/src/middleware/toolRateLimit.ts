// ============================================
// DAYA IA — Per-Tool Rate Limiter
// Different limits for different tools based on cost/risk.
// Prevents abuse of expensive tools (web search, image gen)
// while allowing cheap tools (calculate, memory) freely.
// ============================================
import { Request, Response, NextFunction } from 'express'

interface ToolLimit {
  windowMs: number
  max: number
  label: string
}

const TOOL_LIMITS: Record<string, ToolLimit> = {
  // Expensive — restrictive
  buscar_web:             { windowMs: 60_000,  max: 5,   label: 'web search' },
  generar_imagen:         { windowMs: 60_000,  max: 3,   label: 'image generation' },
  resumir_video_youtube:  { windowMs: 60_000,  max: 5,   label: 'youtube summary' },
  browse_page:            { windowMs: 60_000,  max: 10,  label: 'browser navigation' },
  autonomous_browse:      { windowMs: 60_000,  max: 3,   label: 'autonomous browse' },
  sandbox_execute:        { windowMs: 60_000,  max: 10,  label: 'sandbox execution' },

  // Moderate
  leer_url:               { windowMs: 60_000,  max: 15,  label: 'url read' },
  crear_tarea:            { windowMs: 60_000,  max: 20,  label: 'task creation' },
  crear_documento:        { windowMs: 60_000,  max: 10,  label: 'document creation' },

  // Cheap — generous
  calcular:               { windowMs: 60_000,  max: 60,  label: 'calculator' },
  buscar_en_documentos:   { windowMs: 60_000,  max: 30,  label: 'document search' },
  crear_nota:             { windowMs: 60_000,  max: 30,  label: 'note creation' },
}

// In-memory counters: key -> { count, resetAt }
const counters = new Map<string, { count: number; resetAt: number }>()

function getKey(userId: string | undefined, tool: string): string {
  return `${userId}:${tool}`
}

function checkLimit(userId: string | undefined, tool: string): { allowed: boolean; remaining: number; resetMs: number } {
  const limit = TOOL_LIMITS[tool]
  if (!limit) return { allowed: true, remaining: 999, resetMs: 0 }

  const key = getKey(userId, tool)
  const now = Date.now()
  const entry = counters.get(key)

  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + limit.windowMs })
    return { allowed: true, remaining: limit.max - 1, resetMs: limit.windowMs }
  }

  entry.count++
  if (entry.count > limit.max) {
    return { allowed: false, remaining: 0, resetMs: entry.resetAt - now }
  }
  return { allowed: true, remaining: limit.max - entry.count, resetMs: entry.resetAt - now }
}

// Versión reutilizable fuera de Express (agente, orquestador, workflows):
// devuelve el veredicto sin tocar req/res. Devuelve null si la tool no tiene límite.
export function checkToolLimit(userId: string | undefined, toolName: string): { allowed: boolean; remaining: number; resetMs: number; message?: string } {
  const { allowed, remaining, resetMs } = checkLimit(userId, toolName)
  if (allowed) return { allowed, remaining, resetMs }
  const limit = TOOL_LIMITS[toolName]
  return {
    allowed,
    remaining,
    resetMs,
    message: `Límite de ${limit.label} alcanzado (${limit.max}/${Math.ceil(limit.windowMs / 1000)}s). Intenta más tarde.`,
  }
}

// Middleware: attach to specific tool routes
export function toolRateLimit(toolName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId || req.ip
    const result = checkToolLimit(userId, toolName)

    res.setHeader('X-RateLimit-Remaining', String(result.remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)))

    if (!result.allowed) {
      res.status(429).json({
        error: result.message,
        retryAfterMs: result.resetMs,
      })
      return
    }
    next()
  }
}

export function getToolRateLimits() {
  return TOOL_LIMITS
}

// Clean up expired counters every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of counters) {
    if (now > entry.resetAt) counters.delete(key)
  }
}, 5 * 60 * 1000).unref()
