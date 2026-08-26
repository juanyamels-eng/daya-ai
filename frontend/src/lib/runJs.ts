// ============================================
// Daya IA — Ejecutor de JavaScript en el navegador
// Corre el código en un Web Worker AISLADO (sin DOM, hilo aparte) con un timeout
// que lo mata si se cuelga (bucle infinito). Captura console.log/info/warn/error.
// Sin servidor, sin dependencias, sin coste: la ejecución vive en el navegador del
// usuario, como un playground. (La API pública de Piston cerró en feb-2026.)
// ============================================

export interface RunResult {
  logs: { level: 'log' | 'warn' | 'error'; text: string }[]
  error?: string
  timedOut?: boolean
  durationMs: number
}

// Script del worker. Sobrescribe la consola para reenviar la salida al hilo principal
// y envuelve el código del usuario en un async IIFE (permite await y promesas).
const WORKER_SRC = `
const fmt = (args) => Array.prototype.slice.call(args).map((x) => {
  if (typeof x === 'string') return x
  try { return JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? String(v) + 'n' : v), 2) }
  catch { return String(x) }
}).join(' ')
const send = (level, args) => self.postMessage({ type: 'log', level, text: fmt(args) })
console.log = function () { send('log', arguments) }
console.info = function () { send('log', arguments) }
console.debug = function () { send('log', arguments) }
console.warn = function () { send('warn', arguments) }
console.error = function () { send('error', arguments) }
self.onmessage = async function (e) {
  try {
    // El código del usuario se ejecuta como CUERPO de una función async: soporta
    // await, const/let, y hasta 'return'. Evita el frágil eval con saltos de línea.
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    await new AsyncFunction(e.data)()
    self.postMessage({ type: 'done' })
  } catch (err) {
    self.postMessage({ type: 'error', text: (err && err.stack) ? String(err.stack) : String(err) })
  }
}
`

export function runJavaScript(code: string, timeoutMs = 6000): Promise<RunResult> {
  return new Promise((resolve) => {
    const logs: RunResult['logs'] = []
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    let worker: Worker | null = null
    let url = ''
    let settled = false

    const finish = (extra: Partial<RunResult>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { worker?.terminate() } catch {}
      if (url) URL.revokeObjectURL(url)
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      resolve({ logs, durationMs: Math.round(now - start), ...extra })
    }

    const timer = setTimeout(() => finish({
      timedOut: true,
      error: `La ejecución tardó demasiado y se detuvo a los ${(timeoutMs / 1000)} s (posible bucle infinito).`,
    }), timeoutMs)

    try {
      const blob = new Blob([WORKER_SRC], { type: 'application/javascript' })
      url = URL.createObjectURL(blob)
      worker = new Worker(url)
    } catch {
      finish({ error: 'Tu navegador no permitió crear el entorno de ejecución.' })
      return
    }

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data || {}
      if (m.type === 'log') logs.push({ level: m.level || 'log', text: String(m.text ?? '') })
      else if (m.type === 'done') finish({})
      else if (m.type === 'error') finish({ error: String(m.text ?? 'Error de ejecución') })
    }
    worker.onerror = (e: ErrorEvent) => finish({ error: e.message || 'Error en el entorno de ejecución.' })

    worker.postMessage(code)
  })
}

// Lenguajes que sabemos ejecutar en el navegador (por ahora, familia JavaScript).
export const RUNNABLE_LANGS = new Set(['js', 'javascript', 'node', 'nodejs', 'mjs', 'cjs'])
