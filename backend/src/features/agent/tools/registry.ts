// ============================================
// DAYA IA — tools: registro central
// --------------------------------------------------------------------------
// Unifica TODAS las herramientas del agente en un solo lugar:
//  · TOOLS_SCHEMAS → array en formato function-calling (para el LLM)
//  · runTool()     → ejecuta por nombre con manejo de errores unificado
//  · toActTools()  → adapta al orquestador `act` (solo las seguras)
// ============================================

import { DayaTool, ToolMeta, toFunctionSchema, toActTool } from './types'
import { ActTool } from '../../actions/act'

import { webSearch } from './webSearch'
import { readUrl } from './readUrl'
import { docRag } from './docRag'
import { calculator } from './calculator'
import { generateImage } from './generateImage'
import { viewImage } from './viewImage'
import { createTask } from './createTask'
import { createNote } from './createNote'
import { createEvent } from './createEvent'
import { createDocument } from './createDocument'
import { ocr } from './ocr'
import { summarizeVideo } from './summarizeVideo'
import { createDiagram } from './createDiagram'
import { speak } from './speak'
import { createAutomation, manageAutomations } from './automations'
import { BROWSER_TOOLS } from '../../browser/tools'
import { sandboxExecuteTool } from '../../sandbox/registry'

export const ALL_TOOLS: DayaTool[] = [
  webSearch,
  readUrl,
  docRag,
  calculator,
  generateImage,
  viewImage,
  createTask,
  createNote,
  createEvent,
  createDocument,
  ocr,
  summarizeVideo,
  createDiagram,
  speak,
  createAutomation,
  manageAutomations,
  ...BROWSER_TOOLS,
  sandboxExecuteTool,
]

const registry = new Map<string, DayaTool>(ALL_TOOLS.map(t => [t.name, t]))

// Schemas en formato function-calling para el LLM.
export const TOOLS_SCHEMAS = ALL_TOOLS.map(toFunctionSchema)

// Ejecuta una herramienta por nombre, con caching, analytics y manejo de errores.
const CACHABLE_TOOLS = new Set(['calcular', 'buscar_web', 'leer_url', 'buscar_en_documentos', 'resumir_video_youtube'])

export async function runTool(userId: string, name: string, args: any): Promise<string> {
  const tool = registry.get(name)
  if (!tool) return 'Herramienta desconocida.'

  // Límite de uso por herramienta (protege las caras: búsqueda web, imágenes, sandbox…)
  try {
    const { checkToolLimit } = await import('../../../middleware/toolRateLimit')
    const verdict = checkToolLimit(userId, name)
    if (!verdict.allowed) return verdict.message || 'Límite de uso alcanzado. Intenta más tarde.'
  } catch { /* best-effort: el limiter nunca debe tumbar una tool */ }

  // Check cache for deterministic tools
  if (CACHABLE_TOOLS.has(name)) {
    try {
      const { getCachedToolResult, setCachedToolResult } = await import('../../../services/toolCache')
      const cached = getCachedToolResult(name, args, userId)
      if (cached) return cached
      const result = await tool.run(userId, args)
      if (!result.startsWith('ERROR') && !result.startsWith('La herramienta')) {
        setCachedToolResult(name, args, userId, result)
      }
      // Record analytics
      try {
        const { recordToolUsage } = await import('../../../services/analytics')
        recordToolUsage({ tool: name, userId, success: true, durationMs: 0, timestamp: Date.now() })
      } catch { /* best-effort */ }
      return result
    } catch (e: unknown) {
      // Fall through to error handling below
      const message = `La herramienta «${name}» falló: ${(e instanceof Error && e.message) || String(e)}`
      try { const { recordToolUsage } = await import('../../../services/analytics'); recordToolUsage({ tool: name, userId, success: false, durationMs: 0, timestamp: Date.now(), error: e instanceof Error ? e.message : String(e) }) } catch {}
      try {
        const { reportIssue } = await import('../../selfimprove/issues')
        await reportIssue({ kind: 'tool_failure', title: `La herramienta «${name}» falla`, detail: message + '\nArgs: ' + JSON.stringify(args).slice(0, 500), signature: 'tool_failure:' + name })
      } catch { /* best-effort */ }
      return message
    }
  }

  // Non-cached tools
  const start = Date.now()
  try {
    const result = await tool.run(userId, args)
    try { const { recordToolUsage } = await import('../../../services/analytics'); recordToolUsage({ tool: name, userId, success: true, durationMs: Date.now() - start, timestamp: Date.now() }) } catch {}
    return result
  } catch (e: unknown) {
    const message = `La herramienta «${name}» falló: ${(e instanceof Error && e.message) || String(e)}`
    try { const { recordToolUsage } = await import('../../../services/analytics'); recordToolUsage({ tool: name, userId, success: false, durationMs: Date.now() - start, timestamp: Date.now(), error: e instanceof Error ? e.message : String(e) }) } catch {}
    try {
      const { reportIssue } = await import('../../selfimprove/issues')
      await reportIssue({ kind: 'tool_failure', title: `La herramienta «${name}» falla`, detail: message + '\nArgs: ' + JSON.stringify(args).slice(0, 500), signature: 'tool_failure:' + name })
    } catch { /* best-effort */ }
    return message
  }
}

