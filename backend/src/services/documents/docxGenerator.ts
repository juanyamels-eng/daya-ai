// ============================================
// DAYA IA — Generador de Word real (.docx) — NIVEL PREMIUM
// Color de acento por plantilla, secciones numeradas, imágenes
// (portada + por sección) y white-label en planes de pago.
// ============================================
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, ImageRun,
} from 'docx'
import { DESIGN } from './designSystem'
import { generateImageQueries } from './documentService'
import { findImageCandidates } from './imageService'

const GRAPHITE = DESIGN.color.graphite.replace('#', '')
const MIST = DESIGN.color.mist.replace('#', '')

// Paleta de acento + fuente por plantilla (mismas que el PDF/PPT)
type WTheme = { accent: string; ink: string; font: string }
const WThemes: Record<string, WTheme> = {
  ejecutivo:   { accent: '2A2A2E', ink: '0F0F14', font: 'Calibri' },
  academico:   { accent: '1E3A5F', ink: '16243A', font: 'Georgia' },
  moderno:     { accent: '4F46E5', ink: '1E1B4B', font: 'Calibri' },
  minimalista: { accent: '6B7280', ink: '111827', font: 'Calibri' },
  corporativo: { accent: '1D4ED8', ink: '172554', font: 'Calibri' },
  esmeralda:   { accent: '059669', ink: '064E3B', font: 'Calibri' },
  editorial:   { accent: 'C2410C', ink: '431407', font: 'Georgia' },
  tech:        { accent: '0891B2', ink: '0E2A33', font: 'Calibri' },
  elegante:    { accent: 'A16207', ink: '1C1917', font: 'Georgia' },
  calido:      { accent: 'EA580C', ink: '7C2D12', font: 'Calibri' },
  blanco:      { accent: '111111', ink: '000000', font: 'Calibri' },
  negro:       { accent: '3F3F46', ink: '0A0A0C', font: 'Calibri' },
  noche:       { accent: '4F46E5', ink: '1E1B4B', font: 'Calibri' },
  rubi:        { accent: 'BE123C', ink: '4C0519', font: 'Georgia' },
  oceano:      { accent: '0369A1', ink: '082F49', font: 'Calibri' },
  violeta:     { accent: '7C3AED', ink: '2E1065', font: 'Calibri' },
  bosque:      { accent: '15803D', ink: '14532D', font: 'Georgia' },
  slate:       { accent: '475569', ink: '0F172A', font: 'Calibri' },
  medianoche:  { accent: '0E7490', ink: '083344', font: 'Calibri' },
  carbon:      { accent: 'B45309', ink: '1C1917', font: 'Calibri' },
  coral:       { accent: 'E11D48', ink: '4C0519', font: 'Calibri' },
}

// Procesa **negrita**, *cursiva* y `codigo` -> TextRun[]
function inlineRuns(text: string, font: string, ink: string): TextRun[] {
  const runs: TextRun[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), color: GRAPHITE, font }))
    if (m[2] !== undefined) runs.push(new TextRun({ text: m[2], bold: true, color: ink, font }))
    else if (m[3] !== undefined) runs.push(new TextRun({ text: m[3], italics: true, color: GRAPHITE, font }))
    else if (m[4] !== undefined) runs.push(new TextRun({ text: m[4], font: 'Consolas', color: ink }))
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), color: GRAPHITE, font }))
  return runs.length ? runs : [new TextRun({ text, color: GRAPHITE, font })]
}

async function fetchImageBuffer(url?: string | null): Promise<Buffer | null> {
  if (!url) return null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const b = Buffer.from(await r.arrayBuffer())
    if (b.length < 800 || b.length > 6_000_000) return null
    return b
  } catch { return null }
}

