import { defineConfig } from 'vitest/config'
import path from 'path'

// Tests de las funciones PURAS del pipeline (sin DOM). El alias '@' replica el de
// Next para que los imports funcionen igual que en la app.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/e2e/**', '**/*.spec.ts'],
  },
})
