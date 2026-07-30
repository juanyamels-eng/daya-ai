// ============================================
// DAYA IA — Embeddings y similitud semántica
// Genera vectores de texto para búsqueda de memoria por significado.
//
// Prioridad de proveedores:
//   1. OPENAI_API_KEY → OpenAI directo (más barato por volumen)
//   2. OPENROUTER_API_KEY → OpenRouter /v1/embeddings (ya configurado en DAYA)
// Si ninguno está disponible, devuelve [] y el sistema cae a búsqueda léxica.
// ============================================
import OpenAI from 'openai'

// ÚNICA excepción a la regla de "solo modelos chinos" del resto de Daya, por dos
// motivos que no dependen de nosotros:
//   1. OpenRouter no sirve NINGÚN modelo de embeddings (su catálogo son modelos
//      de chat); esto va contra el endpoint /v1/embeddings, que solo resuelve los
//      de OpenAI. Para uno chino (Qwen text-embedding, BGE, Jina) haría falta
//      otro proveedor y otra clave.
//   2. Los vectores de dos modelos distintos NO son comparables. Cambiarlo sin
//      reindexar dejaría el RAG de documentos y la memoria devolviendo basura,
//      en silencio: habría que regenerar todos los DocChunk guardados.
const OPENAI_MODEL = 'text-embedding-3-small'      // 1536 dims, barato
const OPENROUTER_MODEL = 'openai/text-embedding-3-small'

let _openai: OpenAI | null = null
let _openrouter: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (_openai) return _openai
  if (!process.env.OPENAI_API_KEY) return null
  _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

function getOpenRouter(): OpenAI | null {
  if (_openrouter) return _openrouter
  if (!process.env.OPENROUTER_API_KEY) return null
  _openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  })
  return _openrouter
}

export function isEmbeddingConfigured(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY)
}

// Genera el embedding de un texto. Devuelve [] si no hay proveedor configurado.
export async function embedText(text: string): Promise<number[]> {
  if (!text.trim()) return []

  // Intenta con OpenAI primero; si no hay clave, usa OpenRouter.
  const client = getOpenAI() || getOpenRouter()
  if (!client) return []

  const model = getOpenAI() ? OPENAI_MODEL : OPENROUTER_MODEL

  try {
    const res = await client.embeddings.create({
      model,
      input: text.slice(0, 8000),
    })
    return res.data[0]?.embedding || []
  } catch (err: any) {
    // Si OpenAI falló (por ejemplo, sin crédito), intenta con OpenRouter como fallback.
    if (getOpenAI() && getOpenRouter()) {
      try {
        const res = await getOpenRouter()!.embeddings.create({
          model: OPENROUTER_MODEL,
          input: text.slice(0, 8000),
        })
        return res.data[0]?.embedding || []
      } catch { return [] }
    }
    console.warn('embedText falló:', err?.message)
    return []
  }
}

// Similitud de coseno entre dos vectores (1 = idénticos, 0 = sin relación).
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return -1
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return -1
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}
