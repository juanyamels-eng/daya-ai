// ============================================================
// DAYA IA — Canvas AI Assistant
//   POST /api/canvas/assist    — AI modifica/crea elementos (SSE)
//   POST /api/canvas/palette   — Genera paleta de colores con IA
//   POST /api/canvas/describe  — Describe un diseño con IA
// ============================================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { chatStream } from '../../services/openrouter'

const router = Router()
router.use(requireAuth)

function openSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
}

// ── AI Canvas Assistant ─────────────────────────────────────────────────────
// Recibe el estado del canvas + instrucción en lenguaje natural.
// Devuelve JSON con elementos a añadir/modificar y mensaje explicativo.
router.post('/assist', async (req: Request, res: Response) => {
  const { elements = [], canvasW = 1200, canvasH = 800, bg = '#ffffff', instruction } = req.body
  if (!instruction?.trim()) return res.status(400).json({ error: 'Falta la instrucción.' })

  openSSE(res)
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  let cancelled = false
  req.on('close', () => { cancelled = true })

  const SYSTEM = `Eres un asistente de diseño gráfico experto integrado en un canvas SVG llamado DAYA Studio.
El canvas mide ${canvasW}x${canvasH} píxeles. Fondo actual: "${bg}".

Los elementos del canvas tienen esta estructura TypeScript:
interface El {
  type: 'rect'|'circle'|'triangle'|'text'|'line'|'star'|'diamond'|'hexagon'|'pentagon'|'cross'|'arrow'|'heart'|'speech'|'icon'
  x: number; y: number; w: number; h: number
  fill: string; stroke: string; sw: number; opacity: number
  rx?: number  // border radius para rect
  txt?: string; fs?: number; fw?: string; ff?: string; ta?: 'left'|'center'|'right'
  ls?: number  // letter-spacing
  lhm?: number  // line-height multiplier (default 1.25)
  fillGrad?: { a: string; b: string; dir?: number }  // gradiente
  shadow?: boolean
  blur?: number
  locked?: boolean
  flipH?: boolean; flipV?: boolean
  strokeDash?: string  // e.g. "8 4" para discontinuo
}

DEBES responder ÚNICAMENTE con un JSON válido con este formato exacto:
{
  "action": "add" | "replace" | "bg",
  "elements": [array de El SIN campo id - solo si action es "add" o "replace"],
  "bg": "color CSS solo si action es bg",
  "message": "explicación breve en español de lo que hiciste (1 línea)"
}

REGLAS:
- Si el usuario pide añadir cosas → action "add", devuelve los nuevos elementos
- Si pide cambiar colores/fondo → action "bg", devuelve el color en campo bg
- Si pide reemplazar todo el diseño → action "replace", devuelve todos los elementos
- Usa colores modernos y profesionales. Para texto usa fs mínimo 28, fw "700"
- Los textos tienen fill = color del texto (no stroke)
- No uses los colores que ya están sobreusados, varía la paleta
- Coloca los elementos de forma coherente en el canvas, centrados o bien distribuidos
- Para elementos decorativos usa formas geométricas con gradientes o colores sólidos vibrantes
- Responde SOLO con el JSON, sin texto previo ni posterior`

  const userMsg = `Canvas actual (${elements.length} elementos):
${JSON.stringify(elements.slice(0, 15), null, 0)}

Instrucción del usuario: "${instruction}"

Responde con JSON:`

  try {
    let full = ''
    for await (const delta of chatStream([{ role: 'user', content: userMsg }], 'claude', SYSTEM)) {
      if (cancelled) break
      full += delta
      send({ delta })
    }
    if (!cancelled) send({ done: true, full })
  } catch (e: any) {
    send({ error: e?.message || 'Error del asistente IA.' })
  }
  res.end()
})

// ── AI Color Palette Generator ─────────────────────────────────────────────
// Genera una paleta de 6 colores armoniosos a partir de un color base o descripción
router.post('/palette', async (req: Request, res: Response) => {
  const { baseColor, mood, style } = req.body

  openSSE(res)
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  let cancelled = false
  req.on('close', () => { cancelled = true })

  const SYSTEM = `Eres un experto en teoría del color y diseño visual. Generas paletas de colores profesionales.
Responde ÚNICAMENTE con JSON válido en este formato:
{
  "palette": ["#hex1","#hex2","#hex3","#hex4","#hex5","#hex6"],
  "names": ["nombre1","nombre2","nombre3","nombre4","nombre5","nombre6"],
  "style": "descripción del estilo de la paleta en 5 palabras"
}`

  const userMsg = `Genera una paleta de 6 colores armoniosos${baseColor ? ` basada en ${baseColor}` : ''}${mood ? ` con mood "${mood}"` : ''}${style ? ` estilo "${style}"` : ''}.
La paleta debe ser profesional, moderna y útil para diseño gráfico. Incluye variaciones de claro a oscuro y un color acento vibrante.`

  try {
    let full = ''
    for await (const delta of chatStream([{ role: 'user', content: userMsg }], 'fast', SYSTEM)) {
      if (cancelled) break
      full += delta
      send({ delta })
    }
    if (!cancelled) send({ done: true, full })
  } catch (e: any) {
    send({ error: e?.message || 'Error al generar paleta.' })
  }
  res.end()
})

// ── AI Design Describe ─────────────────────────────────────────────────────
// Describe lo que hay en el canvas y da sugerencias de mejora
router.post('/describe', async (req: Request, res: Response) => {
  const { elements = [], canvasW = 1200, canvasH = 800, bg = '#ffffff' } = req.body

  openSSE(res)
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  let cancelled = false
  req.on('close', () => { cancelled = true })

  const SYSTEM = `Eres un director de arte experto. Analizas diseños gráficos y das feedback constructivo en español. Sé específico, práctico y motivador. Máximo 4 puntos cortos.`

  const userMsg = `Analiza este diseño de canvas ${canvasW}x${canvasH} con fondo "${bg}" y ${elements.length} elementos:
${JSON.stringify(elements.slice(0, 20))}

Dame: 1) descripción del diseño actual, 2) 3 sugerencias concretas de mejora, 3) valoración del 1-10.`

  try {
    for await (const delta of chatStream([{ role: 'user', content: userMsg }], 'fast', SYSTEM)) {
      if (cancelled) break
      send({ delta })
    }
    if (!cancelled) send({ done: true })
  } catch (e: any) {
    send({ error: e?.message || 'Error al describir.' })
  }
  res.end()
})

export default router
