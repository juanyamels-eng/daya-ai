import { DayaTool } from './types'

export const calculator: DayaTool = {
  name: 'calcular',
  description: 'Evalúa una expresión matemática y devuelve el resultado EXACTO. Úsalo SIEMPRE para cualquier cálculo numérico (aritmética, porcentajes, potencias, raíces, estadística como mean/median/std, conversiones de unidades como "19 inch to cm", interés compuesto, etc.) en vez de calcular de cabeza. Sintaxis de mathjs.',
  parameters: {
    type: 'object',
    properties: { expresion: { type: 'string', description: 'La expresión a evaluar, p. ej. "1000*(1+0.05)^10" o "mean([3,7,8,5])"' } },
    required: ['expresion'],
  },
  safeForAct: true,
  async run(_userId, args) {
    const expr = String(args?.expresion || '').slice(0, 500).trim()
    if (!expr) return 'Falta la expresión a calcular.'
    // mathjs (~700 KB) se importa bajo demanda: no paga carga al arranque del server.
    // mathjs.evaluate no expone Node (import/process/fs quedan bloqueados) → seguro.
    const { evaluate } = await import('mathjs')
    const out = evaluate(expr)
    return `${expr} = ${typeof out === 'object' ? JSON.stringify(out) : String(out)}`
  },
}
