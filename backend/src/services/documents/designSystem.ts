// ============================================
// DAYA IA — Sistema de Diseño Unificado
// Tema claro único · Estética neutra de alta gama · CERO azul genérico
// Usado por los 4 generadores: PDF, Word, Excel, PowerPoint
// ============================================

export const DESIGN = {
  // === PALETA NEUTRA DE ALTA GAMA ===
  color: {
    ink:        '#0A0A0C', // texto principal (casi negro)
    charcoal:   '#1C1C1F', // carbón — cabeceras, acentos fuertes
    graphite:   '#3F3F46', // gris oscuro — subtítulos
    slate:      '#52525B', // gris medio — texto secundario
    mist:       '#A1A1AA', // gris claro — texto terciario
    line:       '#E4E4E7', // líneas y bordes sutiles
    lineLight:  '#F0F0F2', // líneas muy suaves
    surface:    '#FAFAFA', // fondo de cajas/callouts
    surfaceAlt: '#F4F4F5', // cebreado de tablas
    white:      '#FFFFFF',
    // Acentos semánticos (sin azul genérico)
    accent:     '#18181B', // acción/énfasis = carbón profundo
    success:    '#16A34A',
    warning:    '#D97706',
    danger:     '#DC2626',
  },

  // === TIPOGRAFÍA ===
  font: {
    sans: "'Inter', 'Segoe UI', -apple-system, system-ui, sans-serif",
    serif: "'Georgia', 'Times New Roman', serif",
    mono: "'SF Mono', 'JetBrains Mono', 'Consolas', monospace",
  },

  // === ESCALA TIPOGRÁFICA (ritmo proporcional) ===
  size: {
    display: 56, // portadas
    h1: 32,
    h2: 24,
    h3: 19,
    body: 15,
    small: 13,
    caption: 11,
  },

  // === ESPACIADO (sistema de 8px) ===
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },

  // === MARCA ===
  brand: {
    name: 'DAYA AI',
    org: 'DAYA AI',
  },
}

// Línea geométrica minimalista (separador horizontal) — HTML/CSS
export function divider(width = '48px'): string {
  return `<div style="width:${width};height:3px;background:${DESIGN.color.charcoal};margin:${DESIGN.space.md}px 0;border-radius:2px;"></div>`
}

// Sello minimalista de DAYA AI para esquinas (HTML/CSS)
export function brandStamp(): string {
  return `<div style="font-family:${DESIGN.font.sans};font-size:${DESIGN.size.caption}px;color:${DESIGN.color.mist};letter-spacing:0.08em;text-transform:uppercase;">${DESIGN.brand.org}</div>`
}

// Convierte hex a {r,g,b} — útil para xlsx/pptxgenjs que requieren formatos sin '#'
export function hex(color: string): string {
  return color.replace('#', '').toUpperCase()
}

// Detecta si un texto representa dinero (para formato de moneda en Excel)
export function looksLikeMoney(header: string): boolean {
  return /precio|costo|monto|total|importe|valor|ingreso|venta|salario|sueldo|presupuesto|\$|s\/\.|soles|usd|pen/i.test(header)
}

// Detecta si un texto representa fecha
export function looksLikeDate(header: string): boolean {
  return /fecha|date|día|dia|mes|año|ano|periodo|vencimiento/i.test(header)
}
