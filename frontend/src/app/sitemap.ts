import type { MetadataRoute } from 'next'

// Sitemap generado por Next — las páginas públicas que Google debe conocer.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const now = new Date()
  return [
    { url: `${base}/`,              lastModified: now, changeFrequency: 'weekly',  priority: 1 },
    { url: `${base}/planes`,        lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/auth/register`, lastModified: now, changeFrequency: 'yearly',  priority: 0.8 },
    { url: `${base}/auth/login`,    lastModified: now, changeFrequency: 'yearly',  priority: 0.5 },
    { url: `${base}/terms`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/code`,          lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/community`,     lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/privacy`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ]
}
