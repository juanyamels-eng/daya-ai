// ============================================
// DAYA IA — Renderizador de PDF real (Puppeteer)
// Convierte el HTML hermoso del documento en un PDF de verdad.
// ============================================
import type { Browser } from 'puppeteer'

let browserPromise: Promise<Browser> | null = null

// Reutiliza una sola instancia de Chromium entre peticiones (mucho mas rapido).
// Exportada para que otras features (p.ej. la lectura de URLs con render) compartan
// el MISMO navegador en vez de arrancar otro.
export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch(err => {
      browserPromise = null // permite reintentar si fallo el arranque
      throw err
    })
  }
  return browserPromise
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = (await import('puppeteer')).default

  // En produccion (Vercel/Lambda/contenedores sin Chrome) se puede usar
  // @sparticuz/chromium. Si esta instalado, se usa automaticamente.
  try {
    const chromium = (await import('@sparticuz/chromium' as any)).default
    return await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    } as any)
  } catch {
    // Local / servidor con Chromium incluido en puppeteer
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  }
}

// Renderiza un HTML completo a un Buffer PDF tamano A4 con margenes del documento.
export async function htmlToPDF(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    // Espera a que las fuentes esten listas para que el PDF se vea fiel al diseno.
    await page.evaluateHandle('document.fonts.ready').catch(() => {})
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      // Los márgenes los controla @page en el CSS de cada generador.
      // No se fuerzan márgenes aquí para no sobreescribir los estilos de portada/cuerpo.
    })
    return Buffer.from(pdf)
  } finally {
    await page.close().catch(() => {})
  }
}

// Cierre limpio al apagar el servidor
export async function closePdfBrowser(): Promise<void> {
  if (browserPromise) {
    try { const b = await browserPromise; await b.close() } catch {}
    browserPromise = null
  }
}
