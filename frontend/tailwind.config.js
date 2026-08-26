/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Tokens tipo shadcn mapeados al sistema de diseño Daya (globals.css).
        // Así las clases text-muted-foreground, bg-background, border-input…
        // siguen el tema claro/oscuro de la app en vez de romperse.
        border: 'var(--border-default)',
        input: 'var(--border-strong)',
        ring: 'var(--brand)',
        background: 'var(--bg-base)',
        foreground: 'var(--text-primary)',
        primary: { DEFAULT: 'var(--brand)', foreground: '#ffffff' },
        secondary: { DEFAULT: 'var(--bg-elevated)', foreground: 'var(--text-primary)' },
        muted: { DEFAULT: 'var(--bg-surface)', foreground: 'var(--text-tertiary)' },
        accent: { DEFAULT: 'var(--bg-elevated)', foreground: 'var(--text-primary)' },
        destructive: { DEFAULT: 'var(--red)', foreground: '#ffffff' },
        card: { DEFAULT: 'var(--bg-surface)', foreground: 'var(--text-primary)' },
        popover: { DEFAULT: 'var(--bg-elevated)', foreground: 'var(--text-primary)' },
        daya: {
          50:  '#f0f0ff',
          100: '#e0e0ff',
          200: '#c4b5fd',
          300: '#a78bfa',
          400: '#8b5cf6',
          500: '#7c3aed',
          600: '#6d28d9',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#2e1065',
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-cal)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'typing': 'typing 1.2s steps(3, end) infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        typing: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.2' } },
      }
    },
  },
  plugins: [],
}
