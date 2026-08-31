/**
 * Config de Next MINIMAL para Storybook.
 *
 * Storybook (@storybook/nextjs) carga el next.config.js real, que envuelve todo
 * con next-intl, pone `output: standalone` y otros ajustes de producción que
 * rompen el builder webpack5 ("Cannot read properties of undefined (reading 'tap')").
 *
 * Para las stories de componentes no hace falta nada de eso: solo la resolución
 * de `canvas: false` (que ya usa el config real) y las imágenes sin optimizar.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false }
    return config
  },
}

module.exports = nextConfig
