// ============================================
// DAYA IA — Modo Agente (tool-use / orquestación)
// DAYA decide sola qué herramientas usar y las ENCADENA para resolver una tarea:
// buscar en la web, leer páginas (incl. sitios con JS), y consultar los documentos
// del usuario (RAG pgvector). Es la capa que une todo lo que DAYA ya sabe hacer.
// Usa function-calling del modelo (Claude vía OpenRouter). Tolerante a fallos.
//
// Las herramientas viven en ./tools (una por archivo) y se registran en el
// registro central: TOOLS_SCHEMAS para el LLM y runTool() para ejecutarlas.
// ============================================
import getClient, { MODELS, ChatMessage, toOpenAIMessages } from '../../services/openrouter'
import { TOOLS_SCHEMAS, runTool } from './tools'

export interface AgentStep { tool: string; input: Record<string, unknown>; output: string }
export interface AgentResult { answer: string; steps: AgentStep[] }

// Las herramientas del agente están registradas en ./tools (una por archivo).
// runTool se re-exporta para compatibilidad con tests que la importaban de aquí.
export { runTool } from './tools'

const SYSTEM = `Eres DAYA en MODO AGENTE. Tienes herramientas para buscar en la web, leer páginas, consultar los documentos del usuario, CALCULAR con exactitud, GENERAR imágenes, ANALIZAR imágenes por su URL, EXTRAER texto de imágenes (OCR), RESUMIR videos de YouTube, CREAR diagramas mermaid, leer texto EN VOZ ALTA (hablar), CREAR documentos descargables (PDF/Word), CREAR tareas, notas y eventos de calendario, y AUTOMATIZAR tareas repetitivas (crear_automatizacion, gestionar_automatizaciones). Piensa qué necesitas, usa las herramientas que hagan falta (varias y encadenadas si es necesario) y luego responde de forma clara, útil y en español. Cita las fuentes (URLs) cuando uses información de la web. Para CUALQUIER operación numérica usa SIEMPRE la herramienta calcular. Si generas una imagen, INCLÚYELA en tu respuesta con markdown ![desc](url). Si generas un diagrama, INCLÚYELO en un bloque \`\`\`mermaid\`\`\`. Si generas audio, INCLUYE el enlace en tu respuesta. Si el usuario pide automatizar algo repetitivo ("cada mañana…", "que se repita…"), usa crear_automatizacion. Nunca inventes datos: si las herramientas no dan la respuesta, dilo con honestidad.`

/* ────────────────────────────────────────────────────────────────────────────
   Solo la parte de HERRAMIENTAS, para el chat normal.

   runAgent hace dos cosas: usa herramientas y luego redacta. El chat ya sabe
   redactar —y encima en streaming, que es lo que hace que se sienta vivo—, así
   que aquí se le presta únicamente lo primero: se deja al modelo pedir
   herramientas, se ejecutan, y se devuelve lo que sacaron en limpio para que el
   chat lo tenga como contexto al escribir. Nadie redacta dos veces.

   El modelo que PLANIFICA es el barato a propósito: elegir entre diez
   herramientas es mucho más fácil que redactar, y la calidad de la respuesta la
   sigue poniendo el modelo que el chat haya elegido para escribir.

   Cuatro pasos y no seis: aquí el usuario está esperando con el chat en blanco,
   y cada paso son varios segundos antes de la primera palabra.
   ──────────────────────────────────────────────────────────────────────────── */
export interface ToolContext { steps: AgentStep[]; context: string }

export async function gatherToolContext(
  userId: string,
  message: string,
  history: ChatMessage[] = [],
  onStep?: (tool: string) => void,
): Promise<ToolContext> {
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const system = `Eres el planificador de herramientas de DAYA. NO redactes la respuesta final: otro modelo lo hará. Tu único trabajo es decidir qué herramientas hacen falta para responder al usuario y llamarlas. Si no hace falta ninguna, contesta con una sola palabra: NADA.\n\nFecha actual: ${today}.`
  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...history.slice(-4), { role: 'user', content: message }]
  const steps: AgentStep[] = []
  const MAX_STEPS = 4

  for (let i = 0; i < MAX_STEPS; i++) {
    const res = await getClient().chat.completions.create({
      model: MODELS.flash,
      messages: toOpenAIMessages(messages),
      tools: TOOLS_SCHEMAS,
      tool_choice: 'auto',
      max_tokens: 700,
    })
    const msg = res.choices?.[0]?.message
    if (!msg) break

    const toolCalls = msg.tool_calls
    if (!toolCalls || !toolCalls.length) break   // ya no pide nada más

// Convert OpenAI message to our ChatMessage format (handle nullable content)
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content || ''
      })
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
      onStep?.(tc.function?.name)
      const output = await runTool(userId, tc.function?.name, args)
      steps.push({ tool: tc.function?.name, input: args, output: output.slice(0, 600) })
      messages.push({ role: 'tool', tool_call_id: tc.id, content: output })
    }
  }

  if (!steps.length) return { steps, context: '' }

  // Se entrega como contexto etiquetado, igual que el bloque de la búsqueda web:
  // el modelo que escribe lo lee como material de trabajo, no como una orden.
  const context = '\n\n[HERRAMIENTAS EJECUTADAS PARA ESTE MENSAJE — usa estos resultados como fuente y no los repitas literalmente]\n'
    + steps.map(s => `· ${s.tool}(${JSON.stringify(s.input).slice(0, 200)}) →\n${s.output}`).join('\n\n')

  return { steps, context }
}

export async function runAgent(userId: string, message: string, history: ChatMessage[] = []): Promise<AgentResult> {
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const system = `${SYSTEM}\n\nFecha actual: ${today}. Úsala para "hoy", fechas relativas (mañana, la próxima semana) y para saber qué información es reciente. Nunca digas que no sabes la fecha.`
  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }]
  const steps: AgentStep[] = []
  const MAX_STEPS = 6

  for (let i = 0; i < MAX_STEPS; i++) {
    const res = await getClient().chat.completions.create({
      model: MODELS.claude,
      messages: toOpenAIMessages(messages),
      tools: TOOLS_SCHEMAS,
      tool_choice: 'auto',
      max_tokens: 1800,
    })
    const msg = res.choices?.[0]?.message
    if (!msg) break

    const toolCalls = msg.tool_calls
    if (toolCalls && toolCalls.length) {
      // Convert OpenAI message to our ChatMessage format (handle nullable content)
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content || ''
      })
      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
        const output = await runTool(userId, tc.function?.name, args)
        steps.push({ tool: tc.function?.name, input: args, output: output.slice(0, 600) })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: output })
      }
      continue
    }

    // Sin más herramientas → respuesta final.
    return { answer: (msg.content || '').trim() || 'No pude generar una respuesta.', steps }
  }

  // Se agotaron los pasos: fuerza una respuesta final con lo reunido (sin más herramientas).
  const final = await getClient().chat.completions.create({
    model: MODELS.claude,
    messages: toOpenAIMessages([...messages, { role: 'user', content: 'Da tu mejor respuesta final ahora con la información que ya tienes.' }]),
    max_tokens: 1500,
  })
  return { answer: (final.choices?.[0]?.message?.content || '').trim() || 'No pude completar la tarea.', steps }
}
