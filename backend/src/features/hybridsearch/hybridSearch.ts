// ============================================
// DAYA IA — Hybrid Search (servicio de alto nivel)
// --------------------------------------------------------------------------
// Combina búsqueda VECTORIAL (semántica) + LÉXICA (BM25) y fusiona ambas con
// RRF. Es la mejora directa para el RAG (docrag) y la memoria (memory): hoy
// hacen una u otra; esto hace las dos y las fusiona, lo que da resultados
// claramente mejores —sobre todo cuando la consulta mezcla significado con
// términos exactos (nombres, siglas, códigos).
//
// Trabaja sobre documentos en memoria que el caller provee (cada uno con su
// texto y, si lo tiene, su embedding). No impone almacenamiento: encaja con tus
// modelos Memory/DocChunk sin migraciones.
//
// Inspiración conceptual: LanceDB (Apache-2.0). Código propio.
// ============================================

import { BM25Index } from './bm25'
import { rrfFuse, VectorIndex } from './rrf'
import { embedText, cosineSimilarity } from '../../services/embeddings'

export interface HybridDoc {
  id: string
  text: string
  vector?: number[]          // si ya tienes el embedding, pásalo (evita recalcular)
  meta?: Record<string, any>
}

export interface HybridHit {
  id: string
  text: string
  score: number              // score fusionado (RRF)
  vectorScore?: number       // similitud coseno (si hubo parte vectorial)
  meta?: Record<string, any>
}

export interface HybridOptions {
  topK?: number
  // Pesos de fusión: [vectorial, léxica]. Por defecto da algo más de peso a la
  // semántica, que suele captar mejor la intención.
  weights?: [number, number]
  rrfK?: number
  approximate?: boolean      // usar índice ANN aproximado para la parte vectorial
}

/**
 * Búsqueda híbrida sobre un conjunto de documentos.
 * Calcula embeddings que falten (solo si hay servicio de embeddings).
 */
export async function hybridSearch(
  query: string,
  docs: HybridDoc[],
  opts: HybridOptions = {}
): Promise<HybridHit[]> {
  if (!docs.length || !query.trim()) return []
  const topK = opts.topK ?? 8
  const weights = opts.weights ?? [1.2, 1.0]

  // ── Parte léxica (BM25): siempre disponible, no necesita embeddings.
  const bm25 = new BM25Index(docs.map(d => ({ id: d.id, text: d.text })))
  const lexical = bm25.search(query, topK * 3)

  // ── Parte vectorial: solo si podemos embeber la consulta y hay vectores.
  let vectorial: { id: string; score: number }[] = []
  let queryVec: number[] | null = null
  try {
    queryVec = await embedText(query)
  } catch {
    queryVec = null // sin embeddings → degradamos a solo-léxica
  }

  const vectorScoreById = new Map<string, number>()
  if (queryVec && queryVec.length) {
    const index = new VectorIndex({ approximate: !!opts.approximate })
    const withVec: { id: string; vector: number[] }[] = []
    for (const d of docs) {
      let v = d.vector
      if (!v || !v.length) {
        // Embebe los que falten (acotado para no disparar costes en sets grandes).
        if (withVec.length < 200) { try { v = await embedText(d.text) } catch { v = undefined } }
      }
      if (v && v.length) withVec.push({ id: d.id, vector: v })
    }
    if (withVec.length) {
      index.add(withVec)
      const vhits = index.search(queryVec, topK * 3)
      vectorial = vhits.map(h => ({ id: h.id, score: h.score }))
      for (const h of vhits) vectorScoreById.set(h.id, h.score)
    }
  }

  // ── Fusión RRF de ambas listas.
  const fused = rrfFuse(
    [vectorial, lexical],
    { k: opts.rrfK, weights, topK }
  )

  const byId = new Map(docs.map(d => [d.id, d]))
  return fused.map(f => {
    const d = byId.get(f.id)!
    return {
      id: f.id,
      text: d.text,
      score: f.score,
      vectorScore: vectorScoreById.get(f.id),
      meta: d.meta,
    }
  })
}

/**
 * Variante "solo vectores ya calculados": cuando el caller YA tiene los
 * embeddings (p. ej. desde DocChunk/Memory) y no quiere recalcular nada.
 * Hace vector + BM25 + RRF sin llamar al servicio de embeddings para los docs.
 */
export async function hybridSearchPrecomputed(
  query: string,
  queryVector: number[],
  docs: HybridDoc[],
  opts: HybridOptions = {}
): Promise<HybridHit[]> {
  if (!docs.length) return []
  const topK = opts.topK ?? 8
  const weights = opts.weights ?? [1.2, 1.0]

  const bm25 = new BM25Index(docs.map(d => ({ id: d.id, text: d.text })))
  const lexical = bm25.search(query, topK * 3)

  const vectorScoreById = new Map<string, number>()
  const vectorial = docs
    .filter(d => Array.isArray(d.vector) && d.vector.length)
    .map(d => {
      const s = cosineSimilarity(queryVector, d.vector!)
      vectorScoreById.set(d.id, s)
      return { id: d.id, score: s }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 3)

  const fused = rrfFuse([vectorial, lexical], { k: opts.rrfK, weights, topK })
  const byId = new Map(docs.map(d => [d.id, d]))
  return fused.map(f => {
    const d = byId.get(f.id)!
    return { id: f.id, text: d.text, score: f.score, vectorScore: vectorScoreById.get(f.id), meta: d.meta }
  })
}
