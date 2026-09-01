import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', '..', 'screenshots')
const PORT = 3000
const BASE = `http://localhost:${PORT}`

mkdirSync(outDir, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(url, timeout = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {}
    await wait(400)
  }
  throw new Error('El servidor no arrancó a tiempo')
}

const terminalHtml = () => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; }
  .term { width: 1000px; height: 600px; background: #0f0f11; font-family: "SF Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace; color: #e6e6e6; display: flex; flex-direction: column; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 13px 16px; background: #17171a; border-bottom: 1px solid #26262a; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .r { background: #ff5f57; } .y { background: #febc2e; } .g { background: #28c840; }
  .title { color: #9a9aa3; font-size: 13px; margin-left: 10px; font-family: inherit; }
  .body { padding: 22px 24px; font-size: 14px; line-height: 1.9; flex: 1; }
  .prompt { color: #43d39e; }
  .cmd { color: #f1f3f4; font-weight: 600; }
  .dim { color: #9a9aa3; }
  .step { color: #8b7fff; }
  .file { color: #7dd3fc; }
  .ok { color: #43d39e; }
  .bad { color: #ff5f57; }
</style></head><body><div class="term">
  <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="title">daya-code — terminal</span></div>
  <div class="body">
    <div class="dim">~/my-project</div>
    <div><span class="prompt">$</span> <span class="cmd">daya-code "refactor the login flow and add tests"</span></div>
    <div class="dim">▸ Reading codebase…</div>
    <div><span class="step">▸ read_file</span> <span class="file">src/auth/login.ts</span></div>
    <div><span class="step">▸ read_file</span> <span class="file">src/auth/session.ts</span></div>
    <div class="dim">▸ Planning — 3 changes</div>
    <div><span class="step">▸ edit_file</span> <span class="file">src/auth/login.ts</span></div>
    <div><span class="step">▸ write_file</span> <span class="file">src/auth/login.test.ts</span></div>
    <div><span class="step">▸ run_command</span> <span class="cmd">npm test</span></div>
    <div class="ok">   ✓ 14 passed, 0 failed</div>
    <div><span class="step">▸ run_command</span> <span class="cmd">npm run typecheck</span></div>
    <div class="ok">   ✓ no errors</div>
    <div class="ok">Done. 3 files modified, tests passing.</div>
  </div>
</div></body></html>`

const shots = [
  { path: '/', name: 'landing', w: 1200, h: 600 },
  { path: '/auth/login', name: 'login', w: 1280, h: 800 },
  { path: '/auth/register', name: 'register', w: 1280, h: 800 },
  { path: '/planes', name: 'pricing', w: 1440, h: 900 },
]

const nextBin = join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next')
const server = spawn(process.execPath, [nextBin, 'start'], { stdio: 'ignore' })

try {
  await waitForServer(`${BASE}/`)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    deviceScaleFactor: 1,
  })
  await ctx.addInitScript(() => {
    localStorage.setItem('daya-auth', JSON.stringify({ state: { themePref: 'dark' } }))
    localStorage.setItem('daya-cookie-consent', JSON.stringify({ necessary: true, analytics: false, decidedAt: new Date().toISOString() }))
  })
  const page = await ctx.newPage()

  for (const s of shots) {
    await page.setViewportSize({ width: s.w, height: s.h })
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts?.ready)
    await wait(400)
    await page.screenshot({ path: join(outDir, `${s.name}.png`) })
    console.log(`ok ${s.name}.png`)
  }

  await page.setViewportSize({ width: 1000, height: 600 })
  await page.setContent(terminalHtml())
  await page.screenshot({ path: join(outDir, 'code.png') })
  console.log('ok code.png')

  await browser.close()
} finally {
  server.kill()
}
