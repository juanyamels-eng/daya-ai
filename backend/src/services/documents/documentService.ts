import { chatJSON, chatSingle, type JSONResult } from '../../services/openrouter'
import { getCheapModel, registerModelsInUse } from '../modelCatalog'
import { prisma } from '../../lib/prisma'

// Vigilancia: aviso automático si este ID muere en OpenRouter
registerModelsInUse(['moonshotai/kimi-k2.6'], 'documentService (docs de pago)')

// Helper: extrae JSON de forma robusta de la respuesta de la IA
export function extractJSON(text: string): JSONResult {
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  // Buscar el primer { y el último }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1)
  }
  try {
    return JSON.parse(cleaned)
  } catch {
    // Intentar reparar JSON común: comillas, saltos de línea en strings
    try {
      cleaned = cleaned.replace(/[\u0000-\u001F]+/g, ' ')
      return JSON.parse(cleaned)
    } catch {
      console.error('JSON parse failed. Raw response:', text.slice(0, 500))
      throw new Error('La IA no devolvió JSON válido')
    }
  }
}


// ============================================
// DAYA IA — Document Intelligence Center
// Generación, análisis y transformación de docs
// ============================================

export type DocType = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'csv' | 'zip'
export type DocAction = 'generate' | 'analyze' | 'transform' | 'summarize' | 'reorganize' | 'translate'

// La mejor herramienta para cada tarea de generacion:
// - PDF / Word: prosa larga y elegante en espanol -> Claude Sonnet
// - PowerPoint: estructura clara y concisa por slide -> Claude Sonnet
// - Excel / CSV: datos tabulares estructurados -> Llama (rapido y suficiente)
// - resto: Llama por defecto
// Modelo que ESCRIBE el contenido del documento.
// FREE → modelo barato auto-verificado (se auto-cura si desaparece).
// Pago (PRO) → modelo premium auto-verificado (Claude 4.6).
function modelForDocType(docType: DocType, plan?: string): string {
  const isPaid = !!plan && !/free/i.test(plan)
  // Pago → Kimi K2.6: el chino que mejor escribe, y a $3.42 sale cuatro veces
  // más barato que el Sonnet 5 que reemplaza. FREE → el barato del catálogo
  // (DeepSeek V4 Flash), rápido y decente.
  return isPaid ? 'moonshotai/kimi-k2.6' : getCheapModel()
}

export interface GenerateRequest {
  userId: string
  prompt: string
  docType: DocType
  language?: string
  template?: string
  answers?: Record<string, string>  // respuestas a las preguntas de aclaración
  plan?: string                     // plan del usuario (free/pro/team) para elegir modelo
}

export interface AnalyzeRequest {
  userId: string
  fileContent: string
  fileName: string
  fileType: string
  question?: string
}


// ============================================
// BÚSQUEDAS DE IMÁGENES PROFESIONALES (la IA entiende el contexto)
// Ej: para un doc médico sobre "corazón" pide "human heart anatomy",
// no el símbolo romántico. En inglés → mejores fotos de stock.
// ============================================
export async function generateImageQueries(
  topic: string,
  headings: string[]
): Promise<{ cover: string; sections: Record<string, string> }> {
  const empty = { cover: '', sections: {} as Record<string, string> }
  if (!headings.length && !topic) return empty

  try {
    const sys = `You write precise English stock-photo search queries. Return ONLY valid JSON.`
    const ask = `A professional/academic document titled "${topic}" has these sections: ${JSON.stringify(headings)}.
For the cover and EACH section, give a SHORT (2-5 words) ENGLISH search query to find a PROFESSIONAL, RELEVANT, realistic photo.
Rules:
- Disambiguate the real meaning from context (e.g. "corazón" in a medical doc -> "human heart anatomy", NOT love hearts).
- Prefer concrete, photographic subjects. Avoid abstract/decorative/romantic terms.
- All queries in English.
Respond ONLY with this JSON:
{"cover": "query", "sections": {${headings.map(h => `"${h}": "query"`).join(', ')}}}`

    const parsed = await chatJSON(ask, sys, 'deepseek/deepseek-v4-pro')
    if (parsed && typeof parsed.cover === 'string') {
      const sections: Record<string, string> = {}
      for (const [k, v] of Object.entries((parsed.sections as Record<string, unknown>) || {})) {
        if (typeof v === 'string') sections[k] = v
      }
      return { cover: parsed.cover, sections }
    }
  } catch (err) {
    console.error('Error generando queries de imagen:', err instanceof Error ? err.message : err)
  }
  return empty
}

