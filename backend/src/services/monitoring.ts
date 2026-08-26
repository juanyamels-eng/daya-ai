// ============================================
// DAYA IA — Monitoreo de producción
// Captura errores no manejados y un tope de gasto global de seguridad.
// Si defines SENTRY_DSN, también se puede integrar Sentry fácilmente.
// ============================================

// Contador en memoria del uso global del día (salvaguarda anti-factura).
// No reemplaza los límites por usuario; es un freno de emergencia global.
let globalDayKey = ''
let globalCount = 0

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

// Tope global de mensajes/día en toda la plataforma (freno de mano anti-factura).
// Por defecto 10000/día como red de seguridad; ajústalo con GLOBAL_DAILY_MESSAGE_CAP.
// Pon 0 explícitamente para desactivarlo.
const GLOBAL_DAILY_CAP = process.env.GLOBAL_DAILY_MESSAGE_CAP !== undefined
  ? parseInt(process.env.GLOBAL_DAILY_MESSAGE_CAP, 10)
  : 10000

// Devuelve true si se puede procesar una petición más; false si se alcanzó el tope.
export function checkGlobalBudget(): boolean {
  if (!GLOBAL_DAILY_CAP) return true
  const key = todayKey()
  if (key !== globalDayKey) { globalDayKey = key; globalCount = 0 }
  if (globalCount >= GLOBAL_DAILY_CAP) return false
  globalCount++
  return true
}

export function getGlobalUsage(): { date: string; count: number; cap: number } {
  return { date: globalDayKey || todayKey(), count: globalCount, cap: GLOBAL_DAILY_CAP }
}

// Registra un error de forma estructurada (y lo deja listo para Sentry si se quiere).
export function captureError(context: string, err: unknown): void {
  const msg = err instanceof Error ? (err.message || String(err)) : String(err)
  console.error(`[ERROR] ${context}: ${msg}`)
  if (err instanceof Error && err.stack) console.error(err.stack)
  // Si en el futuro se integra Sentry:
  // if (process.env.SENTRY_DSN) Sentry.captureException(err, { tags: { context } })
}

// Engancha los manejadores globales del proceso para no morir en silencio.
export function setupProcessGuards(): void {
  process.on('unhandledRejection', (reason) => {
    captureError('unhandledRejection', reason)
  })
  process.on('uncaughtException', (err) => {
    captureError('uncaughtException', err)
    // No salimos abruptamente: registramos y seguimos sirviendo.
  })
}
