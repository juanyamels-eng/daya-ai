// ============================================
// DAYA IA — Modo Agente (tool-use / orquestación)
// DAYA decide sola qué herramientas usar y las ENCADENA para resolver una tarea:
// buscar en la web, leer páginas (incl. sitios con JS), y consultar los documentos
// del usuario (RAG pgvector). Es la capa que une todo lo que DAYA ya sabe hacer.
// Usa function-calling del modelo (Claude vía OpenRouter). Tolerante a fallos.
// ============================================
import getClient, { MODELS, ChatMessage } from '../../services/openrouter'
import { evaluate } from 'mathjs'
import { prisma } from '../../lib/prisma'
import { searchAndRank } from '../searchrank/ranking'
import { readPageText } from '../readurl/route'
import { retrieveRelevant } from '../docrag/service'

export interface AgentStep { tool: string; input: any; output: string }
export interface AgentResult { answer: string; steps: AgentStep[] }

// Herramientas que el modelo puede invocar (cada una reutiliza una capacidad ya
// construida de DAYA). Descripciones en español para guiar bien al modelo.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_web',
      description: 'Busca en la web y devuelve resultados (título, URL, extracto). Úsalo para información actual, noticias, precios o cualquier cosa que no sepas con certeza.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'La consulta de búsqueda' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'leer_url',
      description: 'Lee el contenido completo de una página web (funciona incluso con sitios que cargan por JavaScript). Úsalo para profundizar en un resultado de búsqueda o en un enlace que dé el usuario.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'La URL a leer' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_en_documentos',
      description: 'Busca por significado en los documentos que el usuario subió a su biblioteca. Úsalo cuando pregunte sobre sus propios archivos o cuando la respuesta pueda estar en ellos.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Qué buscar en los documentos del usuario' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcular',
      description: 'Evalúa una expresión matemática y devuelve el resultado EXACTO. Úsalo SIEMPRE para cualquier cálculo numérico (aritmética, porcentajes, potencias, raíces, estadística como mean/median/std, conversiones de unidades como "19 inch to cm", interés compuesto, etc.) en vez de calcular de cabeza. Sintaxis de mathjs.',
      parameters: { type: 'object', properties: { expresion: { type: 'string', description: 'La expresión a evaluar, p. ej. "1000*(1+0.05)^10" o "mean([3,7,8,5])"' } }, required: ['expresion'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_imagen',
      description: 'Genera una imagen a partir de una descripción y devuelve su URL. Úsalo cuando el usuario pida crear/dibujar/generar una imagen. DEBES incluir la imagen en tu respuesta final en markdown: ![descripción](url).',
      parameters: { type: 'object', properties: { descripcion: { type: 'string', description: 'Descripción visual detallada, mejor en inglés para más calidad' } }, required: ['descripcion'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description: 'Crea una tarea pendiente en la cuenta del usuario. Úsalo cuando pida agendar, recordar o apuntar algo POR HACER.',
      parameters: { type: 'object', properties: { titulo: { type: 'string' }, prioridad: { type: 'string', enum: ['low', 'normal', 'high'] }, fecha: { type: 'string', description: 'Fecha límite en formato ISO (YYYY-MM-DD), opcional' } }, required: ['titulo'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_nota',
      description: 'Guarda una nota en la cuenta del usuario. Úsalo cuando pida anotar, guardar o recordar INFORMACIÓN (no una tarea por hacer).',
      parameters: { type: 'object', properties: { titulo: { type: 'string' }, contenido: { type: 'string' } }, required: ['contenido'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_evento',
      description: 'Crea un evento en el calendario del usuario (citas, reuniones, recordatorios con fecha y hora). Calcula la fecha ISO usando la fecha actual que conoces.',
      parameters: { type: 'object', properties: { titulo: { type: 'string' }, inicio: { type: 'string', description: 'Inicio en ISO 8601, p.ej. 2026-07-10T15:00:00' }, fin: { type: 'string', description: 'Fin en ISO 8601 (opcional)' }, notas: { type: 'string' } }, required: ['titulo', 'inicio'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_documento',
      description: 'Maqueta y publica un documento REAL descargable (PDF o Word) con diseño profesional. TÚ escribes el contenido completo en markdown (## para secciones, listas, **negritas**) y lo pasas en contenido_markdown. Úsalo cuando pidan un informe, ensayo, carta o propuesta. Devuelve el enlace de descarga: INCLÚYELO en tu respuesta final como link markdown [título](url).',
      parameters: { type: 'object', properties: { titulo: { type: 'string' }, contenido_markdown: { type: 'string', description: 'El contenido COMPLETO del documento en markdown, escrito por ti' }, formato: { type: 'string', enum: ['pdf', 'word'] } }, required: ['titulo', 'contenido_markdown'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_imagen',
      description: 'Analiza o describe el contenido de una imagen a partir de su URL: fotos, capturas de pantalla, gráficos, diagramas, texto en imágenes. Úsalo cuando el usuario comparta una URL de imagen o pida analizar una.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL de la imagen (http/https)' }, pregunta: { type: 'string', description: 'Qué quieres saber de la imagen (opcional)' } }, required: ['url'] },
    },
  },
]

// Exportada para poder probar las herramientas de forma determinista (sin el loop LLM).
export async function runTool(userId: string, name: string, args: any): Promise<string> {
  try {
    if (name === 'buscar_web') {
      const r = await searchAndRank(String(args?.query || ''), 5)
      if (!r.length) return 'Sin resultados.'
      return r.map((x: any, i: number) => `${i + 1}. ${x.title}\n${x.url}\n${x.snippet || ''}`).join('\n\n').slice(0, 4000)
    }
    if (name === 'leer_url') {
      const r = await readPageText(String(args?.url || ''))
      return ('error' in r) ? `No pude leer la página: ${r.error}` : r.text.slice(0, 6000)
    }
    if (name === 'buscar_en_documentos') {
      const r = await retrieveRelevant(userId, String(args?.query || ''), 5)
      return r || 'No encontré nada relevante en los documentos del usuario.'
    }
    if (name === 'calcular') {
      const expr = String(args?.expresion || '').slice(0, 500).trim()
      if (!expr) return 'Falta la expresión a calcular.'
      // mathjs.evaluate no expone Node (import/process/fs quedan bloqueados) → seguro.
      const out = evaluate(expr)
      return `${expr} = ${typeof out === 'object' ? JSON.stringify(out) : String(out)}`
    }
    if (name === 'generar_imagen') {
      const p = String(args?.descripcion || '').trim()
      if (!p) return 'Falta la descripción de la imagen.'
      const seed = Math.floor(Math.random() * 1_000_000)
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`
      return `Imagen generada. Inclúyela EN TU RESPUESTA en markdown así: ![${p.slice(0, 60)}](${url})`
    }
    if (name === 'crear_tarea') {
      const title = String(args?.titulo || '').trim()
      if (!title) return 'Falta el título de la tarea.'
      const priority = ['low', 'normal', 'high'].includes(args?.prioridad) ? args.prioridad : 'normal'
      let dueDate: Date | undefined
      if (args?.fecha) { const d = new Date(String(args.fecha)); if (!isNaN(d.getTime())) dueDate = d }
      await prisma.task.create({ data: { userId, title, priority, dueDate } })
      return `✓ Tarea creada: "${title}"${dueDate ? ` (para ${dueDate.toISOString().slice(0, 10)})` : ''}.`
    }
    if (name === 'crear_nota') {
      const content = String(args?.contenido || '').trim()
      if (!content) return 'Falta el contenido de la nota.'
      const title = String(args?.titulo || '').trim() || content.slice(0, 40)
      await prisma.note.create({ data: { userId, title, content } })
      return `✓ Nota guardada: "${title}".`
    }
    if (name === 'crear_evento') {
      const title = String(args?.titulo || '').trim()
      if (!title) return 'Falta el título del evento.'
      const start = new Date(String(args?.inicio || ''))
      if (isNaN(start.getTime())) return 'Falta una fecha/hora de inicio válida (ISO).'
      let end: Date | undefined
      if (args?.fin) { const e = new Date(String(args.fin)); if (!isNaN(e.getTime())) end = e }
      const notes = String(args?.notas || '').slice(0, 500)
      await prisma.calendarEvent.create({ data: { userId, title, start, end, notes } })
      return `✓ Evento creado: "${title}" el ${start.toLocaleString('es-ES')}.`
    }
    if (name === 'crear_documento') {
      // El AGENTE escribe el contenido (ya es un modelo excelente); esta herramienta
      // solo maqueta y publica. Así evitamos el generador interno (otra llamada LLM de
      // ~2 min) y el agente responde en segundos, no en minutos.
      const titulo = String(args?.titulo || '').trim().slice(0, 120)
      const md = String(args?.contenido_markdown || '').trim()
      if (!titulo || md.length < 80) return 'Faltan el título o el contenido (escribe el documento completo en markdown en contenido_markdown).'
      const formato = args?.formato === 'word' ? 'word' : 'pdf'
      // Misma cuota que el generador de documentos del chat (FREE 3/día, etc.).
      const { consumeQuota, refundQuota } = await import('../../services/quota')
      const q = await consumeQuota(userId, 'document')
      if (!q.ok) return `No se pudo crear el documento: ${q.error}`
      try {
        const { saveToLibrary } = await import('../../services/documents/documentService')
        const userPlan = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
        const branded = /free/i.test(userPlan?.plan || 'free')
        const slug = titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'documento'
        let content: Buffer
        let mime: string
        let fileName: string
        if (formato === 'word') {
          const { buildDOCX } = await import('../../services/documents/docxGenerator')
          content = await buildDOCX(titulo, md, titulo, branded, 'ejecutivo')
          mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          fileName = `${slug}.docx`
        } else {
          const { buildProfessionalHTML } = await import('../../services/documents/pdfGenerator')
          const { htmlToPDF } = await import('../../services/documents/pdfRenderer')
          const html = buildProfessionalHTML(titulo, md, [], null, undefined, branded, 'ejecutivo')
          content = await htmlToPDF(html)
          mime = 'application/pdf'
          fileName = `${slug}.pdf`
        }
        const stored = `__B64__:${mime}:${content.toString('base64')}`
        const docId = await saveToLibrary(userId, fileName, formato, stored, content.length)
        const base = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${process.env.PORT || 4000}`
        return `✓ Documento ${formato.toUpperCase()} creado: "${titulo}". Enlace de descarga (inclúyelo en tu respuesta como link markdown): ${base}/api/documents/download/${docId}`
      } catch (e: any) {
        await refundQuota(userId, 'document').catch(() => {})
        return `Falló la creación del documento: ${e?.message || e}`
      }
    }
    if (name === 'ver_imagen') {
      const url = String(args?.url || '').trim()
      let host = ''
      try { const u = new URL(url); host = u.hostname; if (!/^https?:$/.test(u.protocol)) return 'La URL debe ser http/https.' } catch { return 'URL de imagen no válida.' }
      // Anti-SSRF básico: nada de hosts internos.
      if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|fe80:|fc00:|fd)/i.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'No se permite esa dirección.'
      const q = String(args?.pregunta || '').slice(0, 500) || 'Describe con detalle qué hay en esta imagen.'
      // Descargamos la imagen y la mandamos en base64 (como el chat): los proveedores
      // fallan al buscar URLs externas ellos mismos, y así evitamos bloqueos por UA.
      let dataUrl: string
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 12000)
        const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'image/*,*/*' } }).finally(() => clearTimeout(timer))
        if (!resp.ok) return `No pude descargar la imagen (HTTP ${resp.status}).`
        const ct = resp.headers.get('content-type') || 'image/jpeg'
        if (!/^image\//.test(ct)) return 'Esa URL no apunta a una imagen.'
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length > 8 * 1024 * 1024) return 'La imagen es demasiado grande (máx 8 MB).'
        dataUrl = `data:${ct};base64,${buf.toString('base64')}`
      } catch { return 'No pude descargar la imagen (¿enlace directo a un archivo de imagen?).' }
      const askVision = (model: string) => getClient().chat.completions.create({
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: q }, { type: 'image_url', image_url: { url: dataUrl } }] as any }],
        max_tokens: 800,
      })
      let res
      try { res = await askVision(MODELS.flash) }
      catch { res = await askVision(MODELS.claude) }
      return (res.choices?.[0]?.message?.content || '').trim() || 'No pude analizar la imagen.'
    }
    return 'Herramienta desconocida.'
  } catch (e: any) {
    return `La herramienta «${name}» falló: ${e?.message || e}`
  }
}