export async function generateDocumentContent(req: GenerateRequest): Promise<{
  title: string
  content: string
  sections: { heading: string; body: string }[]
  metadata: { docType: DocType; language: string; wordCount: number }
}> {
  const systemPrompt = `Eres un redactor profesional SENIOR (nivel consultoría de élite). Produces documentos que se entregan a un cliente exigente: precisos, específicos y sin relleno.
ESTÁNDAR DE CALIDAD (innegociable):
- Especificidad sobre generalidad: cada afirmación lleva un dato, ejemplo, mecanismo o consecuencia concreta. CERO frases de relleno ("es importante destacar que…", "en el mundo actual…", "en conclusión, podemos decir…").
- Argumentación estructurada: cada sección plantea una idea, la desarrolla con evidencia o ejemplos y cierra con su implicación práctica.
- Prosa fluida y profesional con transiciones entre ideas; el cuerpo NO es una lista de viñetas sueltas.
- NUNCA uses placeholders entre corchetes ([Nombre], [Fecha], [Empresa]). Si falta un dato, usa uno realista y concreto coherente con el tema.
- Cada sección: 2-4 párrafos sustanciales, no una sola frase.
- Responde SOLO en JSON válido con la estructura exacta.
Idioma: ${req.language || 'es'}`

  const typeInstructions: Record<DocType, string> = {
    pdf: 'documento ejecutivo completo y detallado, con introducción desarrollada, varias secciones de desarrollo con contenido real, y conclusiones',
    word: 'documento Word profesional y extenso, con título, resumen ejecutivo, y secciones detalladas con contenido completo',
    excel: 'datos tabulares con encabezados de columna, filas de datos y fila de totales cuando aplique',
    powerpoint: 'presentación con máximo 10 slides: portada, agenda, contenido y cierre. Cada slide con título y puntos clave. Incluye descripción de imagen relevante para cada slide.',
    image: 'descripción detallada de infografía o imagen a generar',
    csv: 'datos CSV con encabezados y filas estructuradas',
    zip: 'archivo comprimido (no se genera por IA; solo empaquetado de archivos)',
  }

  // Preferencias del usuario (de las preguntas de aclaración), si las hay
  const prefs = req.answers && Object.keys(req.answers).length
    ? `\nPREFERENCIAS DEL USUARIO (respétalas):\n${Object.entries(req.answers).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n`
    : ''

  const prompt = `Crea un ${typeInstructions[req.docType]} sobre: "${req.prompt}"
${prefs}
IMPORTANTE — calidad profesional:
- Genera contenido REAL y COMPLETO, como la versión final lista para entregar a un cliente.
- Estructura clara: una introducción que enmarca el tema y por qué importa, 4 a 6 secciones de desarrollo con encabezado "## ", y una conclusión con recomendaciones o próximos pasos ACCIONABLES (no un mero resumen).
- Cada sección: 2-4 párrafos sustanciales con detalle, ejemplos concretos y, cuando aplique, datos/cifras verosímiles (NUNCA placeholders entre corchetes).
- Especificidad máxima: nada de relleno genérico; cada párrafo aporta información real.
- El campo "content" en markdown, extenso, mínimo 700 palabras de contenido sustancial.
- También llena "sections" con las mismas secciones (heading + body desarrollado).

Responde SOLO con JSON:
{
  "title": "título profesional y específico del documento",
  "content": "contenido completo en markdown, con ## para cada sección y párrafos desarrollados",
  "sections": [
    {"heading": "nombre de la sección", "body": "contenido completo de la sección, varios párrafos"}
  ]
}`

  const parsed = await chatJSON(prompt, systemPrompt, modelForDocType(req.docType, req.plan), 8000)

  // Reúne el contenido de forma robusta
  let content: string = (parsed.content || parsed.body || '').toString().trim()
  const sections = Array.isArray(parsed.sections) ? parsed.sections.filter((s: JSONResult) => s && (s.heading || s.body)) : []

  // Si "content" vino vacío o muy corto pero hay secciones, arma el contenido con ellas
  if (content.length < 120 && sections.length) {
    content = sections.map((s: JSONResult) => `## ${s.heading || ''}\n\n${s.body || ''}`.trim()).join('\n\n')
  }

  // ÚLTIMO RESPALDO: si todavía no hay contenido real, lo pedimos como PROSA directa
  // (sin JSON, que es lo que a veces falla). Así el documento NUNCA sale vacío.
  if (content.replace(/[#\s]/g, '').length < 120) {
    try {
      const proseSys = `Eres un redactor profesional. Escribe en español, en MARKDOWN, un documento completo y bien estructurado: una introducción, 4-6 secciones con encabezado "## " y 2-3 párrafos cada una con contenido real y concreto (inventa datos verosímiles si hace falta, sin corchetes), y una conclusión. Mínimo 600 palabras. No escribas nada fuera del documento.`
      const prose = await chatSingle(
        [{ role: 'user', content: `Tema del documento: "${req.prompt}".${prefs}` }],
        'claude', proseSys, modelForDocType(req.docType, req.plan)
      )
      if (prose && prose.trim().length > content.length) content = prose.trim()
    } catch { /* mantenemos lo que haya */ }
  }

  // Garantía final mínima para no romper el render
  if (!content.trim()) content = `## ${parsed.title || req.prompt}\n\nNo fue posible generar el contenido en este intento. Por favor vuelve a intentarlo.`

  const title = (parsed.title || '').toString().trim() || req.prompt.slice(0, 60)
  return {
    title,
    content,
    sections,
    metadata: {
      docType: req.docType,
      language: req.language || 'es',
      wordCount: content.split(/\s+/).filter(Boolean).length,
    }
  }
}

// ============================================
// ANÁLISIS DE ARCHIVOS — documento COMPLETO (map-reduce por trozos)
// ============================================

const CHUNK_SIZE = 12000      // caracteres por trozo (~2500 palabras)
const MODEL_ANALYZE = 'deepseek/deepseek-v4-pro'

// Divide un texto largo en trozos respetando límites de párrafo cuando es posible.
function splitIntoChunks(text: string, size = CHUNK_SIZE): string[] {
  if (text.length <= size) return [text]
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + size, text.length)
    if (end < text.length) {
      // intenta cortar en el último salto de párrafo dentro del trozo
      const lastBreak = text.lastIndexOf('\n\n', end)
      if (lastBreak > i + size * 0.5) end = lastBreak
    }
    chunks.push(text.slice(i, end))
    i = end
  }
  return chunks
}

