import type { MetadataRoute } from 'next'

// robots.txt generado por Next — qué pueden indexar los buscadores.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Zonas privadas: no tienen nada que hacer en Google. `/s/` y `/d/` son
      // enlaces que comparte el usuario a mano: se ven con el enlace, pero no
      // deben acabar indexados.
      disallow: ['/dashboard', '/settings', '/admin', '/auth/callback', '/auth/reset', '/s/', '/d/'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
