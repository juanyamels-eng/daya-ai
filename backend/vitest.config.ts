import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],   // solo tests en src, nunca en dist
    coverage: {
      provider: 'v8',
      thresholds: {
        // Ratchet Fase 2: sube el piso al medido actual (22.17/15.04/20.17/24.59)
        // con ~2 puntos de margen. La deuda solo puede bajar.
        statements: 20,
        branches: 13,
        functions: 18,
        lines: 22,
      },
    },
  },
})
