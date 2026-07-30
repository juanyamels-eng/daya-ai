import { describe, it, expect } from 'vitest'
import { cosineSimilarity } from '../services/embeddings'
import { buildSubQueries } from '../services/webSearch'

// ============================================
// Tests of critical pure functions in DAYA IA
// (the ones that, if broken, break features for users)
// ============================================

describe('cosineSimilarity (memoria semántica)', () => {
  it('vectores idénticos dan ~1', () => {
    const v = [1, 2, 3, 4]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it('vectores ortogonales dan ~0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })

  it('vectores opuestos dan ~-1', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 5)
  })

  it('vectores de distinto largo devuelven -1 (sin crashear)', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(-1)
  })

  it('vectores vacíos devuelven -1', () => {
    expect(cosineSimilarity([], [])).toBe(-1)
  })

  it('vector de ceros devuelve -1 (sin dividir por cero)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(-1)
  })
})

describe('buildSubQueries (fallback de investigación)', () => {
  it('siempre incluye el tema original como primera consulta', () => {
    const qs = buildSubQueries('mercado de IA en Perú')
    expect(qs[0]).toBe('mercado de IA en Perú')
  })

  it('genera varias sub-consultas', () => {
    const qs = buildSubQueries('energías renovables')
    expect(qs.length).toBeGreaterThanOrEqual(3)
    expect(qs.every(q => typeof q === 'string' && q.length > 0)).toBe(true)
  })
})
