// ============================================
// DAYA IA — Flow Runner
// --------------------------------------------------------------------------
// Une el motor (StateGraph) con la persistencia (checkpointer) para dar:
//   • startRun: arranca un workflow, guarda checkpoints en cada paso.
//   • resumeRun: reanuda un workflow PAUSADO por interrupción (human-in-the-loop),
//     inyectando la decisión/dato del humano.
//   • Registro de grafos por nombre, para poder arrancarlos desde la API.
//
// Implementación propia (inspiración: LangGraph, MIT).
// ============================================

import { StateGraph, START, END, RunResult } from './stateGraph'
import {
  Checkpoint, newRunId, saveCheckpoint, loadCheckpoint, indexRun, RunStatus,
} from './checkpointer'

// Un "grafo registrado": su constructor de estado inicial + la fábrica del grafo.
export interface RegisteredGraph<S extends Record<string, any> = any, C = any> {
  name: string
  // Crea el grafo (nodos/aristas). Se llama en cada arranque/reanudación.
  build: () => StateGraph<S, C>
  // Construye el estado inicial a partir de la entrada del usuario.
  initState: (input: any) => S
  // Construye el contexto (servicios, userId…) que reciben los nodos.
  buildCtx: (userId: string, input: any) => C
}

const registry = new Map<string, RegisteredGraph>()

/** Registra un grafo para poder arrancarlo por nombre desde la API. */
export function registerGraph(graph: RegisteredGraph): void {
  registry.set(graph.name, graph)
}

export function listGraphs(): string[] {
  return [...registry.keys()]
}

// Convierte el resultado del motor en estado de checkpoint persistible.
function toStatus(r: RunResult<any>): RunStatus {
  switch (r.status) {
    case 'done': return 'done'
    case 'interrupted': return 'interrupted'
    case 'max_steps': return 'max_steps'
    default: return 'error'
  }
}

/**
 * Arranca un workflow registrado. Persiste un checkpoint al final de cada paso,
 * así que si el proceso muere, queda el último estado guardado.
 */
export async function startRun(
  graphName: string,
  userId: string,
  input: any,
  opts: { maxSteps?: number } = {}
): Promise<Checkpoint> {
  const reg = registry.get(graphName)
  if (!reg) throw new Error(`Grafo no registrado: ${graphName}`)

  const runId = newRunId()
  const graph = reg.build()
  const state = reg.initState(input)
  const ctx = reg.buildCtx(userId, input)

  const cp: Checkpoint = {
    runId, userId, graph: graphName, status: 'running',
    state, trace: [], createdAt: Date.now(), updatedAt: Date.now(),
  }
  await saveCheckpoint(cp)
  await indexRun(userId, runId)

  const result = await graph.run(state, ctx, {
    maxSteps: opts.maxSteps,
    onStep: async (step, st) => {
      cp.state = st
      cp.trace.push(step)
      cp.status = 'running'
      await saveCheckpoint(cp) // checkpoint por paso → durabilidad real
    },
  })

  cp.state = result.state
  cp.status = toStatus(result)
  cp.nextNode = result.nextNode
  cp.interrupt = result.interrupt
  cp.error = result.error
  await saveCheckpoint(cp)
  return cp
}

/**
 * Reanuda un workflow que quedó 'interrupted'. `humanInput` es lo que el humano
 * decidió/aportó; se inyecta en el estado bajo la clave `resume` para que el
 * nodo que reanuda lo lea. Continúa desde el nodo donde se pausó.
 */
export async function resumeRun(
  runId: string,
  userId: string,
  humanInput: any,
  opts: { maxSteps?: number } = {}
): Promise<Checkpoint> {
  const cp = await loadCheckpoint(runId, userId)
  if (!cp) throw new Error('Ejecución no encontrada.')
  if (cp.status !== 'interrupted') throw new Error(`La ejecución no está pausada (estado: ${cp.status}).`)

  const reg = registry.get(cp.graph)
  if (!reg) throw new Error(`Grafo no registrado: ${cp.graph}`)

  const graph = reg.build()
  const ctx = reg.buildCtx(userId, cp.state)
  // Inyecta la decisión humana en el estado. El nodo que reanuda debe mirar
  // `state.resume` y limpiar el flag para no volver a interrumpir en bucle.
  const state = { ...cp.state, resume: humanInput, _resumed: true }

  const result = await graph.run(state, ctx, {
    maxSteps: opts.maxSteps,
    startAt: cp.nextNode, // retoma justo donde se pausó
    onStep: async (step, st) => {
      cp.state = st
      cp.trace.push(step)
      cp.status = 'running'
      await saveCheckpoint(cp)
    },
  })

  cp.state = result.state
  cp.status = toStatus(result)
  cp.nextNode = result.nextNode
  cp.interrupt = result.interrupt
  cp.error = result.error
  await saveCheckpoint(cp)
  return cp
}

export { START, END }