// Análisis de un documento generado por el modelo
interface DocAnalysis {
  summary: string
  keyPoints: string[]
  insights: string[]
  suggestions: string[]
  answer?: string
  truncated?: boolean
}

export async function analyzeFile(req: AnalyzeRequest): Promise<DocAnalysis> {
  const systemPrompt = `Eres un experto analizando documentos y archivos.
Extrae información valiosa, identifica puntos clave y proporciona insights útiles.
Responde en JSON válido.`

  const chunks = splitIntoChunks(req.fileContent)

  // Documento corto: un solo paso (rápido).
  if (chunks.length === 1) {
    const prompt = `Analiza este archivo "${req.fileName}" (tipo: ${req.fileType}):

CONTENIDO:
${chunks[0]}

${req.question ? `PREGUNTA ESPECÍFICA: ${req.question}` : ''}

Responde SOLO con JSON:
{
  "summary": "resumen ejecutivo del documento en 2-3 oraciones",
  "keyPoints": ["punto clave 1", "punto clave 2", "punto clave 3"],
  "insights": ["insight valioso 1", "insight valioso 2"],
  "suggestions": ["sugerencia de mejora 1", "sugerencia 2"],
  "answer": "${req.question ? 'respuesta específica a la pregunta' : ''}"
}`
    return await chatJSON(prompt, systemPrompt, MODEL_ANALYZE) as unknown as DocAnalysis
  }

  // Documento largo: MAP — analizar cada trozo en paralelo.
  const partials = await Promise.all(
    chunks.map((chunk, idx) =>
      chatJSON(
        `Analiza la parte ${idx + 1} de ${chunks.length} del archivo "${req.fileName}".

CONTENIDO (parte ${idx + 1}):
${chunk}

Responde SOLO con JSON:
{ "keyPoints": ["..."], "insights": ["..."] }`,
        systemPrompt,
        MODEL_ANALYZE
      ).catch(() => ({ keyPoints: [], insights: [] }))
    )
  )

  // REDUCE — combinar los hallazgos parciales en un análisis final coherente.
  const allKeyPoints = partials.flatMap((p: JSONResult) =>
    Array.isArray(p.keyPoints) ? p.keyPoints.filter((k): k is string => typeof k === 'string') : []
  )
  const allInsights = partials.flatMap((p: JSONResult) =>
    Array.isArray(p.insights) ? p.insights.filter((k): k is string => typeof k === 'string') : []
  )

  const reducePrompt = `Tengo el análisis por partes de un documento largo llamado "${req.fileName}".
Combínalos en un análisis final coherente, sin repetir, priorizando lo más importante.

PUNTOS CLAVE DETECTADOS:
${allKeyPoints.map((k) => `- ${k}`).join('\n')}

INSIGHTS DETECTADOS:
${allInsights.map((k) => `- ${k}`).join('\n')}

${req.question ? `PREGUNTA ESPECÍFICA DEL USUARIO: ${req.question}` : ''}

Responde SOLO con JSON:
{
  "summary": "resumen ejecutivo de TODO el documento en 3-4 oraciones",
  "keyPoints": ["los 5-7 puntos más importantes consolidados"],
  "insights": ["los 3-5 insights más valiosos"],
  "suggestions": ["sugerencias de mejora o próximos pasos"],
  "answer": "${req.question ? 'respuesta específica usando todo el documento' : ''}"
}`

  const final = await chatJSON(reducePrompt, systemPrompt, MODEL_ANALYZE)
  return { ...final, truncated: false } as unknown as DocAnalysis // se analizó el documento completo
}

