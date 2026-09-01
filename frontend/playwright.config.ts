import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.PORT || 3000
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000, toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 } },
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Ensure standalone folder has the static and public assets available
    // before starting the standalone server. This copies .next/static and
    // public into the standalone tree if present, then starts the server.
    // Uses bash so it's portable for CI Linux runners.
    command: 'bash -lc "mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static 2>/dev/null || true; mkdir -p .next/standalone/public && cp -r public .next/standalone/public 2>/dev/null || true; node .next/standalone/server.js"',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
