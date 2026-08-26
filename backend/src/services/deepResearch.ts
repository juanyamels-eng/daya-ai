// ============================================
// DAYA IA — Motor de Investigación Profunda (Deep Research)
// Orquesta: búsqueda web → limpieza → mega-informe → PDF
// ============================================
import { searchWeb, buildSmartSubQueries, isWebSearchConfigured, SearchResult } from './webSearch'
import { chatJSON } from './openrouter'

export { isWebSearchConfigured }

export interface DeepResearchResult {
  title: string
  markdown: string       // informe completo en markdown (para generar PDF)
  sources: { title: string; url: string }[]
}

// Ejecuta el flujo completo de investigación profunda sobre un tema.
// MULTI-PASO: tras una primera lectura, identifica HUECOS de información y hace
// rondas adicionales de búsqueda dirigida antes de redactar el informe final.
// (rounds = número total de rondas de búsqueda; 2 por defecto).
export async function runDeepResearch(
  topic: string,
  opts: { rounds?: number; onProgress?: (msg: string) => void } = {}
): Promise<DeepResearchResult> {
  const rounds = Math.max(1, Math.min(opts.rounds ?? 2, 4))
  const log = opts.onProgress || (() => {})

  const seen = new Set<string>()
  const allSources: SearchResult[] = []
  const addResults = (batch: SearchResult[]) => {
    for (const r of batch) {
      if (r.url && !seen.has(r.url)) { seen.add(r.url); allSources.push(r) }
    }
  }

  // ── Ronda 1: sub-consultas iniciales ──
  log('Planeando la investigación…')
  const firstQueries = await buildSmartSubQueries(topic)
  log(`Buscando ${firstQueries.length} líneas de investigación…`)
  ;(await Promise.all(firstQueries.map(q => searchWeb(q, 5)))).forEach(addResults)

  // ── Rondas 2..N: identificar huecos y buscar de nuevo ──
  for (let round = 2; round <= rounds; round++) {
    if (allSources.length === 0) break
    log(`Analizando lo encontrado y buscando lo que falta (ronda ${round})…`)
    const gapQueries = await findKnowledgeGaps(topic, allSources).catch(() => [] as string[])
    if (!gapQueries.length) break
    ;(await Promise.all(gapQueries.slice(0, 4).map(q => searchWeb(q, 4)))).forEach(addResults)
  }

  if (allSources.length === 0) {
    throw new Error('No se encontraron fuentes. Verifica la configuración de búsqueda web.')
  }

  // Corpus (más fuentes que antes, porque acumulamos varias rondas)
  const used = allSources.slice(0, 20)
  const corpus = used.map((s, i) =>
    `[Fuente ${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`
  ).join('\n\n---\n\n')

  log('Redactando el informe final…')
  const systemPrompt = `Eres un analista de investigación senior de DAYA AI. Produces informes ejecutivos extensos, rigurosos y bien estructurados, basados estrictamente en las fuentes proporcionadas.
REGLAS:
- Redacta en español, en prosa profesional y fluida.
- El informe debe ser EXTENSO: resumen ejecutivo, varias secciones temáticas con análisis profundo, y conclusiones.
- Cita las fuentes usando [Fuente N] dentro del texto donde corresponda.
- Nunca inventes datos que no estén en las fuentes; si algo no está, indícalo.
- Responde SOLO en JSON válido.`

  const prompt = `Tema de investigación: "${topic}"

Fuentes recopiladas de la web (varias rondas de búsqueda):
${corpus}

Genera un informe de investigación profundo y completo basado en estas fuentes. Responde SOLO con JSON:
{
  "title": "título ejecutivo y específico del informe",
  "content": "informe completo en markdown: ## Resumen ejecutivo, luego varias ## secciones temáticas con análisis extenso (mínimo 3-4 párrafos cada una), y ## Conclusiones. Cita [Fuente N] donde uses información de una fuente. Mínimo 800 palabras."
}`

  const parsed = await chatJSON(prompt, systemPrompt, undefined, 8000)

  const biblio = used.map((s, i) =>
    `${i + 1}. ${s.title}. Disponible en: ${s.url}`
  ).join('\n\n')

  const markdown = `${parsed.content || ''}\n\n## Bibliografía\n\n${biblio}`

  return {
    title: String(parsed.title) || `Informe: ${topic}`,
    markdown,
    sources: used.map(s => ({ title: s.title, url: s.url })),
  }
}

// Lee lo recopilado hasta ahora e identifica qué FALTA para un informe completo,
// devolviendo 2-4 consultas de búsqueda nuevas y específicas (sin repetir lo visto).
async function findKnowledgeGaps(topic: string, sources: SearchResult[]): Promise<string[]> {
  const titles = sources.slice(0, 16).map((s, i) => `${i + 1}. ${s.title}`).join('\n')
  const sys = `Eres un investigador meticuloso. A partir de lo ya encontrado, detectas ángulos o datos que FALTAN para un informe completo y propones nuevas búsquedas web. Respondes SOLO JSON.`
  const ask = `Tema: "${topic}"

Fuentes ya encontradas (solo títulos):
${titles}

¿Qué ángulos, datos, contraejemplos o secciones importantes todavía NO están cubiertos? Propón entre 2 y 4 búsquedas web nuevas y específicas para llenar esos huecos (no repitas lo ya cubierto).
Responde SOLO con: {"queries": ["búsqueda 1", "búsqueda 2"]}`
  const parsed = await chatJSON(ask, sys)
  const qs: unknown[] = Array.isArray(parsed?.queries) ? parsed.queries : []
  return qs.filter((q): q is string => typeof q === 'string' && !!q.trim()).map((q) => q.trim()).slice(0, 4)
}
