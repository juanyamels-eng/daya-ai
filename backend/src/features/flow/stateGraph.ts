// ============================================
// DAYA IA — StateGraph (motor de workflows como grafo de estados)
// --------------------------------------------------------------------------
// Reimplementación clean-room (TypeScript propio) de la IDEA de LangGraph:
// orquestar agentes como un GRAFO en vez de un bucle lineal.
//
//   • Nodos      = pasos (funciones async que reciben el estado y devuelven un
//                  parche parcial del estado).
//   • Aristas    = a qué nodo ir después.
//   • Aristas condicionales = una función mira el estado y decide el siguiente
//                  nodo (ramificación: bucles, reintentos, "si X entonces Y").
//   • Estado     = objeto compartido que fluye por el grafo; cada nodo lo
//                  actualiza con "reducers" (por defecto: merge superficial).
//
// Incluye (en otros archivos del módulo):
//   • Checkpoints  → ejecución durable: un flujo sobrevive a reinicios y retoma.
//   • Interrupts   → human-in-the-loop: pausar, pedir aprobación, reanudar.
//
// La idea (nodos/aristas/estado/checkpoints/interrupts) viene de LangGraph (MIT);
// este código NO copia el suyo (que es Python). Implementación nueva y mínima,
// pensada para encajar con las features de DAYA.
// ============================================

// Nodos especiales (como START/END de LangGraph).
export const START = '__start__'
export const END = '__end__'

// Un nodo recibe el estado actual y devuelve un parche (parcial) del estado.
// Puede ser async. Puede leer un "contexto" externo (servicios, userId, etc.).
export type NodeFn<S, C = any> = (state: S, ctx: C) => Promise<Partial<S>> | Partial<S>

// Una arista condicional mira el estado y devuelve el nombre del próximo nodo.
export type Router<S, C = any> = (state: S, ctx: C) => string | Promise<string>

// Reducer: cómo se combina el parche que devuelve un nodo con el estado previo.
// Por defecto hace merge superficial; se puede personalizar por clave (p. ej.
// para ACUMULAR en un array en vez de reemplazar).
export type Reducer<S> = (prev: S, patch: Partial<S>) => S

// Señal que un nodo puede lanzar para PAUSAR el grafo y pedir intervención humana.
export class Interrupt {
  constructor(public payload: any, public node: string) {}
}

export interface StepTrace {
  node: string
  at: number
  durationMs: number
  patchKeys: string[]
}

export interface RunResult<S> {
  status: 'done' | 'interrupted' | 'error' | 'max_steps'
  state: S
  trace: StepTrace[]
  interrupt?: { node: string; payload: any }
  error?: string
  nextNode?: string   // dónde retomar (para reanudar)
}

export interface RunOptions {
  maxSteps?: number          // tope anti-bucle infinito (por defecto 50)
  startAt?: string           // nodo desde el que retomar (para reanudación)
  onStep?: (t: StepTrace, state: any) => void  // callback de progreso
}

export class StateGraph<S extends Record<string, any>, C = any> {
  private nodes = new Map<string, NodeFn<S, C>>()
  private edges = new Map<string, string>()                 // nodo → siguiente fijo
  private condEdges = new Map<string, Router<S, C>>()       // nodo → router condicional
  private reducer: Reducer<S>
  private entry: string | null = null

  constructor(reducer?: Reducer<S>) {
    // Reducer por defecto: merge superficial (patch pisa prev).
    this.reducer = reducer || ((prev, patch) => ({ ...prev, ...patch }))
  }

  /** Registra un nodo con un nombre único. */
  addNode(name: string, fn: NodeFn<S, C>): this {
    if (name === START || name === END) throw new Error(`Nombre de nodo reservado: ${name}`)
    if (this.nodes.has(name)) throw new Error(`Nodo duplicado: ${name}`)
    this.nodes.set(name, fn)
    return this
  }

  /** Arista fija: tras `from`, ir a `to`. Usa START/END para inicio/fin. */
  addEdge(from: string, to: string): this {
    if (from === START) { this.entry = to; return this }
    this.edges.set(from, to)
    return this
  }

  /** Arista condicional: tras `from`, un router decide el próximo nodo. */
  addConditionalEdges(from: string, router: Router<S, C>): this {
    this.condEdges.set(from, router)
    return this
  }

  /** Punto de entrada explícito (alternativa a addEdge(START, x)). */
  setEntry(name: string): this { this.entry = name; return this }

  // Valida que el grafo sea coherente antes de correr.
  private validate(): void {
    if (!this.entry) throw new Error('El grafo no tiene punto de entrada (usa addEdge(START, ...)).')
    if (!this.nodes.has(this.entry)) throw new Error(`El nodo de entrada "${this.entry}" no existe.`)
    for (const [from, to] of this.edges) {
      if (!this.nodes.has(from)) throw new Error(`Arista desde nodo inexistente: ${from}`)
      if (to !== END && !this.nodes.has(to)) throw new Error(`Arista hacia nodo inexistente: ${to}`)
    }
  }

  // Decide el próximo nodo tras ejecutar `current`.
  private async nextOf(current: string, state: S, ctx: C): Promise<string> {
    if (this.condEdges.has(current)) {
      const router = this.condEdges.get(current)!
      const dest = await router(state, ctx)
      if (dest !== END && !this.nodes.has(dest)) {
        throw new Error(`El router de "${current}" devolvió un nodo inexistente: "${dest}".`)
      }
      return dest
    }
    if (this.edges.has(current)) return this.edges.get(current)!
    return END // sin arista saliente → termina
  }

  /**
   * Ejecuta el grafo desde el estado inicial. Devuelve el resultado, que puede
   * ser 'done', 'interrupted' (human-in-the-loop), 'error' o 'max_steps'.
   */
  async run(initialState: S, ctx: C, opts: RunOptions = {}): Promise<RunResult<S>> {
    this.validate()
    const maxSteps = opts.maxSteps ?? 50
    const trace: StepTrace[] = []
    let state = initialState
    let current = opts.startAt || this.entry!
    let steps = 0

    while (current !== END) {
      if (steps++ >= maxSteps) {
        return { status: 'max_steps', state, trace, nextNode: current, error: `Se alcanzó el límite de ${maxSteps} pasos.` }
      }
      const fn = this.nodes.get(current)
      if (!fn) return { status: 'error', state, trace, error: `Nodo inexistente: ${current}` }

      const t0 = Date.now()
      try {
        const patch = await fn(state, ctx)
        const patchKeys = patch ? Object.keys(patch) : []
        if (patch) state = this.reducer(state, patch)
        const step: StepTrace = { node: current, at: t0, durationMs: Date.now() - t0, patchKeys }
        trace.push(step)
        opts.onStep?.(step, state)
      } catch (e: unknown) {
        // Una interrupción NO es un error: pausa el grafo para el humano.
        if (e instanceof Interrupt) {
          return { status: 'interrupted', state, trace, interrupt: { node: e.node, payload: e.payload }, nextNode: current }
        }
        return { status: 'error', state, trace, error: (e instanceof Error && e.message) || 'Fallo en un nodo', nextNode: current }
      }

      current = await this.nextOf(current, state, ctx)
    }

    return { status: 'done', state, trace }
  }
}