// ============================================
// REORGANIZACIÓN Y MEJORA
// ============================================

export async function reorganizeDocument(
  content: string,
  instruction: string,
  _docType: DocType
): Promise<{ reorganized: string; changes: string[] }> {
  const prompt = `Reorganiza y mejora este documento según la instrucción.

DOCUMENTO ORIGINAL:
${content.slice(0, 6000)}

INSTRUCCIÓN: ${instruction}

Responde SOLO con JSON:
{
  "reorganized": "contenido reorganizado y mejorado",
  "changes": ["cambio realizado 1", "cambio realizado 2"]
}`

  return await chatJSON(prompt, undefined, 'deepseek/deepseek-v4-pro') as unknown as { reorganized: string; changes: string[] }
}

// ============================================
// TRANSFORMACIÓN ENTRE FORMATOS
// ============================================

export async function transformDocument(
  content: string,
  fromType: DocType,
  toType: DocType
): Promise<{ transformed: string; notes: string }> {
  const prompt = `Transforma este contenido de ${fromType} a formato ${toType}.

CONTENIDO:
${content.slice(0, 6000)}

Adapta el contenido al nuevo formato manteniendo toda la información importante.
Responde SOLO con JSON:
{
  "transformed": "contenido transformado al nuevo formato",
  "notes": "notas sobre la transformación realizada"
}`

  return await chatJSON(prompt, undefined, 'deepseek/deepseek-v4-pro') as unknown as { transformed: string; notes: string }
}

