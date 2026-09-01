// ============================================
// DAYA IA — Flujo de ejemplo: CRAG (Corrective RAG)
// --------------------------------------------------------------------------
// Demuestra el motor de workflows conectando features reales de DAYA en un
// grafo con RAMIFICACIÓN y HUMAN-IN-THE-LOOP.
//
// Grafo:
//
//   START → retrieve → grade ──(suficiente)──────────────→ generate → END
//                         │
//                         └──(insuficiente)──→ web_search → generate → END
//                         │
//                         └──(tema sensible)─→ ask_human ──(aprobado)─→ web_search
//                                                  └──(rechazado)────→ generate
//
//   • retrieve  : trae contexto del RAG de documentos del usuario (docrag).
//   • grade     : un LLM juzga si el contexto basta para responder.
//   • web_search: si no basta, busca en la web con re-ranking (searchrank).
//   • ask_human : si el tema parece sensible, PAUSA y pide aprobación (interrupt).
//   • generate  : redacta la respuesta final con el contexto reunido.
//
// Todas las dependencias se invocan de forma DEFENSIVA: si una feature no está,
// el nodo degrada en vez de romper.
// ============================================

import { StateGraph, START, END, Interrupt, NodeFn } from './stateGraph'
import { registerGraph } from './runner'
import { chatSingle, chatJSON } from '../../services/openrouter'

// Estado que fluye por el grafo.
interface CragState {
  question: string
  docContext?: string
  webContext?: string
  grade?: 'suficiente' | 'insuficiente' | 'sensible'
  answer?: string
  sources?: { title: string; url: string }[]
  // human-in-the-loop
  resume?: any
  _resumed?: boolean
}

// Contexto inyectado a los nodos (quién pregunta).
interface CragCtx { userId: string }

// ── Nodos ─────────────────────────────────────────────────────────────────

// 1) Recupera contexto del RAG de documentos del usuario (si existe la feature).
const retrieve: NodeFn<CragState, CragCtx> = async (state, ctx) => {
  try {
    const { retrieveRelevant } = await import('../docrag/service')
    const docContext = await retrieveRelevant(ctx.userId, state.question, 5)
    return { docContext: docContext || '' }
  } catch {
    return { docContext: '' } // sin RAG → seguimos, el grade lo marcará insuficiente
  }
}

// 2) Un LLM evalúa si el contexto recuperado basta, o si el tema es sensible.
const grade: NodeFn<CragState, CragCtx> = async (state) => {
  // Heurística rápida de sensibilidad antes de gastar tokens.
  const sensitive = /\b(m[eé]dico|legal|financiero|diagn[oó]stico|invertir|medicamento|dosis)\b/i.test(state.question)
  try {
    const parsed = await chatJSON(
      `Pregunta: "${state.question}"\n\nContexto disponible:\n${(state.docContext || '(vacío)').slice(0, 3000)}\n\n¿El contexto basta para responder bien? Responde SOLO con JSON: { "suficiente": true|false }`,
      'Eres un evaluador estricto de suficiencia de contexto para responder preguntas. Respondes SOLO en JSON.'
    )
    if (sensitive) return { grade: 'sensible' as const }
    return { grade: (parsed?.suficiente ? 'suficiente' : 'insuficiente') as 'suficiente' | 'insuficiente' }
  } catch {
    return { grade: (state.docContext ? 'suficiente' : 'insuficiente') as 'suficiente' | 'insuficiente' }
  }
}

// 3) Pausa para aprobación humana en temas sensibles (human-in-the-loop).
const askHuman: NodeFn<CragState, CragCtx> = (state) => {
  // Si ya nos reanudaron con la decisión del humano, NO volvemos a interrumpir.
  if (state._resumed && state.resume != null) {
    return { _resumed: false } // limpia el flag; el router leerá state.resume
  }
  // Primera vez: lanza la interrupción con lo que el humano debe decidir.
  throw new Interrupt(
    {
      pregunta: state.question,
      motivo: 'El tema parece sensible (salud, legal o finanzas). ¿Buscar en la web fuentes externas para complementar?',
      opciones: ['aprobar', 'rechazar'],
    },
    'ask_human'
  )
}

// 4) Busca en la web con re-ranking (feature searchrank) si el contexto no basta.
const webSearch: NodeFn<CragState, CragCtx> = async (state) => {
  try {
    const { searchAndRank } = await import('../searchrank/ranking')
    const results = await searchAndRank(state.question, 5)
    const webContext = results
      .map((r, i) => `[${i + 1}] ${r.title}\n${(r.content || '').slice(0, 800)}\n${r.url}`)
      .join('\n\n')
    return {
      webContext,
      sources: results.map(r => ({ title: r.title, url: r.url })),
    }
  } catch {
    return { webContext: '' }
  }
}

// 5) Redacta la respuesta final combinando el contexto disponible.
const generate: NodeFn<CragState, CragCtx> = async (state) => {
  const context = [state.docContext, state.webContext].filter(Boolean).join('\n\n---\n\n')
  try {
    const answer = await chatSingle(
      [{
        role: 'user',
        content: `Pregunta: ${state.question}\n\nContexto:\n${context || '(sin contexto adicional)'}\n\nResponde de forma clara y útil. Si usas el contexto, intégralo con naturalidad.`,
      }],
      'claude',
      'Eres DAYA, un asistente experto. Respondes en español, con precisión y sin inventar datos que no estén respaldados.'
    )
    return { answer }
  } catch (e: unknown) {
    return { answer: 'No se pudo generar la respuesta: ' + ((e instanceof Error && e.message) || '') }
  }
}

// ── Construcción del grafo ──────────────────────────────────────────────────

function buildCragGraph(): StateGraph<CragState, CragCtx> {
  const g = new StateGraph<CragState, CragCtx>()

  g.addNode('retrieve', retrieve)
  g.addNode('grade', grade)
  g.addNode('ask_human', askHuman)
  g.addNode('web_search', webSearch)
  g.addNode('generate', generate)

  g.addEdge(START, 'retrieve')
  g.addEdge('retrieve', 'grade')

  // Ramificación tras la evaluación.
  g.addConditionalEdges('grade', (state) => {
    if (state.grade === 'sensible') return 'ask_human'
    if (state.grade === 'insuficiente') return 'web_search'
    return 'generate' // suficiente
  })

  // Tras la decisión humana: aprobar → web; rechazar → generar con lo que hay.
  g.addConditionalEdges('ask_human', (state) => {
    const decision = state.resume
    if (decision === 'aprobar' || decision?.aprobado === true) return 'web_search'
    return 'generate'
  })

  g.addEdge('web_search', 'generate')
  g.addEdge('generate', END)

  return g
}

// ── Registro del flujo ──────────────────────────────────────────────────────

export function registerCragFlow(): void {
  registerGraph({
    name: 'crag',
    build: buildCragGraph,
    initState: (input: any): CragState => ({
      question: String(input?.question || input?.query || '').trim(),
    }),
    buildCtx: (userId: string): CragCtx => ({ userId }),
  })
}
