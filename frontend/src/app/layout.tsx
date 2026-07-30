import type { Metadata, Viewport } from 'next'
import './globals.css'
import CookieConsent from '../components/CookieConsent'
import { Inter, Instrument_Serif, IBM_Plex_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

// SIN lista de pesos = fuente VARIABLE. Antes se cargaban solo 400/600/700/800,
// así que los `font-weight: 500` (el h1 de la landing, los títulos de tarjeta) y
// los 650/740/750 de la app NO EXISTÍAN: el navegador los falsificaba o caía al
// 400. De ahí que los titulares se vieran flojos. Ahora cualquier peso es real.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// La voz de la landing, como opencode.ai (que compone su web entera en mono, con
// Berkeley Mono y IBM Plex Mono de sustituto). Plex Mono es libre (OFL).
// OJO: Plex Mono NO es variable — solo existen estos pesos discretos, así que en
// el CSS hay que usar exactamente estos números y no valores intermedios.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
})

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // La barra del navegador en móvil acompaña al tema en lugar de quedarse blanca.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#131314' },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Daya AI — Chatea, investiga y programa con IA',
  description: 'Chat, documentos, imágenes, Cuadernos y un agente de código en tu terminal. Todo en una sola cuenta, y Daya elige el modelo adecuado para cada tarea.',
  icons: { icon: '/favicon.png', apple: '/favicon.png' },
  keywords: ['IA', 'inteligencia artificial', 'AI', 'chat', 'notebooklm', 'cuadernos', 'agente de código', 'Daya Code', 'asistente'],
  authors: [{ name: 'DAYA AI' }],
  openGraph: {
    title: 'Daya AI — Chatea, investiga y programa con IA',
    description: 'Toda la IA que necesitas, por menos: chat, documentos, imágenes, Cuadernos y un agente de código, en una sola cuenta.',
    type: 'website',
    siteName: 'Daya AI',
    // Tarjeta de marca 1200x630 (antes era el logo suelto de 880x880 sobre
    // nada). Se intentó generarla con next/og (opengraph-image.tsx, la
    // convención de archivo de Next) pero @vercel/og trae un bug real en
    // Windows: revienta con "Invalid URL" dentro de su propio bundle
    // (node_modules/next/dist/compiled/@vercel/og), sin relación con
    // nuestro código — así que se renderizó una sola vez con Playwright
    // (mismo motor que graba los videos del arcade) y se sirve como PNG
    // estático: cero riesgo de runtime, cien por cien verificable en local.
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Daya AI — Chatea, investiga y programa con IA',
    description: 'Toda la IA que necesitas, por menos: chat, documentos, imágenes, Cuadernos y un agente de código, en una sola cuenta.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={`${inter.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Tema ANTES del primer pintado (sin parpadeo): lee la preferencia persistida
            y aplica .dark en <html>. Antes solo el dashboard lo hacía → recargar en
            /notes, /settings, etc. mostraba tema claro a usuarios en oscuro.
            Con preferencia 'system' (o sin nada guardado, que es el caso de quien
            entra por primera vez) decide prefers-color-scheme. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var s=(JSON.parse(localStorage.getItem('daya-auth')||'{}')||{}).state||{};var p=s.themePref||s.theme||'system';var d=p==='dark'||(p==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}` }} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <CookieConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
