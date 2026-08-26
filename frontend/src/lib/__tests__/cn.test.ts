import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/cn'

describe('cn', () => {
  it('merges class names', () => {
    const result = cn('foo', 'bar')
    expect(result).toContain('foo')
    expect(result).toContain('bar')
  })
  it('resolves tailwind conflicts', () => {
    const result = cn('px-4 py-2', 'px-8')
    expect(result).toContain('px-8')
    expect(result).not.toContain('px-4')
    expect(result).toContain('py-2')
  })
  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'extra')
    expect(result).toContain('base')
    expect(result).not.toContain('hidden')
    expect(result).toContain('extra')
  })
  it('handles empty input', () => {
    expect(cn()).toBe('')
  })
})
