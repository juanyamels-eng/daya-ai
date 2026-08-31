import type { Preview } from '@storybook/react'
import '../src/app/globals.css'

// Preview global del kit de componentes Daya.
// Importa globals.css para que las stories hereden los tokens de diseño
// (--bg-*, --text-*, --brand, fuentes Inter + Plex Mono) y el tema claro/oscuro.
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
    layout: 'padded',
  },
}

export default preview
