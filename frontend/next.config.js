const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }]
  },

  poweredByHeader: false,

  webpack: (config) => {
    // konva intenta resolver el paquete OPCIONAL 'canvas' (render en Node). En el
    // navegador no se usa, así que lo ignoramos para que el build no falle.
    config.resolve.alias = { ...config.resolve.alias, canvas: false }
    return config
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = withNextIntl(nextConfig)