const SYSTEM = `Eres DAYA en MODO AGENTE. Tienes herramientas para buscar en la web, leer páginas, consultar los documentos del usuario, CALCULAR con exactitud, GENERAR imágenes, ANALIZAR imágenes por su URL, CREAR documentos descargables (PDF/Word) y CREAR tareas, notas y eventos de calendario en la cuenta del usuario. Piensa qué necesitas, usa las herramientas que hagan falta (varias y encadenadas si es necesario) y luego responde de forma clara, útil y en español. Cita las fuentes (URLs) cuando uses información de la web. Para CUALQUIER operación numérica usa SIEMPRE la herramienta calcular. Si generas una imagen, INCLÚYELA en tu respuesta con markdown ![desc](url). Nunca inventes datos: si las herramientas no dan la respuesta, dilo con honestidad.`

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
  const messages: any[] = [{ role: 'system', content: system }, ...history.slice(-4), { role: 'user', content: message }]
  const steps: AgentStep[] = []
  const MAX_STEPS = 4

  for (let i = 0; i < MAX_STEPS; i++) {
    const res = await getClient().chat.completions.create({
      model: MODELS.flash,
      messages,
      tools: TOOLS as any,
      tool_choice: 'auto',
      max_tokens: 700,
    })
    const msg: any = res.choices?.[0]?.message
    if (!msg) break

    const toolCalls = msg.tool_calls
    if (!toolCalls || !toolCalls.length) break   // ya no pide nada más

    messages.push(msg)
    for (const tc of toolCalls) {
      let args: any = {}
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
  const messages: any[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }]
  const steps: AgentStep[] = []
  const MAX_STEPS = 6

  for (let i = 0; i < MAX_STEPS; i++) {
    const res = await getClient().chat.completions.create({
      model: MODELS.claude,
      messages,
      tools: TOOLS as any,
      tool_choice: 'auto',
      max_tokens: 1800,
    })
    const msg: any = res.choices?.[0]?.message
    if (!msg) break

    const toolCalls = msg.tool_calls
    if (toolCalls && toolCalls.length) {
      messages.push(msg) // el mensaje del asistente que PIDE las herramientas
      for (const tc of toolCalls) {
        let args: any = {}
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
    messages: [...messages, { role: 'user', content: 'Da tu mejor respuesta final ahora con la información que ya tienes.' }],
    max_tokens: 1500,
  })
  return { answer: (final.choices?.[0]?.message?.content || '').trim() || 'No pude completar la tarea.', steps }
}
