import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Auditoría de accesibilidad (WCAG) sobre las páginas públicas clave.
// Falla si hay violaciones "serious" o "critical". Se corre en CI (chromium).
// Las páginas de la app (detrás de login) se auditan aparte cuando haya sesión de test.
const PUBLIC_PAGES: Array<{ path: string; name: string }> = [
  { path: '/', name: 'landing' },
  { path: '/auth/login', name: 'login' },
  { path: '/auth/register', name: 'register' },
  { path: '/planes', name: 'pricing' },
]

for (const { path, name } of PUBLIC_PAGES) {
  test(`a11y: ${name} sin violaciones críticas`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

    const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))
    // No fallamos por "moderate"/"minor" de entrada; lo dejamos visible en el log.
    expect(serious, JSON.stringify(serious.map(v => ({ id: v.id, nodes: v.nodes.length })), null, 2)).toHaveLength(0)
  })
}
