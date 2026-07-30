import type { MetadataRoute } from 'next'

// Manifest de la app — permite "Agregar a pantalla de inicio" en el celular:
// Daya se instala con su icono y abre a pantalla completa, como una app nativa.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Daya AI — Tu inteligencia artificial',
    short_name: 'Daya AI',
    description:
      'Chatea, genera documentos profesionales y analiza tus archivos con inteligencia artificial.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/favicon.png', sizes: 'any', type: 'image/png' },
      { src: '/logo.png', sizes: 'any', type: 'image/png', purpose: 'any' },
    ],
  }
}
