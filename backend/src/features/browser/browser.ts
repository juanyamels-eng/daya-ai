// ============================================
// DAYA IA — Autonomous Browser: Playwright-based visual web navigation
// Manages browser lifecycle, takes screenshots, and provides vision-based
// navigation actions for the orchestrator.
// ============================================
import { chromium, Browser, Page, BrowserContext } from 'playwright'

let _browser: Browser | null = null
let _context: BrowserContext | null = null

export interface BrowserAction {
  type: 'navigate' | 'click' | 'fill' | 'screenshot' | 'scroll' | 'wait' | 'back'
  url?: string
  selector?: string
  text?: string
  value?: string
  scrollDirection?: 'up' | 'down'
}

export interface BrowserResult {
  url: string
  title: string
  screenshot?: string // base64
  text: string
  error?: string
}

async function getBrowser(): Promise<Browser> {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    _context = await _browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    })
  }
  return _browser
}

export async function getContext(): Promise<BrowserContext> {
  await getBrowser()
  return _context!
}

export async function getPage(): Promise<Page> {
  const ctx = await getContext()
  const pages = ctx.pages()
  return pages.length ? pages[0] : await ctx.newPage()
}

// Execute a browser action
export async function executeBrowserAction(action: BrowserAction): Promise<BrowserResult> {
  const page = await getPage()

  try {
    switch (action.type) {
      case 'navigate': {
        if (!action.url) return { url: page.url(), title: '', text: '', error: 'URL required for navigate' }
        await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForTimeout(2000) // Let JS settle
        break
      }
      case 'click': {
        if (!action.selector) return { url: page.url(), title: '', text: '', error: 'Selector required for click' }
        await page.click(action.selector, { timeout: 10_000 })
        await page.waitForTimeout(1000)
        break
      }
      case 'fill': {
        if (!action.selector || action.value === undefined) {
          return { url: page.url(), title: '', text: '', error: 'Selector and value required for fill' }
        }
        await page.fill(action.selector, action.value, { timeout: 10_000 })
        break
      }
      case 'screenshot': {
        // Just take a screenshot, no navigation
        break
      }
      case 'scroll': {
        const direction = action.scrollDirection || 'down'
        const delta = direction === 'down' ? 500 : -500
        await page.mouse.wheel(0, delta)
        await page.waitForTimeout(500)
        break
      }
      case 'wait': {
        await page.waitForTimeout(parseInt(action.value || '2000'))
        break
      }
      case 'back': {
        await page.goBack({ timeout: 10_000 })
        await page.waitForTimeout(1000)
        break
      }
    }

    // Capture result
    const title = await page.title()
    const text = await page.evaluate(() => document.body?.innerText?.slice(0, 8000) || '').catch(() => '')
    let screenshot: string | undefined

    if (action.type === 'screenshot' || action.type === 'navigate' || action.type === 'click') {
      const buffer = await page.screenshot({ type: 'jpeg', quality: 80 })
      screenshot = buffer.toString('base64')
    }

    return { url: page.url(), title, screenshot, text }
  } catch (e: any) {
    return {
      url: page.url(),
      title: '',
      text: '',
      error: `Browser action "${action.type}" failed: ${e.message}`,
    }
  }
}

// Close the browser instance
export async function closeBrowser(): Promise<void> {
  try {
    if (_context) await _context.close().catch(() => {})
    if (_browser) await _browser.close().catch(() => {})
  } catch { /* best effort */ }
  _browser = null
  _context = null
}
