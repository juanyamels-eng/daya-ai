// ============================================
// DAYA IA — Cargador de parsers (tree-sitter / WASM)
// --------------------------------------------------------------------------
// Carga perezosa de tree-sitter vía web-tree-sitter (WASM): no requiere
// compilación nativa, así que no rompe el deploy (Railway/Vercel).
//
// Diseño de "degradación elegante": si web-tree-sitter o las gramáticas WASM
// no están instaladas, isParserAvailable() devuelve false y el resto del
// sistema cae a un analizador por indentación/regex (ver lineHeuristics.ts).
// Así codemap FUNCIONA siempre, y mejora cuando hay tree-sitter disponible.
//
// Para activar tree-sitter completo, el usuario instala:
//   npm i web-tree-sitter
// y coloca los .wasm de las gramáticas (tree-sitter-typescript, etc.) en
// la carpeta indicada por GRAMMARS_DIR (por defecto ./grammars).
// ============================================

import * as path from 'path'

// Extensión → nombre de gramática tree-sitter (alineado con el ecosistema).
export const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
  '.rb': 'ruby', '.php': 'php', '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp',
  '.cs': 'c_sharp', '.swift': 'swift', '.kt': 'kotlin', '.scala': 'scala',
  '.lua': 'lua', '.json': 'json', '.css': 'css', '.html': 'html',
}

export function langForFile(filePath: string): string | null {
  const ext = (filePath.match(/\.[^.\\/]+$/)?.[0] || '').toLowerCase()
  return EXT_TO_LANG[ext] || null
}

const GRAMMARS_DIR = process.env.GRAMMARS_DIR || path.resolve(process.cwd(), 'grammars')

// Estado de carga (memoizado).
let parserModule: any = null
let parserInitTried = false
let parserInitOk = false
const languageCache = new Map<string, any>()

// Intenta inicializar web-tree-sitter una sola vez.
async function ensureInit(): Promise<boolean> {
  if (parserInitTried) return parserInitOk
  parserInitTried = true
  try {
    // import dinámico para que la ausencia del paquete no rompa el arranque
    const mod: any = await import('web-tree-sitter')
    const Parser = mod.default || mod
    await Parser.init()
    parserModule = Parser
    parserInitOk = true
  } catch {
    parserInitOk = false
  }
  return parserInitOk
}

/** ¿Está tree-sitter disponible en este entorno? */
export async function isParserAvailable(): Promise<boolean> {
  return ensureInit()
}

// Carga (y memoiza) la gramática WASM de un lenguaje.
async function loadLanguage(lang: string): Promise<any | null> {
  if (languageCache.has(lang)) return languageCache.get(lang)
  if (!(await ensureInit())) return null
  try {
    const wasmPath = path.join(GRAMMARS_DIR, `tree-sitter-${lang}.wasm`)
    const Language = parserModule.Language
    const language = await Language.load(wasmPath)
    languageCache.set(lang, language)
    return language
  } catch {
    languageCache.set(lang, null)
    return null
  }
}

export interface ParsedTree {
  rootNode: any         // nodo raíz de tree-sitter
  lang: string
}

/**
 * Parsea un archivo. Devuelve el árbol o null si no hay parser/gramática para
 * ese lenguaje (el caller debe entonces usar la heurística por líneas).
 */
export async function parseCode(code: string, filePath: string): Promise<ParsedTree | null> {
  const lang = langForFile(filePath)
  if (!lang) return null
  const language = await loadLanguage(lang)
  if (!language) return null
  try {
    const parser = new parserModule()
    parser.setLanguage(language)
    const tree = parser.parse(code)
    return { rootNode: tree.rootNode, lang }
  } catch {
    return null
  }
}