// Las herramientas seguras para el orquestador `act` (deterministas, sin userId real).
export function toActTools(): ActTool[] {
  return ALL_TOOLS.filter(t => t.safeForAct).map(toActTool)
}

// Nombres y descripciones, para listarlos en la UI/API.
export function listTools() {
  return ALL_TOOLS.map(t => ({ name: t.name, description: t.description, safeForAct: !!t.safeForAct, meta: catalogMeta(t) }))
}

// ── Catálogo público de la comunidad ─────────────────────────────────────────
// Los metadatos de presentación viven AQUÍ (el archivo de cada tool se mantiene
// mínimo). Las herramientas nuevas que cree la auto-mejora pueden traer su
// propio `meta.author` (p. ej. 'daya-auto') que tiene prioridad sobre esto.
const CATALOG_META: Record<string, ToolMeta> = {
  buscar_web:                { tag: 'web',           emoji: '🔍' },
  leer_url:                  { tag: 'web',           emoji: '🔗' },
  buscar_en_documentos:      { tag: 'documentos',    emoji: '📚' },
  calcular:                  { tag: 'utilidades',    emoji: '🧮' },
  generar_imagen:            { tag: 'imagen',        emoji: '🎨', pro: true },
  ver_imagen:                { tag: 'imagen',        emoji: '🖼️' },
  crear_tarea:               { tag: 'productividad', emoji: '✅' },
  crear_nota:                { tag: 'productividad', emoji: '📝' },
  crear_evento:              { tag: 'productividad', emoji: '📅' },
  crear_documento:           { tag: 'documentos',    emoji: '📄', pro: true },
  extraer_texto_imagen:      { tag: 'imagen',        emoji: '👁️', author: 'comunidad' },
  resumir_video_youtube:     { tag: 'voz',           emoji: '🎬', author: 'comunidad' },
  crear_diagrama:            { tag: 'utilidades',    emoji: '🧩', author: 'comunidad' },
  hablar:                    { tag: 'voz',           emoji: '🔊', author: 'comunidad' },
  crear_automatizacion:      { tag: 'automatizacion', emoji: '⚙️', pro: true },
  gestionar_automatizaciones:{ tag: 'automatizacion', emoji: '🗂️', pro: true },
  browse_page:               { tag: 'web',           emoji: '🌐', author: 'daya' },
  browser_screenshot:        { tag: 'web',           emoji: '📸', author: 'daya' },
  browser_click:             { tag: 'web',           emoji: '🖱️', author: 'daya' },
  browser_fill:              { tag: 'web',           emoji: '✏️', author: 'daya' },
  autonomous_browse:         { tag: 'web',           emoji: '🤖', author: 'daya', pro: true },
  sandbox_execute:           { tag: 'code',          emoji: '🐳', author: 'daya' },
}

function catalogMeta(tool: DayaTool): ToolMeta {
  return { author: 'daya', tag: 'general', ...CATALOG_META[tool.name], ...(tool.meta || {}) }
}

// Lista completa lista para exponer: schema, cuota, seguridad y metadatos.
export function getCatalog() {
  return ALL_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    quotaKey: t.quotaKey,
    safeForAct: !!t.safeForAct,
    meta: catalogMeta(t),
  }))
}
