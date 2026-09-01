import { test, expect } from '@playwright/test'

// Regresión visual de los 2 temas (claro y oscuro) sobre las páginas clave.
//
// Genera los baselines con:
//   npx playwright test e2e/visual.spec.ts --update-snapshots
//
// Fuerza el tema vía localStorage (leído por el script inline del layout antes
// del primer pintado) y pre-decide el consentimiento de cookies para que el
// banner no aparezca en los snapshots.

const THEMES = ['light', 'dark'] as const

const PAGES = [
  // La landing NO se compara aquí: tiene un carrusel de <video> (autoplay por
  // IntersectionObserver) + fondo animado (estrellas/aurora). Los fotogramas de
  // video y el renderizado animado NO son deterministas entre entornos (CI
  // headless linux ≠ máquina local), así que su snapshot no es estable — por
  // eso se audita la accesibilidad y el resto de páginas estáticas, no el pixel
  // de la portada. Si algún día la landing deja de tener video, se puede volver
  // a añadir con un baseline regenerado en el entorno de CI.
  { path: '/auth/login', name: 'login' },
  { path: '/auth/register', name: 'register' },
  { path: '/planes', name: 'pricing' },
]

async function prepare(page: import('@playwright/test').Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => {
    localStorage.setItem('daya-auth', JSON.stringify({ state: { themePref: t } }))
    localStorage.setItem('daya-cookie-consent', JSON.stringify({ necessary: true, analytics: false, decidedAt: new Date().toISOString() }))
  }, theme)
}

for (const theme of THEMES) {
  for (const { path, name } of PAGES) {
    test(`visual: ${name} (${theme})`, async ({ page }) => {
      await prepare(page, theme)
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts?.ready)
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
      expect(isDark).toBe(theme === 'dark')
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`)
    })
  }
}
