import { tokenize } from '../../utils/nlp'

// ============================================
// DAYA IA — BM25 (ranking léxico)
// --------------------------------------------------------------------------
// Algoritmo estándar de recuperación por palabras clave. Mejor que un simple
// "contiene el término": pondera por frecuencia del término en el documento
// (TF, saturada) y por rareza del término en el corpus (IDF), normalizando por
// longitud. Es la pieza "léxica" de la búsqueda híbrida.
//
// Brilla donde la búsqueda vectorial falla: nombres propios, códigos, siglas,
// términos exactos poco frecuentes. Implementación propia en TypeScript.
// ============================================

// Parámetros clásicos de BM25.
const K1 = 1.5   // saturación de la frecuencia del término
const B = 0.75   // intensidad de la normalización por longitud

export interface BM25Doc {
  id: string
  text: string
}

export interface BM25Hit {
  id: string
  score: number
}


/**
 * Índice BM25 en memoria. Se construye una vez con un conjunto de documentos y
 * luego se consulta. Para corpus que cambian poco (chunks de RAG, memorias),
 * reconstruir es barato; para corpus enormes conviene persistir, pero a la
 * escala típica de un usuario de DAYA esto es más que suficiente.
 */
export class BM25Index {
  private docs: BM25Doc[] = []
  private termFreq: Map<string, Map<string, number>> = new Map() // término → (docId → frecuencia)
  private docLen: Map<string, number> = new Map()
  private docTokens: Map<string, string[]> = new Map()
  private avgLen = 0
  private idfCache: Map<string, number> = new Map()

  constructor(docs: BM25Doc[] = []) {
    if (docs.length) this.build(docs)
  }

  build(docs: BM25Doc[]): void {
    this.docs = docs
    this.termFreq.clear(); this.docLen.clear(); this.docTokens.clear(); this.idfCache.clear()

    let totalLen = 0
    for (const d of docs) {
      const tokens = tokenize(d.text, 2)
      this.docTokens.set(d.id, tokens)
      this.docLen.set(d.id, tokens.length)
      totalLen += tokens.length
      const counts = new Map<string, number>()
      for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1)
      for (const [term, freq] of counts) {
        if (!this.termFreq.has(term)) this.termFreq.set(term, new Map())
        this.termFreq.get(term)!.set(d.id, freq)
      }
    }
    this.avgLen = docs.length ? totalLen / docs.length : 0
  }

  // IDF suavizado (evita negativos y divide-por-cero).
  private idf(term: string): number {
    if (this.idfCache.has(term)) return this.idfCache.get(term)!
    const n = this.docs.length
    const df = this.termFreq.get(term)?.size || 0
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
    this.idfCache.set(term, idf)
    return idf
  }

  /** Devuelve los documentos mejor puntuados para la consulta. */
  search(query: string, topK = 10): BM25Hit[] {
    if (!this.docs.length) return []
    const qTerms = [...new Set(tokenize(query, 2))]
    const scores = new Map<string, number>()

    for (const term of qTerms) {
      const postings = this.termFreq.get(term)
      if (!postings) continue
      const idf = this.idf(term)
      for (const [docId, freq] of postings) {
        const len = this.docLen.get(docId) || 0
        const denom = freq + K1 * (1 - B + B * (len / (this.avgLen || 1)))
        const score = idf * ((freq * (K1 + 1)) / (denom || 1))
        scores.set(docId, (scores.get(docId) || 0) + score)
      }
    }

    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  get size(): number { return this.docs.length }
}
