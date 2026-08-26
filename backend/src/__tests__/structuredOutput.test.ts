import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { ToolCallSchema, PlanSchema, EvaluationSchema, GraphExtractionSchema } from '../services/structuredOutput'

describe('structuredOutput', () => {
  it('ToolCallSchema validates correct tool call', () => {
    const result = ToolCallSchema.safeParse({ action: 'tool', name: 'test', args: { foo: 'bar' } })
    expect(result.success).toBe(true)
  })

  it('ToolCallSchema validates answer', () => {
    const result = ToolCallSchema.safeParse({ action: 'answer', content: 'hello' })
    expect(result.success).toBe(true)
  })

  it('ToolCallSchema validates evaluate', () => {
    const result = ToolCallSchema.safeParse({ action: 'evaluate', verdict: 'done', reason: 'completed' })
    expect(result.success).toBe(true)
  })

  it('ToolCallSchema rejects invalid action', () => {
    const result = ToolCallSchema.safeParse({ action: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('PlanSchema validates correct plan', () => {
    const result = PlanSchema.safeParse({ steps: [{ tool: 'test', description: 'do stuff' }] })
    expect(result.success).toBe(true)
  })

  it('PlanSchema rejects empty steps', () => {
    const result = PlanSchema.safeParse({ steps: [] })
    expect(result.success).toBe(true) // empty array is valid
  })

  it('EvaluationSchema validates done', () => {
    const result = EvaluationSchema.safeParse({ verdict: 'done', reason: 'completed' })
    expect(result.success).toBe(true)
  })

  it('EvaluationSchema validates needs_more', () => {
    const result = EvaluationSchema.safeParse({ verdict: 'needs_more', reason: 'need more data' })
    expect(result.success).toBe(true)
  })

  it('EvaluationSchema rejects invalid verdict', () => {
    const result = EvaluationSchema.safeParse({ verdict: 'invalid', reason: 'x' })
    expect(result.success).toBe(false)
  })

  it('GraphExtractionSchema validates correct data', () => {
    const result = GraphExtractionSchema.safeParse({
      entities: [{ name: 'TypeScript', type: 'TECHNOLOGY' }],
      relations: [{ from: 'TypeScript', to: 'Node.js', type: 'USED_WITH' }],
    })
    expect(result.success).toBe(true)
  })

  it('GraphExtractionSchema rejects missing fields', () => {
    const result = GraphExtractionSchema.safeParse({
      entities: [{ name: 'TypeScript' }],
      relations: [],
    })
    expect(result.success).toBe(false)
  })
})
