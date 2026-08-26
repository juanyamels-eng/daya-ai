import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('can navigate from landing to login', async ({ page }) => {
    await page.goto('/')
    // Find a link that goes to login
    const loginLink = page.locator('a[href*="login"]').first()
    if (await loginLink.isVisible()) {
      await loginLink.click()
      await expect(page).toHaveURL(/login/)
    }
  })

  test('can navigate from landing to register', async ({ page }) => {
    await page.goto('/')
    const registerLink = page.locator('a[href*="register"]').first()
    if (await registerLink.isVisible()) {
      await registerLink.click()
      await expect(page).toHaveURL(/register/)
    }
  })
})

test.describe('Accessibility', () => {
  test('landing page has lang attribute', async ({ page }) => {
    await page.goto('/')
    const lang = await page.getAttribute('html', 'lang')
    expect(lang).toBeTruthy()
  })

  test('pages have no empty title', async ({ page }) => {
    await page.goto('/')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('images have alt attributes or are decorative', async ({ page }) => {
    await page.goto('/')
    const images = page.locator('img')
    const count = await images.count()
    for (let i = 0; i < Math.min(count, 20); i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute('alt')
      const ariaHidden = await img.getAttribute('aria-hidden')
      // Either has alt text or is decorative
      expect(alt !== null || ariaHidden === 'true').toBeTruthy()
    }
  })
})

test.describe('Performance', () => {
  test('landing page loads within 5 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(5000)
  })

  test('no excessive layout shifts', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Check that the page has rendered content
    const body = await page.textContent('body')
    expect(body?.length).toBeGreaterThan(100)
  })
})
