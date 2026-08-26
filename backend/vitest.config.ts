import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],   // solo tests en src, nunca en dist
    coverage: {
      provider: 'v8',
      thresholds: {
        // Ratchet Fase 1: apenas por debajo del baseline medido (12/6.3/13.2/13.6).
        // La deuda solo puede bajar; subir estos números es part del roadmap.
        statements: 11,
        branches: 5,
        functions: 12,
        lines: 12,
      },
    },
  },
})
