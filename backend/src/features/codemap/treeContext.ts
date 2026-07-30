// ============================================
// DAYA IA — TreeContext (contexto estructural de código)
// --------------------------------------------------------------------------
// Reimplementación clean-room (TypeScript, código propio) de la IDEA de
// grep-ast: en vez de mostrar líneas sueltas alrededor de una coincidencia,
// muestra cómo encaja en la ESTRUCTURA del código — la función, la clase y el
// archivo que la contienen — colapsando lo irrelevante con "⋮".
//
// Algoritmo (inspiración conceptual de grep-ast, Apache-2.0; sin copiar código):
//   1) Para cada línea, se calcula su cadena de "scopes" (nodos del AST que la
//      envuelven) y la "cabecera" de cada scope (líneas de la firma/declaración).
//   2) Dadas unas "líneas de interés" (LOI), se añaden:
//        • márgenes alrededor de cada LOI,
//        • las CABECERAS de todos los scopes padres (subiendo por el árbol),
//        • una MUESTRA de los hijos relevantes si el scope es grande,
//   3) Se "cierran huecos" pequeños para que el resultado se lea fluido.
//   4) Se formatea mostrando solo las líneas elegidas, con "⋮" donde se colapsa.
//
// Funciona sobre el árbol de tree-sitter si está disponible; si no, el caller
// usa una heurística por indentación (lineHeuristics.ts) que produce los mismos
// arrays de entrada (scopes/header/nodes), de modo que este algoritmo es agnóstico.
// ============================================

// Estructuras que describen el código línea a línea. Las puede llenar el parser
// de tree-sitter o la heurística por indentación: a TreeContext le da igual.
export interface LineModel {
  numLines: number
  // scopes[i] = conjunto de líneas de inicio de los scopes que contienen a la línea i
  scopes: Set<number>[]
  // header[startLine] = [hStart, hEnd) → líneas que forman la "cabecera" de ese scope
  header: Map<number, [number, number]>
  // nodes[i] = scopes que ARRANCAN en la línea i, como [startLine, endLine]
  nodes: Map<number, Array<[number, number]>>
}

export interface TreeContextOptions {
  loiPad?: number              // líneas de margen alrededor de cada coincidencia
  parentContext?: boolean      // mostrar cabeceras de scopes padres
  childContext?: boolean       // mostrar muestra de hijos en scopes grandes
  lastLine?: boolean           // incluir la última línea del archivo
  margin?: number              // líneas del inicio del archivo a mostrar siempre
  markLois?: boolean           // marcar las líneas de interés
  lineNumbers?: boolean        // prefijar número de línea
  showTopParent?: boolean      // mostrar la cabecera aunque empiece en la línea 0
}

const DEFAULTS: Required<TreeContextOptions> = {
  loiPad: 1,
  parentContext: true,
  childContext: true,
  lastLine: false,
  margin: 0,
  markLois: true,
  lineNumbers: true,
  showTopParent: false,
}

export class TreeContext {
  private lines: string[]
  private model: LineModel
  private opts: Required<TreeContextOptions>
  private show = new Set<number>()
  private lois = new Set<number>()
  private doneParents = new Set<number>()

  constructor(code: string, model: LineModel, options: TreeContextOptions = {}) {
    this.lines = code.split('\n')
    this.model = model
    this.opts = { ...DEFAULTS, ...options }
  }

  /** Marca líneas de interés directamente (0-indexed). */
  addLinesOfInterest(lineNums: number[]): void {
    for (const n of lineNums) if (n >= 0 && n < this.model.numLines) this.lois.add(n)
  }

  /** Busca un patrón y marca como interés cada línea que coincide. */
  grep(pattern: string | RegExp, ignoreCase = false): number[] {
    const re = pattern instanceof RegExp
      ? pattern
      : new RegExp(escapeRegExp(pattern), ignoreCase ? 'i' : '')
    const hits: number[] = []
    for (let i = 0; i < this.lines.length; i++) {
      if (re.test(this.lines[i])) { this.lois.add(i); hits.push(i) }
    }
    return hits
  }

