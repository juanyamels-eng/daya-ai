import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Daya-ai',
    short_name: 'Daya-ai',
    description: 'Chat, documentos, imágenes, Cuadernos y un agente de código. Daya enruta cada tarea al mejor modelo.',
    start_url: '/',
    display: 'standalone',
    background_color: '#131314',
    theme_color: '#131314',
    categories: ['productivity', 'ai', 'tools'],
    icons: [
      { src: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { src: '/favicon.png', sizes: '72x72', type: 'image/png' },
      { src: '/favicon.png', sizes: '96x96', type: 'image/png' },
      { src: '/favicon.png', sizes: '128x128', type: 'image/png' },
      { src: '/favicon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
