// ============================================
// DAYA IA — Generador de PowerPoint real (.pptx) — NIVEL PREMIUM
// Usa pptxgenjs. Portada a pantalla completa, layouts que alternan,
// color de acento por plantilla, números de sección y slide de cierre.
// ============================================
import PptxGenJS from 'pptxgenjs'
import { SlideData } from './pptGenerator'
import { DESIGN, hex } from './designSystem'

const GRAPHITE = hex(DESIGN.color.graphite)
const MIST = hex(DESIGN.color.mist)
const PAPER = 'FFFFFF'
const SURFACE = 'F4F4F5'

// Paleta por plantilla: acento, tinta (títulos), fondo, texto de cuerpo y si es tema OSCURO.
// Los temas oscuros (negro/noche/medianoche/carbon) pintan TODO el slide en oscuro
// con texto claro — antes quedaban con fondo blanco y texto invisible.
type PTheme = {
  accent: string; ink: string; font: string;
  bg: string; text: string; heading: string; soft: string; surface: string; dark: boolean
}
const light = (o: { accent: string; ink: string; font?: string }): PTheme => ({
  font: 'Arial', bg: PAPER, text: GRAPHITE, heading: o.ink, soft: MIST, surface: SURFACE, dark: false, ...o,
})
const darkT = (o: { accent: string; font?: string; bg?: string; surface?: string }): PTheme => ({
  font: 'Arial', ink: 'F5F5F7', bg: '0E0E11', text: 'D4D4D8', heading: 'FAFAFA', soft: 'A1A1AA', surface: '1C1C22', dark: true, ...o,
})
const PThemes: Record<string, PTheme> = {
  ejecutivo:   light({ accent: '2A2A2E', ink: '0F0F14' }),
  academico:   light({ accent: '1E3A5F', ink: '16243A', font: 'Georgia' }),
  moderno:     light({ accent: '4F46E5', ink: '1E1B4B' }),
  minimalista: light({ accent: '6B7280', ink: '111827' }),
  corporativo: light({ accent: '1D4ED8', ink: '172554' }),
  esmeralda:   light({ accent: '059669', ink: '064E3B' }),
  editorial:   light({ accent: 'C2410C', ink: '431407', font: 'Georgia' }),
  tech:        light({ accent: '0891B2', ink: '0E2A33' }),
  elegante:    light({ accent: 'A16207', ink: '1C1917', font: 'Georgia' }),
  calido:      light({ accent: 'EA580C', ink: '7C2D12' }),
  blanco:      light({ accent: '111111', ink: '000000' }),
  rubi:        light({ accent: 'BE123C', ink: '4C0519', font: 'Georgia' }),
  oceano:      light({ accent: '0369A1', ink: '082F49' }),
  violeta:     light({ accent: '7C3AED', ink: '2E1065' }),
  bosque:      light({ accent: '15803D', ink: '14532D', font: 'Georgia' }),
  slate:       light({ accent: '475569', ink: '0F172A' }),
  coral:       light({ accent: 'E11D48', ink: '4C0519' }),
  // ——— TEMAS OSCUROS (fondo negro real) ———
  negro:       darkT({ accent: 'E5E5E5' }),
  noche:       darkT({ accent: '818CF8' }),
  medianoche:  darkT({ accent: '22D3EE', bg: '0B1220', surface: '13203A' }),
  carbon:      darkT({ accent: 'FBBF24', bg: '161616', surface: '222222' }),
}

// Descarga una imagen y la devuelve como data URI base64.
async function imageToDataUri(url?: string): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (buf.length < 800 || buf.length > 6_000_000) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// Construye las viñetas "premium" como un array PLANO de runs (formato que espera
// pptxgenjs). Si una viñeta trae "Idea clave: explicación", la idea va en negrita.
function bulletRuns(bullets: string[], t: PTheme, size = 15): PptxGenJS.TextProps[] {
  const runs: PptxGenJS.TextProps[] = []
  for (const b of bullets) {
    const m = b.match(/^\s*([^:–—]{2,42})[:–—]\s+(.+)$/)
    if (m) {
      runs.push({ text: m[1].trim() + ': ', options: { bullet: { code: '2022', indent: 18 }, color: t.heading, bold: true, fontSize: size } })
      runs.push({ text: m[2].trim(), options: { color: t.text, fontSize: size, paraSpaceAfter: 13, breakLine: true } })
    } else {
      runs.push({ text: b, options: { bullet: { code: '2022', indent: 18 }, color: t.text, fontSize: size, paraSpaceAfter: 13, breakLine: true } })
    }
  }
  return runs
}

