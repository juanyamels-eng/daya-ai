// ============================================
// DAYA IA — Fusión RRF + índice vectorial ligero
// --------------------------------------------------------------------------
// Dos piezas tomadas (como concepto) de LanceDB:
//
//   1) rrfFuse — Reciprocal Rank Fusion: combina varias listas rankeadas (p. ej.
//      la vectorial y la léxica) en UNA sola, sin necesidad de que sus scores
//      sean comparables. Es robusto y es lo que usan los motores de búsqueda
//      híbrida modernos. Fórmula: score(d) = Σ 1 / (k + rank_i(d)).
//
//   2) VectorIndex — búsqueda por similitud en memoria. Por defecto hace
//      búsqueda exacta (comparar contra todos); si activas el modo aproximado,
//      agrupa por "celdas" (clustering ligero) para no recorrer todo el set
//      cuando hay muchos vectores. TypeScript puro, sin dependencias.
//
// Implementación propia (inspiración: LanceDB, Apache-2.0).
// ============================================

import { cosineSimilarity } from '../../services/embeddings'

// ── RRF (Reciprocal Rank Fusion) ─────────────────────────────────────────────

export interface RankedList { id: string; score?: number }

/**
 * Fusiona varias listas YA rankeadas (orden = relevancia descendente) en una.
 * `k` amortigua el peso de las primeras posiciones (60 es el valor clásico).
 * `weights` opcional pondera cada lista (p. ej. dar más peso a la vectorial).
 */
export function rrfFuse(
  lists: RankedList[][],
  opts: { k?: number; weights?: number[]; topK?: number } = {}
): { id: string; score: number }[] {
  const k = opts.k ?? 60
  const weights = opts.weights || lists.map(() => 1)
  const fused = new Map<string, number>()

  lists.forEach((list, li) => {
    const w = weights[li] ?? 1
    list.forEach((item, rank) => {
      const contribution = w * (1 / (k + rank + 1)) // rank 0-indexed → +1
      fused.set(item.id, (fused.get(item.id) || 0) + contribution)
    })
  })

  const out = [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
  return opts.topK ? out.slice(0, opts.topK) : out
}

// ── Índice vectorial ligero ──────────────────────────────────────────────────

export interface VectorRecord {
  id: string
  vector: number[]
  meta?: Record<string, any>
}

export interface VectorHit {
  id: string
  score: number          // similitud coseno (1 = idéntico)
  meta?: Record<string, any>
}

export interface VectorIndexOptions {
  approximate?: boolean  // activa el modo aproximado (celdas)
  cells?: number         // nº de celdas para el modo aproximado (auto si se omite)
  probes?: number        // cuántas celdas inspeccionar por consulta (recall vs velocidad)
}

export class VectorIndex {
  private records: VectorRecord[] = []
  private opts: Required<VectorIndexOptions>
  // Modo aproximado: centroides + asignación de records a celdas.
  private centroids: number[][] = []
  private cellMembers: number[][] = []  // índices de records por celda
  private built = false

  constructor(options: VectorIndexOptions = {}) {
    this.opts = {
      approximate: options.approximate ?? false,
      cells: options.cells ?? 0,
      probes: options.probes ?? 4,
    }
  }

  add(records: VectorRecord[]): void {
    this.records.push(...records.filter(r => Array.isArray(r.vector) && r.vector.length))
    this.built = false
  }

  clear(): void { this.records = []; this.centroids = []; this.cellMembers = []; this.built = false }

  get size(): number { return this.records.length }

  /** Construye el índice aproximado (k-means muy ligero). Idempotente. */
  private buildApprox(): void {
    if (this.built) return
    const n = this.records.length
    // nº de celdas ≈ sqrt(n), acotado; bajo este umbral no vale la pena.
    const cells = this.opts.cells || Math.max(1, Math.min(Math.round(Math.sqrt(n)), 256))
    if (n < 50 || cells <= 1) { this.built = true; return } // se usará búsqueda exacta

    const dim = this.records[0].vector.length
    // Inicializa centroides con records equiespaciados (k-means++ sería mejor,
    // pero esto basta y es determinista y barato).
    this.centroids = []
    for (let c = 0; c < cells; c++) {
      const idx = Math.floor((c * n) / cells)
      this.centroids.push(this.records[idx].vector.slice())
    }
    // 3 iteraciones de Lloyd: asignar → recalcular. Suficiente para agrupar.
    for (let iter = 0; iter < 3; iter++) {
      this.cellMembers = this.centroids.map(() => [])
      for (let i = 0; i < n; i++) {
        const ci = this.nearestCentroid(this.records[i].vector)
        this.cellMembers[ci].push(i)
      }
      for (let c = 0; c < cells; c++) {
        if (!this.cellMembers[c].length) continue
        const mean = new Array(dim).fill(0)
        for (const i of this.cellMembers[c]) {
          const v = this.records[i].vector
          for (let d = 0; d < dim; d++) mean[d] += v[d]
        }
        for (let d = 0; d < dim; d++) mean[d] /= this.cellMembers[c].length
        this.centroids[c] = mean
      }
    }
    this.built = true
  }

  private nearestCentroid(v: number[]): number {
    let best = 0, bestSim = -Infinity
    for (let c = 0; c < this.centroids.length; c++) {
      const sim = cosineSimilarity(v, this.centroids[c])
      if (sim > bestSim) { bestSim = sim; best = c }
    }
    return best
  }

  /** Busca los `topK` vectores más similares al de consulta. */
  search(query: number[], topK = 10): VectorHit[] {
    if (!this.records.length || !query?.length) return []

    // Conjunto de candidatos: todos (exacto) o solo las celdas más cercanas (aprox).
    let candidates: number[]
    if (this.opts.approximate) {
      this.buildApprox()
      if (this.centroids.length > 1) {
        // Elige las `probes` celdas cuyo centroide es más cercano a la consulta.
        const order = this.centroids
          .map((c, i) => ({ i, sim: cosineSimilarity(query, c) }))
          .sort((a, b) => b.sim - a.sim)
          .slice(0, this.opts.probes)
        candidates = order.flatMap(o => this.cellMembers[o.i] || [])
        if (!candidates.length) candidates = this.records.map((_, i) => i) // fallback
      } else {
        candidates = this.records.map((_, i) => i)
      }
    } else {
      candidates = this.records.map((_, i) => i)
    }

    const hits: VectorHit[] = []
    for (const i of candidates) {
      const r = this.records[i]
      hits.push({ id: r.id, score: cosineSimilarity(query, r.vector), meta: r.meta })
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, topK)
  }
}
