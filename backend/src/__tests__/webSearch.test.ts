import { describe, it, expect } from 'vitest'
import { needsWebSearch, buildWebContext } from '../services/chat/webSearchService'

describe('needsWebSearch', () => {
  it('returns false for creative/generative prompts', () => {
    expect(needsWebSearch('escribe un cuento sobre dragones')).toBe(false)
    expect(needsWebSearch('crea una función de Python')).toBe(false)
    expect(needsWebSearch('calcula 2+2')).toBe(false)
    expect(needsWebSearch('traduce esta frase al inglés')).toBe(false)
  })

  it('returns true for prices/exchange rates', () => {
    expect(needsWebSearch('precio del dólar hoy')).toBe(true)
  })

  it('returns true for recent news', () => {
    expect(needsWebSearch('últimas noticias del día')).toBe(true)
  })

  it('returns true for events (who won/died/launched)', () => {
    expect(needsWebSearch('quién ganó el partido de ayer')).toBe(true)
  })

  it('returns false for definition-style questions', () => {
    expect(needsWebSearch('qué es la fotosíntesis')).toBe(false)
  })
})

describe('buildWebContext', () => {
  it('returns empty for no results', () => {
    expect(buildWebContext([])).toBe('')
  })

  it('formats results with title and domain', () => {
    const ctx = buildWebContext([{ title: 'Mi título', url: 'https://example.com/x', content: 'Contenido' }])
    expect(ctx).toContain('**Mi título**')
    expect(ctx).toContain('example.com')
  })

  it('caps the results at five', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, url: `https://e.com/${i}`, content: 'c' }))
    const ctx = buildWebContext(many)
    expect(ctx).toContain('**T0**')
    expect(ctx).not.toContain('**T5**')
  })
})
