// ============================================
// DAYA IA — Constructores de LineModel
// --------------------------------------------------------------------------
// Convierten código fuente en el LineModel que consume TreeContext:
//   • buildModelFromTree: usa el AST de tree-sitter (preciso).
//   • buildModelFromHeuristic: respaldo por indentación/llaves (sin parser).
//
// Ambos producen la MISMA forma de datos, así que TreeContext no sabe ni le
// importa de cuál vino. Eso da "degradación elegante": con tree-sitter es más
// preciso; sin él, sigue funcionando razonablemente.
// ============================================

import { LineModel } from './treeContext'
import { parseCode } from './parserLoader'

// Tipos de nodo que cuentan como "scope" (bloques con cabecera) por lenguaje.
// Cubre lo común; ampliarlo es trivial. Si un nodo no está aquí, no crea scope.
const SCOPE_TYPES = new Set([
  // funciones / métodos
  'function_declaration', 'function_definition', 'method_definition', 'method_declaration',
  'arrow_function', 'function', 'function_item', 'func_literal',
  // clases / estructuras / interfaces
  'class_declaration', 'class_definition', 'class', 'interface_declaration',
  'struct_item', 'impl_item', 'trait_item', 'enum_declaration', 'enum_item',
  'type_declaration', 'module', 'namespace_declaration',
  // contenedores de alto nivel útiles
  'export_statement',
])

// ── Desde tree-sitter ────────────────────────────────────────────────────────

interface RawScope { start: number; end: number; headerEnd: number }

export async function buildModelFromTree(code: string, filePath: string): Promise<LineModel | null> {
  const parsed = await parseCode(code, filePath)
  if (!parsed) return null

  const numLines = code.split('\n').length
  const rawScopes: RawScope[] = []

  // Recorre el árbol recogiendo scopes (start/end/headerEnd en líneas 0-indexed).
  const visit = (node: any) => {
    if (node?.isNamed && SCOPE_TYPES.has(node.type)) {
      const start = node.startPosition.row
      const end = node.endPosition.row
      if (end > start) {
        // La "cabecera" va desde el inicio hasta la primera línea del cuerpo.
        // Aproximación robusta: hasta la línea donde aparece el primer hijo de
        // tipo bloque ("{" / ":" / body); si no, la propia línea de inicio.
        let headerEnd = start + 1
        for (const child of node.children || []) {
          if (/body|block|statement_block|declaration_list|field_declaration_list/.test(child.type)) {
            headerEnd = Math.max(start + 1, child.startPosition.row + 1)
            break
          }
        }
        rawScopes.push({ start, end, headerEnd })
      }
    }
    for (const child of node.children || []) visit(child)
  }
  visit(parsed.rootNode)

  return assembleModel(numLines, rawScopes)
}

// ── Heurística por indentación (respaldo sin parser) ─────────────────────────
// Detecta bloques por aumento de indentación o por llaves de apertura. No es
// perfecto, pero produce un mapa de scopes utilísimo para la mayoría de código.

export function buildModelFromHeuristic(code: string): LineModel {
  const lines = code.split('\n')
  const numLines = lines.length
  const rawScopes: RawScope[] = []

  // Señales de "esta línea abre un scope con cabecera":
  //   - termina en "{" (C-like)
  //   - termina en ":" y es def/class (Python)
  const opensBrace = (l: string) => /[{(]\s*$/.test(l) && /\b(function|class|interface|enum|struct|impl|def|fn|func|namespace|module|=>)\b|\)\s*[{(]\s*$/.test(l)
  const opensColon = (l: string) => /:\s*$/.test(l) && /^\s*(def|class|async\s+def)\b/.test(l)

  const indentOf = (l: string) => (l.match(/^[ \t]*/)?.[0].length || 0)

  for (let i = 0; i < numLines; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    if (opensBrace(line)) {
      // Busca la llave de cierre equilibrada.
      const end = findBraceClose(lines, i)
      if (end > i) rawScopes.push({ start: i, end, headerEnd: i + 1 })
    } else if (opensColon(line)) {
      const end = findIndentBlockEnd(lines, i, indentOf(line))
      if (end > i) rawScopes.push({ start: i, end, headerEnd: i + 1 })
    }
  }

  return assembleModel(numLines, rawScopes)
}

// Encuentra la línea de la llave de cierre que equilibra la apertura en `start`.
function findBraceClose(lines: string[], start: number): number {
  let depth = 0
  let seen = false
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{' || ch === '(') { depth++; seen = true }
      else if (ch === '}' || ch === ')') { depth-- }
    }
    if (seen && depth <= 0) return i
  }
  return Math.min(start + 40, lines.length - 1) // tope de seguridad
}

// Encuentra el fin de un bloque por indentación (estilo Python).
function findIndentBlockEnd(lines: string[], start: number, baseIndent: number): number {
  let last = start
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) continue
    const ind = l.match(/^[ \t]*/)?.[0].length || 0
    if (ind <= baseIndent) break
    last = i
  }
  return last
}

// ── Ensamblado común ─────────────────────────────────────────────────────────
// A partir de los scopes crudos, construye scopes[]/header/nodes que usa TreeContext.

function assembleModel(numLines: number, rawScopes: RawScope[]): LineModel {
  const scopes: Set<number>[] = Array.from({ length: numLines }, () => new Set<number>())
  const header = new Map<number, [number, number]>()
  const nodes = new Map<number, Array<[number, number]>>()

  for (const s of rawScopes) {
    // Cada línea dentro del scope "pertenece" a su línea de inicio.
    for (let i = s.start; i <= s.end && i < numLines; i++) scopes[i].add(s.start)
    // Cabecera del scope (clamp dentro de rango).
    const hEnd = Math.min(Math.max(s.headerEnd, s.start + 1), s.end + 1)
    header.set(s.start, [s.start, hEnd])
    // Registro de nodos que arrancan en esta línea.
    const arr = nodes.get(s.start) || []
    arr.push([s.start, s.end])
    nodes.set(s.start, arr)
  }

  return { numLines, scopes, header, nodes }
}

/**
 * Atajo: construye el mejor LineModel disponible (tree-sitter si se puede,
 * heurística si no). Nunca falla: siempre devuelve un modelo usable.
 */
export async function buildBestModel(code: string, filePath: string): Promise<{ model: LineModel; usedTreeSitter: boolean }> {
  const fromTree = await buildModelFromTree(code, filePath).catch(() => null)
  if (fromTree) return { model: fromTree, usedTreeSitter: true }
  return { model: buildModelFromHeuristic(code), usedTreeSitter: false }
}
