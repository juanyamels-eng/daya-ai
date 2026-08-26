import { describe, it, expect } from 'vitest'
import { modelLabel } from '@/lib/modelLabel'

describe('modelLabel', () => {
  it('returns empty for null/undefined', () => {
    expect(modelLabel(null)).toBe('')
    expect(modelLabel(undefined)).toBe('')
    expect(modelLabel('')).toBe('')
  })
  it('identifies Claude', () => {
    expect(modelLabel('anthropic/claude-sonnet-4')).toBe('Claude')
    expect(modelLabel('claude-3-5-sonnet')).toBe('Claude')
  })
  it('identifies GPT', () => {
    expect(modelLabel('openai/gpt-4o')).toBe('GPT')
    expect(modelLabel('gpt-4-turbo')).toBe('GPT')
  })
  it('identifies Gemini', () => {
    expect(modelLabel('google/gemini-2.0-flash')).toBe('Gemini')
    expect(modelLabel('gemini-pro')).toBe('Gemini')
  })
  it('identifies DeepSeek', () => {
    expect(modelLabel('deepseek/deepseek-chat')).toBe('DeepSeek')
  })
  it('identifies Grok', () => {
    expect(modelLabel('x-ai/grok-3')).toBe('Grok')
  })
  it('identifies Qwen', () => {
    expect(modelLabel('qwen/qwen-2.5-72b')).toBe('Qwen')
  })
  it('identifies Llama', () => {
    expect(modelLabel('meta-llama/llama-3.1-70b')).toBe('Llama')
  })
  it('identifies Mistral', () => {
    expect(modelLabel('mistralai/mistral-large')).toBe('Mistral')
  })
  it('returns empty for unknown model', () => {
    expect(modelLabel('unknown/model-v1')).toBe('')
  })
})