function markdownToParagraphs(
  markdown: string,
  t: WTheme,
  sectionImages: Map<string, Buffer>
): Paragraph[] {
  const blocks = markdown.split(/\n{2,}/)
  const out: Paragraph[] = []
  let sec = 0

  for (const raw of blocks) {
    const block = raw.trim()
    if (!block) continue

    // Encabezado (solo la primera línea; el resto va como párrafo)
    const hm = block.match(/^(#{1,3})\s+(.+?)(?:\n([\s\S]*))?$/)
    if (hm) {
      const level = hm[1].length
      const heading = hm[2].trim()
      const rest = (hm[3] || '').trim()
      if (level === 3) {
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 220, after: 80 }, children: [new TextRun({ text: heading, bold: true, color: t.ink, size: 26, font: t.font })] }))
      } else {
        sec++
        const num = String(sec).padStart(2, '0')
        out.push(new Paragraph({ spacing: { before: 40, after: 20 }, children: [new TextRun({ text: num, bold: true, color: t.accent, size: 18, characterSpacing: 30, font: t.font })] }))
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { after: 100 }, border: { bottom: { color: t.accent, space: 4, style: BorderStyle.SINGLE, size: 12 } }, children: [new TextRun({ text: heading, bold: true, color: t.ink, size: 30, font: t.font })] }))
        // imagen de la sección, si hay
        const buf = sectionImages.get(heading)
        if (buf) {
          out.push(new Paragraph({ spacing: { before: 80, after: 120 }, children: [ new ImageRun({ data: buf as any, type: 'jpg', transformation: { width: 560, height: 240 } } as any) ] }))
        }
      }
      if (rest) {
        rest.split('\n').forEach(line => out.push(new Paragraph({ spacing: { after: 140, line: 300 }, alignment: AlignmentType.JUSTIFIED, children: inlineRuns(line, t.font, t.ink) })))
      }
      continue
    }

    if (/^>\s+/.test(block)) {
      out.push(new Paragraph({ spacing: { before: 120, after: 120 }, indent: { left: 360 }, border: { left: { color: t.accent, space: 12, style: BorderStyle.SINGLE, size: 18 } }, children: inlineRuns(block.replace(/^>\s+/, ''), t.font, t.ink) }))
      continue
    }

    const lines = block.split('\n')
    const isList = lines.every(l => /^\s*([-*]|\d+\.)\s+/.test(l))
    if (isList) {
      const ordered = /^\s*\d+\.\s+/.test(lines[0])
      lines.forEach(l => {
        const txt = l.replace(/^\s*([-*]|\d+\.)\s+/, '')
        out.push(new Paragraph({ spacing: { after: 60 }, ...(ordered ? { numbering: { reference: 'daya-ol', level: 0 } } : { bullet: { level: 0 } }), children: inlineRuns(txt, t.font, t.ink) }))
      })
      continue
    }

    lines.forEach(line => out.push(new Paragraph({ spacing: { after: 140, line: 300 }, alignment: AlignmentType.JUSTIFIED, children: inlineRuns(line, t.font, t.ink) })))
  }
  return out
}

// Genera un Buffer .docx real PREMIUM
export async function buildDOCX(
  title: string,
  content: string,
  topic: string = '',
  branded: boolean = true,
  style: string = 'ejecutivo'
): Promise<Buffer> {
  const t = WThemes[style] || WThemes.ejecutivo
  const today = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })

  // Imágenes: portada + por sección (búsquedas inteligentes de la IA, con dedup)
  const headings = (content.match(/^##\s+(.+)$/gm) || []).map(h => h.replace(/^##\s+/, '').trim()).slice(0, 4)
  const smart = await generateImageQueries(topic || title, headings).catch(() => ({ cover: '', sections: {} as Record<string, string> }))
  const cleanTopic = (topic || title).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 50)
  const used = new Set<string>()
  const pickBuf = async (q: string): Promise<Buffer | null> => {
    const cands = await findImageCandidates(q).catch(() => [])
    for (const u of cands) { if (used.has(u)) continue; const b = await fetchImageBuffer(u); if (b) { used.add(u); return b } }
    return null
  }
  const coverBuf = await pickBuf(smart.cover || cleanTopic)
  const sectionImages = new Map<string, Buffer>()
  for (const h of headings) {
    const b = await pickBuf(smart.sections?.[h] || `${cleanTopic} ${h}`)
    if (b) sectionImages.set(h, b)
  }

  const header: Paragraph[] = [
    ...(branded ? [new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${DESIGN.brand.name} · ${DESIGN.brand.org}`.toUpperCase(), bold: true, color: t.accent, size: 18, characterSpacing: 30, font: t.font })] })] : []),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, color: t.ink, size: 52, font: t.font })] }),
    new Paragraph({ spacing: { after: 160 }, border: { bottom: { color: t.accent, space: 6, style: BorderStyle.SINGLE, size: 18 } }, children: [new TextRun({ text: `Informe · ${today}`, color: MIST, size: 20, font: t.font })] }),
  ]
  if (coverBuf) {
    header.push(new Paragraph({ spacing: { after: 200 }, children: [ new ImageRun({ data: coverBuf as any, type: 'jpg', transformation: { width: 600, height: 300 } } as any) ] }))
  }

  const footer: Paragraph[] = [
    new Paragraph({ spacing: { before: 320 }, alignment: AlignmentType.CENTER, border: { top: { color: DESIGN.color.line.replace('#', ''), space: 8, style: BorderStyle.SINGLE, size: 6 } }, children: [new TextRun({ text: branded ? `Generado con ${DESIGN.brand.name} — ${DESIGN.brand.org}` : `Generado el ${today}`, color: MIST, size: 16, characterSpacing: 20, font: t.font })] }),
  ]

  const doc = new Document({
    creator: DESIGN.brand.name,
    title,
    numbering: { config: [{ reference: 'daya-ol', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }] }] },
    styles: { default: { document: { run: { font: t.font, size: 22, color: GRAPHITE } } } },
    sections: [{
      properties: { page: { margin: { top: 1418, bottom: 1418, left: 1418, right: 1418 } } },
      children: [...header, ...markdownToParagraphs(content, t, sectionImages), ...footer],
    }],
  })

  const buf = await Packer.toBuffer(doc)
  return Buffer.from(buf)
}