// ============================================
// RESUMEN EJECUTIVO
// ============================================

export async function summarizeDocument(
  content: string,
  style: 'bullet' | 'paragraph' | 'executive' = 'executive',
  maxWords: number = 200
): Promise<{ summary: string; tldr: string }> {
  const chunks = splitIntoChunks(content)

  // Documento corto: resumen directo.
  if (chunks.length === 1) {
    const prompt = `Crea un resumen ${style} de máximo ${maxWords} palabras de este contenido:

${chunks[0]}

Responde SOLO con JSON:
{ "summary": "resumen completo", "tldr": "una sola oración que capture la esencia" }`
    return await chatJSON(prompt, undefined, MODEL_ANALYZE) as unknown as { summary: string; tldr: string }
  }

  // Documento largo: resumir cada trozo y luego resumir los resúmenes.
  const partialSummaries = await Promise.all(
    chunks.map((chunk, idx) =>
      chatJSON(
        `Resume la parte ${idx + 1} de ${chunks.length} de un documento en máximo 120 palabras:

${chunk}

Responde SOLO con JSON: { "summary": "resumen de esta parte" }`,
        undefined,
        MODEL_ANALYZE
      ).catch(() => ({ summary: '' }))
    )
  )

  const combined = partialSummaries.map((p: JSONResult) => p.summary).filter(Boolean).join('\n\n')
  const finalPrompt = `Combina estos resúmenes parciales en un único resumen ${style} de máximo ${maxWords} palabras del documento completo:

${combined}

Responde SOLO con JSON:
{ "summary": "resumen final del documento completo", "tldr": "una sola oración que capture la esencia" }`

  return await chatJSON(finalPrompt, undefined, MODEL_ANALYZE) as unknown as { summary: string; tldr: string }
}

// ============================================
// GUARDAR DOCUMENTO EN BIBLIOTECA
// ============================================

export async function saveToLibrary(
  userId: string,
  fileName: string,
  fileType: DocType,
  content: string,
  size: number
): Promise<string> {
  const doc = await prisma.libraryDocument.create({
    data: {
      userId,
      fileName,
      fileType,
      content,
      size,
      category: getCategory(fileType),
    }
  })
  // Indexa el documento para RAG ("chatea con tus documentos"). Sin bloquear la
  // subida: si falla (p. ej. sin clave de embeddings), no afecta al guardado.
  import('../../features/docrag/service')
    .then(m => m.indexDocument(userId, doc.id, fileName, content))
    .catch(() => {})
  return doc.id
}

function getCategory(fileType: DocType): string {
  if (['pdf', 'word'].includes(fileType)) return 'docs'
  if (fileType === 'image') return 'images'
  if (['excel', 'csv'].includes(fileType)) return 'data'
  if (fileType === 'powerpoint') return 'presentations'
  return 'other'
}

export async function getLibraryDocuments(userId: string, category?: string) {
  return prisma.libraryDocument.findMany({
    where: { userId, ...(category ? { category } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function deleteLibraryDocument(userId: string, docId: string) {
  await prisma.libraryDocument.deleteMany({ where: { id: docId, userId } })
  import('../../features/docrag/service').then(m => m.removeDocumentChunks(userId, docId)).catch(() => {})
}
