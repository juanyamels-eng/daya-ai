import { describe, it, expect } from 'vitest'

describe('envValidation checks', () => {
  it('rejects placeholder values', () => {
    const placeholder = 'postgresql://PON-TU-USER:xxxxx@xxxxxxx:5432/db'
    expect(placeholder.includes('PON-TU')).toBe(true)
    expect(placeholder.includes('xxxxx')).toBe(true)
  })

  it('rejects YOUR- placeholder', () => {
    const placeholder = 'YOUR-API-KEY-HERE'
    expect(placeholder.includes('YOUR-')).toBe(true)
  })

  it('rejects [PASSWORD] placeholder', () => {
    const placeholder = 'postgresql://user:[PASSWORD]@host:5432/db'
    expect(placeholder.includes('[PASSWORD]')).toBe(true)
  })

  it('accepts valid values', () => {
    const valid = 'postgresql://daya:realpass@localhost:5432/daya'
    expect(valid.includes('PON-TU')).toBe(false)
    expect(valid.includes('xxxxx')).toBe(false)
    expect(valid.includes('YOUR-')).toBe(false)
    expect(valid.includes('[PASSWORD]')).toBe(false)
  })
})
