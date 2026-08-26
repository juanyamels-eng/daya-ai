import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('loads and shows title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Daya/i)
  })

  test('has main heading or hero section', async ({ page }) => {
    await page.goto('/')
    const body = page.locator('body')
    await expect(body).toBeVisible()
    // Page should have some visible text content
    const text = await page.textContent('body')
    expect(text?.length).toBeGreaterThan(50)
  })

  test('has navigation links', async ({ page }) => {
    await page.goto('/')
    // Should have at least some links
    const links = page.locator('a')
    const count = await links.count()
    expect(count).toBeGreaterThan(0)
  })

  test('has no console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Filter out known harmless errors (favicon, etc.)
    const realErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('404') &&
      !e.includes('Failed to load resource')
    )
    expect(realErrors).toHaveLength(0)
  })
})

test.describe('Auth Pages', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page).toHaveTitle(/Daya/i)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('register page loads', async ({ page }) => {
    await page.goto('/auth/register')
    await expect(page).toHaveTitle(/Daya/i)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('forgot password page loads', async ({ page }) => {
    await page.goto('/auth/forgot')
    await expect(page).toHaveTitle(/Daya/i)
  })
})

test.describe('Public Pages', () => {
  test('pricing page loads', async ({ page }) => {
    await page.goto('/planes')
    await expect(page).toHaveTitle(/Daya/i)
  })

  test('about page loads', async ({ page }) => {
    await page.goto('/about')
    await expect(page).toHaveTitle(/Daya/i)
  })

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page).toHaveTitle(/Daya/i)
  })

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms')
    await expect(page).toHaveTitle(/Daya/i)
  })
})

test.describe('404 Page', () => {
  test('shows not-found for unknown routes', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-12345')
    // Next.js returns 404 or shows not-found page
    expect(res?.status()).toBeGreaterThanOrEqual(400)
  })
})