export async function buildPPTX(
  title: string,
  subtitle: string,
  slides: SlideData[],
  branded: boolean = true,
  style: string = 'ejecutivo'
): Promise<Buffer> {
  const t = PThemes[style] || PThemes.ejecutivo
  const pptx = new PptxGenJS()
  pptx.author = DESIGN.brand.name
  pptx.company = DESIGN.brand.org
  pptx.title = title
  pptx.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 in

  const W = 13.33
  const H = 7.5
  const brand = branded ? DESIGN.brand.name : ''
  const brandOrg = branded ? DESIGN.brand.org.toUpperCase() : ''

  // Pre-descarga imágenes en paralelo
  const imgs = await Promise.all(slides.map(s => imageToDataUri(s.imageUrl)))

  let contentIndex = 0

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const s = pptx.addSlide()
    s.background = { color: t.bg }
    const img = imgs[i]

    // ============ PORTADA ============
    if (slide.type === 'cover') {
      if (img) {
        // Imagen a pantalla completa + velo degradado + título encima
        s.addImage({ data: img, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } })
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: '0A0A0C', transparency: 38 } })
        s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 3.6, w: W, h: 3.6, fill: { color: '0A0A0C', transparency: 8 } })
        // barra de acento
        s.addShape(pptx.ShapeType.rect, { x: 0.85, y: 3.5, w: 0.9, h: 0.09, fill: { color: t.accent } })
        if (brandOrg) s.addText(brandOrg, { x: 0.85, y: 2.9, w: 8, h: 0.4, fontFace: t.font, fontSize: 12, color: 'FFFFFF', charSpacing: 3, bold: true })
        s.addText(title, { x: 0.8, y: 3.8, w: 11.4, h: 2.2, fontFace: t.font, fontSize: 40, color: PAPER, bold: true, valign: 'top' })
        if (subtitle) s.addText(subtitle, { x: 0.85, y: 5.9, w: 10, h: 0.8, fontFace: t.font, fontSize: 16, color: 'FFFFFF', valign: 'top' })
      } else {
        // Sin imagen: portada tipográfica con bloque de color
        s.background = { color: t.dark ? t.bg : t.ink }
        s.addShape(pptx.ShapeType.rect, { x: 0.85, y: 3.0, w: 1.0, h: 0.1, fill: { color: t.accent } })
        if (brandOrg) s.addText(brandOrg, { x: 0.85, y: 2.4, w: 8, h: 0.4, fontFace: t.font, fontSize: 12, color: t.dark ? t.soft : MIST, charSpacing: 3, bold: true })
        s.addText(title, { x: 0.8, y: 3.3, w: 11.4, h: 2.4, fontFace: t.font, fontSize: 44, color: PAPER, bold: true, valign: 'top' })
        if (subtitle) s.addText(subtitle, { x: 0.85, y: 5.7, w: 10, h: 0.8, fontFace: t.font, fontSize: 16, color: t.dark ? t.soft : MIST, valign: 'top' })
      }
      if (brand) s.addText(`Generado con ${brand}`, { x: 0.85, y: H - 0.6, w: 6, h: 0.3, fontFace: t.font, fontSize: 9, color: img ? 'FFFFFF' : (t.dark ? t.soft : MIST) })
      continue
    }

    // ============ SLIDES DE CONTENIDO (layouts que alternan) ============
    contentIndex++
    const num = String(contentIndex).padStart(2, '0')
    const bullets = (slide.bulletPoints || []).filter(Boolean)
    const layout = contentIndex % 2 === 0 ? 'imgLeft' : 'imgRight'

    // Número de sección grande (acento) — marca de diseño
    s.addText(num, { x: 0.7, y: 0.45, w: 1.5, h: 0.7, fontFace: t.font, fontSize: 30, color: t.accent, bold: true, valign: 'top' })

    if (img && layout === 'imgRight') {
      // Texto izquierda, imagen derecha
      s.addText(slide.title, { x: 0.7, y: 1.15, w: 7.0, h: 1.2, fontFace: t.font, fontSize: 26, color: t.heading, bold: true, valign: 'top' })
      s.addShape(pptx.ShapeType.rect, { x: 0.72, y: 2.25, w: 0.7, h: 0.06, fill: { color: t.accent } })
      if (bullets.length) s.addText(
        bulletRuns(bullets, t),
        { x: 0.7, y: 2.55, w: 6.8, h: H - 3.3, fontFace: t.font, valign: 'top', lineSpacingMultiple: 1.12 }
      )
      s.addImage({ data: img, x: 8.0, y: 1.15, w: 4.6, h: 5.2, sizing: { type: 'cover', w: 4.6, h: 5.2 }, rounding: true })
    } else if (img && layout === 'imgLeft') {
      // Imagen izquierda, texto derecha
      s.addImage({ data: img, x: 0.7, y: 1.15, w: 4.6, h: 5.2, sizing: { type: 'cover', w: 4.6, h: 5.2 }, rounding: true })
      s.addText(slide.title, { x: 5.7, y: 1.15, w: 7.0, h: 1.2, fontFace: t.font, fontSize: 26, color: t.heading, bold: true, valign: 'top' })
      s.addShape(pptx.ShapeType.rect, { x: 5.72, y: 2.25, w: 0.7, h: 0.06, fill: { color: t.accent } })
      if (bullets.length) s.addText(
        bulletRuns(bullets, t),
        { x: 5.7, y: 2.55, w: 6.9, h: H - 3.3, fontFace: t.font, valign: 'top', lineSpacingMultiple: 1.12 }
      )
    } else {
      // Sin imagen: título grande + viñetas anchas, número fantasma de fondo
      s.addText(num, { x: 9.5, y: 0.2, w: 3.5, h: 3.5, fontFace: t.font, fontSize: 180, color: t.surface, bold: true, align: 'right', valign: 'top' })
      s.addText(slide.title, { x: 0.7, y: 1.15, w: 11.6, h: 1.2, fontFace: t.font, fontSize: 28, color: t.heading, bold: true, valign: 'top' })
      s.addShape(pptx.ShapeType.rect, { x: 0.72, y: 2.3, w: 0.7, h: 0.06, fill: { color: t.accent } })
      if (bullets.length) s.addText(
        bulletRuns(bullets, t, 16),
        { x: 0.7, y: 2.6, w: 11.4, h: H - 3.4, fontFace: t.font, valign: 'top', lineSpacingMultiple: 1.15 }
      )
    }

    // Pie: marca + número
    if (brand) s.addText(brand, { x: 0.7, y: H - 0.55, w: 4, h: 0.3, fontFace: t.font, fontSize: 9, color: t.soft, charSpacing: 2 })
    s.addText(`${slide.slideNumber || contentIndex}`, { x: W - 1.1, y: H - 0.55, w: 0.6, h: 0.3, fontFace: t.font, fontSize: 11, color: t.soft, align: 'right' })

    if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
  }

  // ============ SLIDE DE CIERRE ============
  const closing = pptx.addSlide()
  closing.background = { color: t.dark ? t.bg : t.ink }
  closing.addShape(pptx.ShapeType.rect, { x: 5.67, y: 3.55, w: 2.0, h: 0.1, fill: { color: t.accent } })
  closing.addText('Gracias', { x: 0, y: 2.6, w: W, h: 1.0, fontFace: t.font, fontSize: 48, color: PAPER, bold: true, align: 'center' })
  if (brand) closing.addText(`${brand} · ${DESIGN.brand.org}`, { x: 0, y: 3.8, w: W, h: 0.5, fontFace: t.font, fontSize: 14, color: t.dark ? t.soft : MIST, align: 'center', charSpacing: 2 })

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as unknown as Buffer
  return Buffer.from(out)
}
