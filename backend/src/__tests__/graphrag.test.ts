import { describe, it, expect } from 'vitest'
import { extractGraph } from '../features/graphrag/graph'

describe('GraphRAG', () => {
  it('extractGraph is a function', () => {
    expect(typeof extractGraph).toBe('function')
  })
})
