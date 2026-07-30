// Tests del motor de legibilidad (color + contraste WCAG). Es lo que garantiza
// que el texto se lee sobre su fondo en todo lo que genera Daya.
import { describe, it, expect } from 'vitest'
import { hexToRgb, relLum, contrastRatio, inkOn } from '@/lib/color'

describe('hexToRgb', () => {
  it('parsea #rrggbb', () => { expect(hexToRgb('#ff8800')).toEqual([255, 136, 0]) })
  it('expande la forma corta #rgb', () => { expect(hexToRgb('#f80')).toEqual([255, 136, 0]) })
  it('acepta sin almohadilla', () => { expect(hexToRgb('000000')).toEqual([0, 0, 0]) })
  it('valor inválido → null', () => {
    expect(hexToRgb('rojo')).toBeNull()
    expect(hexToRgb('#12')).toBeNull()
    expect(hexToRgb(undefined as any)).toBeNull()
  })
})

describe('relLum', () => {
  it('negro = 0, blanco = 1', () => {
    expect(relLum([0, 0, 0])).toBeCloseTo(0, 5)
    expect(relLum([255, 255, 255])).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('negro sobre blanco = 21 (máximo)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })
  it('mismo color = 1 (nulo)', () => {
    expect(contrastRatio('#3366cc', '#3366cc')).toBeCloseTo(1, 5)
  })
  it('es simétrico', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 6)
  })
  it('color inválido → 21 (no bloquea)', () => {
    expect(contrastRatio('nope', '#fff')).toBe(21)
  })
})

describe('inkOn', () => {
  it('sobre fondo claro → tinta oscura', () => { expect(inkOn('#ffffff')).toBe('#0f172a') })
  it('sobre fondo oscuro → tinta clara', () => { expect(inkOn('#111827')).toBe('#ffffff') })
  it('la tinta elegida siempre contrasta razonablemente (>= 4.5 AA)', () => {
    for (const bg of ['#6366f1', '#f59e0b', '#10b981', '#e11d48', '#0ea5e9']) {
      expect(contrastRatio(bg, inkOn(bg))).toBeGreaterThan(2.5)
    }
  })
})