  /** Expande las líneas de interés a su contexto estructural completo. */
  addContext(): void {
    if (!this.lois.size) return
    this.doneParents = new Set()
    this.show = new Set(this.lois)

    // 1) Márgenes alrededor de cada coincidencia
    if (this.opts.loiPad) {
      for (const line of [...this.show]) {
        for (let n = line - this.opts.loiPad; n <= line + this.opts.loiPad; n++) {
          if (n >= 0 && n < this.model.numLines) this.show.add(n)
        }
      }
    }

    // 2) Última línea + sus scopes (útil para cierres de archivo)
    if (this.opts.lastLine && this.model.numLines >= 2) {
      const bottom = this.model.numLines - 2
      this.show.add(bottom)
      this.addParentScopes(bottom)
    }

    // 3) Cabeceras de los scopes padres de cada coincidencia
    if (this.opts.parentContext) {
      for (const i of [...this.lois]) this.addParentScopes(i)
    }

    // 4) Muestra de hijos relevantes para scopes grandes
    if (this.opts.childContext) {
      for (const i of [...this.lois]) this.addChildContext(i)
    }

    // 5) Margen superior del archivo
    if (this.opts.margin) {
      for (let i = 0; i < this.opts.margin && i < this.model.numLines; i++) this.show.add(i)
    }

    // 6) Cierre de huecos pequeños
    this.closeSmallGaps()
  }

  // Sube por el árbol añadiendo las CABECERAS de cada scope que envuelve a `i`.
  private addParentScopes(i: number): void {
    if (this.doneParents.has(i)) return
    this.doneParents.add(i)
    if (i >= this.model.scopes.length) return

    for (const startLine of this.model.scopes[i] || []) {
      const head = this.model.header.get(startLine)
      if (!head) continue
      const [hStart, hEnd] = head
      if (hStart > 0 || this.opts.showTopParent) {
        for (let n = hStart; n < hEnd && n < this.model.numLines; n++) this.show.add(n)
      }
    }
  }

  // Para un scope grande, muestra una MUESTRA acotada de sus sub-bloques.
  private addChildContext(i: number): void {
    const starting = this.model.nodes.get(i)
    if (!starting || !starting.length) return

    const lastLine = Math.max(...starting.map(([, end]) => end))
    const size = lastLine - i
    if (size < 5) {
      for (let n = i; n <= lastLine && n < this.model.numLines; n++) this.show.add(n)
      return
    }

    // Recolecta los inicios de sub-bloques dentro del scope.
    const childStarts: number[] = []
    for (let n = i + 1; n <= lastLine; n++) {
      const nn = this.model.nodes.get(n)
      if (nn && nn.length) childStarts.push(n)
    }
    // Ordena por tamaño del bloque (los más grandes primero: más informativos).
    childStarts.sort((a, b) => {
      const sa = Math.max(...(this.model.nodes.get(a) || [[a, a]]).map(([, e]) => e)) - a
      const sb = Math.max(...(this.model.nodes.get(b) || [[b, b]]).map(([, e]) => e)) - b
      return sb - sa
    })

    const currently = this.show.size
    const maxToShow = Math.max(Math.min(size * 0.10, 25), 5) // 10%, tope 25, mínimo 5
    for (const cs of childStarts) {
      if (this.show.size > currently + maxToShow) break
      this.addParentScopes(cs)
    }
  }

  // Rellena huecos de 1 línea y líneas en blanco adyacentes, para fluidez.
  private closeSmallGaps(): void {
    const closed = new Set(this.show)
    const sorted = [...this.show].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] - sorted[i] === 2) closed.add(sorted[i] + 1)
    }
    for (let i = 0; i < this.model.numLines; i++) {
      if (!closed.has(i)) continue
      if (this.lines[i]?.trim() && i < this.model.numLines - 1 && !this.lines[i + 1]?.trim()) {
        closed.add(i + 1)
      }
    }
    this.show = closed
  }

  /** Devuelve el código colapsado con "⋮" donde se omiten líneas. */
  format(): string {
    if (!this.show.size) return ''
    let out = ''
    let dots = !this.show.has(0)
    for (let i = 0; i < this.lines.length; i++) {
      if (!this.show.has(i)) {
        if (dots) { out += this.opts.lineNumbers ? '...⋮...\n' : '⋮\n'; dots = false }
        continue
      }
      const spacer = (this.lois.has(i) && this.opts.markLois) ? '█' : '│'
      let lineOut = `${spacer}${this.lines[i]}`
      if (this.opts.lineNumbers) lineOut = `${String(i + 1).padStart(4)} ${lineOut}`
      out += lineOut + '\n'
      dots = true
    }
    return out
  }

  /** Conjunto de líneas que se mostrarán (por si el caller quiere postprocesar). */
  getShownLines(): number[] {
    return [...this.show].sort((a, b) => a - b)
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
