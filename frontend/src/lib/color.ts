// Matemática de color y contraste WCAG. Es el motor de LEGIBILIDAD de todo el
// Studio: garantiza que el texto se lee sobre su fondo en carruseles,
// presentaciones y kits de identidad. Funciones puras y testeables.

// #rgb o #rrggbb(aa) → [r,g,b] (0-255), o null si no es un hex válido.
export function hexToRgb(h: string): [number, number, number] | null {
  if (typeof h !== 'string') return null
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map(c => c + c).join('')
  if (s.length < 6) return null
  const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16)
  return [r, g, b].every(n => isFinite(n)) ? [r, g, b] : null
}

// Luminancia relativa WCAG (0 = negro, 1 = blanco).
export function relLum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

// Ratio de contraste WCAG entre dos colores (1 = igual, 21 = negro/blanco).
// Si algún color no es válido devuelve 21 (no bloquea, asume máximo contraste).
export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a), rb = hexToRgb(b); if (!ra || !rb) return 21
  const la = relLum(ra), lb = relLum(rb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// El texto legible sobre un color: blanco o casi-negro, el de mayor contraste.
export function inkOn(hex: string): string {
  return contrastRatio(hex, '#0f172a') >= contrastRatio(hex, '#ffffff') ? '#0f172a' : '#ffffff'
}
