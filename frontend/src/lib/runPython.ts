// ============================================
// Daya IA — Ejecutor de Python en el navegador (Pyodide / WASM)
// Corre Python en un Web Worker aislado. Pyodide se carga bajo demanda desde el CDN
// la PRIMERA vez (~unos MB, luego queda en caché del navegador). Sin servidor.
// Pyodide es MPL-2.0: se usa TAL CUAL (sin modificar), lo que es seguro comercialmente.
// ============================================
import type { RunResult } from './runJs'

const PYODIDE_VERSION = 'v0.26.4'
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.js`

// El worker carga Pyodide una vez, redirige stdout/stderr al hilo principal y ejecuta.
const WORKER_SRC = `
let pyodidePromise = null
async function getPyodide() {
  if (!pyodidePromise) {
    self.importScripts('${PYODIDE_URL}')
    pyodidePromise = self.loadPyodide()
  }
  return pyodidePromise
}
self.onmessage = async function (e) {
  try {
    self.postMessage({ type: 'status', text: 'Cargando Python…' })
    const pyodide = await getPyodide()
    pyodide.setStdout({ batched: (s) => self.postMessage({ type: 'log', level: 'log', text: s }) })
    pyodide.setStderr({ batched: (s) => self.postMessage({ type: 'log', level: 'error', text: s }) })
    self.postMessage({ type: 'status', text: 'Ejecutando…' })
    await pyodide.runPythonAsync(e.data)
    self.postMessage({ type: 'done' })
  } catch (err) {
    self.postMessage({ type: 'error', text: (err && err.message) ? String(err.message) : String(err) })
  }
}
`

export function runPython(
  code: string,
  opts: { onStatus?: (text: string) => void; loadTimeoutMs?: number; runTimeoutMs?: number } = {}
): Promise<RunResult> {
  const loadTimeoutMs = opts.loadTimeoutMs ?? 60000
  const runTimeoutMs = opts.runTimeoutMs ?? 20000
  return new Promise((resolve) => {
    const logs: RunResult['logs'] = []
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    let worker: Worker | null = null
    let url = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (extra: Partial<RunResult>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { worker?.terminate() } catch {}
      if (url) URL.revokeObjectURL(url)
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      resolve({ logs, durationMs: Math.round(now - start), ...extra })
    }

    const arm = (ms: number, msg: string) => {
      clearTimeout(timer)
      timer = setTimeout(() => finish({ timedOut: true, error: msg }), ms)
    }
    arm(loadTimeoutMs, `Python tardó demasiado en cargar (más de ${loadTimeoutMs / 1000} s). Revisa tu conexión.`)

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
      if (m.type === 'status') {
        opts.onStatus?.(String(m.text || ''))
        // Cuando arranca la ejecución real, cambia a un timeout más corto (anti-bucle).
        if (m.text === 'Ejecutando…') arm(runTimeoutMs, `La ejecución tardó demasiado y se detuvo a los ${runTimeoutMs / 1000} s (posible bucle infinito).`)
      } else if (m.type === 'log') {
        logs.push({ level: m.level || 'log', text: String(m.text ?? '') })
      } else if (m.type === 'done') {
        finish({})
      } else if (m.type === 'error') {
        finish({ error: String(m.text ?? 'Error de ejecución') })
      }
    }
    worker.onerror = (e: ErrorEvent) => finish({ error: e.message || 'No se pudo cargar el entorno de Python.' })

    worker.postMessage(code)
  })
}

export const RUNNABLE_PYTHON = new Set(['py', 'python', 'python3'])
