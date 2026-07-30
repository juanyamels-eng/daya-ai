// ============================================================
// Daya — Motor de exportación a PDF (diseño editorial premium)
// ------------------------------------------------------------
// Renderiza la conversación como un PDF con texto VECTORIAL (no
// captura de pantalla): tipografía jerárquica, bloques de código
// con fondo tenue, paginación estricta (nunca corta una línea ni
// un bloque a la mitad) y pie "Página X de Y" en cada hoja.
//
// Se eligió jsPDF con renderizado programático en lugar de
// html2canvas porque este último rasteriza (texto no seleccionable,
// baja nitidez y sin control real de saltos de página ni de pies
// por hoja). Aquí cada línea se mide y se pagina de forma explícita.
// ============================================================

import { jsPDF } from 'jspdf'

// ---- Tipos públicos ----------------------------------------

export interface PdfMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface PdfExportOptions {
  /** Título inteligente de la conversación (encabezado + nombre de archivo). */
  title: string
  messages: PdfMessage[]
  /** Etiqueta para los mensajes del usuario (ej. su nombre). Por defecto "Tú". */
  userLabel?: string
  /** Fecha de generación; por defecto, ahora. */
  generatedAt?: Date
}

// ---- Configuración de layout (tipada) ----------------------

interface LayoutTheme {
  pageWidth: number
  pageHeight: number
  marginX: number
  contentTop: number      // primera línea de contenido (bajo el encabezado)
  contentBottom: number   // límite inferior antes del pie
  colors: {
    text: RGB
    muted: RGB
    faint: RGB
    rule: RGB
    codeBg: RGB
    codeText: RGB
    accent: RGB
    quoteBar: RGB
  }
  sizes: { h1: number; h2: number; h3: number; body: number; small: number; code: number; label: number; footer: number }
  leading: { heading: number; body: number; code: number }  // multiplicador de interlineado
  fontBody: string
  fontMono: string
}

type RGB = readonly [number, number, number]

interface TextStyle {
  size: number
  color: RGB
  lineHeight: number
  indent?: number
}

interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  link?: boolean
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'para'; text: string }
  | { type: 'list'; ordered: boolean; items: { text: string; indent: number }[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; code: string }
  | { type: 'hr' }
  | { type: 'table'; header: string[]; rows: string[][] }

// ---- Utilidades --------------------------------------------

const PT_TO_MM = 0.352778

function ptToMm(pt: number): number {
  return pt * PT_TO_MM
}

function buildTheme(): LayoutTheme {
  const pageWidth = 210
  const pageHeight = 297
  return {
    pageWidth,
    pageHeight,
    marginX: 20,
    contentTop: 24,
    contentBottom: pageHeight - 20,
    colors: {
      text: [26, 29, 35],
      muted: [107, 114, 128],
      faint: [156, 163, 175],
      rule: [229, 231, 235],
      codeBg: [244, 244, 245],
      codeText: [36, 41, 47],
      accent: [37, 99, 235],
      quoteBar: [209, 213, 219],
    },
    sizes: { h1: 22, h2: 15, h3: 12.5, body: 10.5, small: 8.5, code: 9, label: 8.5, footer: 8 },
    leading: { heading: 1.28, body: 1.5, code: 1.45 },
    fontBody: 'helvetica',
    fontMono: 'courier',
  }
}

// Divide el markdown en bloques estructurados de forma pragmática pero robusta.
function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  const isBlank = (s: string) => s.trim() === ''
  const codeFence = /^\s*```/
  const heading = /^(#{1,6})\s+(.*)$/
  const ulItem = /^(\s*)[-*+]\s+(.*)$/
  const olItem = /^(\s*)\d+[.)]\s+(.*)$/
  const quote = /^\s*>\s?(.*)$/
  const hr = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
  const tableSep = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/

  while (i < lines.length) {
    const line = lines[i]

    if (isBlank(line)) { i++; continue }

    // Bloque de código con vallas ```
    if (codeFence.test(line)) {
      i++
      const buf: string[] = []
      while (i < lines.length && !codeFence.test(lines[i])) { buf.push(lines[i]); i++ }
      if (i < lines.length) i++ // consume la valla de cierre
      blocks.push({ type: 'code', code: buf.join('\n') })
      continue
    }

    // Encabezados
    const hMatch = line.match(heading)
    if (hMatch) {
      const level = Math.min(3, hMatch[1].length) as 1 | 2 | 3
      blocks.push({ type: 'heading', level, text: hMatch[2].trim() })
      i++
      continue
    }

    // Regla horizontal
    if (hr.test(line)) { blocks.push({ type: 'hr' }); i++; continue }

    // Tabla (línea con pipes + fila separadora debajo)
    if (line.includes('|') && i + 1 < lines.length && tableSep.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const parseRow = (row: string) =>
        row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
      const header = parseRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) {
        rows.push(parseRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    // Listas (ordenadas / no ordenadas), con soporte de anidamiento por sangría
    if (ulItem.test(line) || olItem.test(line)) {
      const ordered = olItem.test(line)
      const re = ordered ? olItem : ulItem
      const items: { text: string; indent: number }[] = []
      while (i < lines.length && (ulItem.test(lines[i]) || olItem.test(lines[i]))) {
        const m = lines[i].match(re) || lines[i].match(ordered ? ulItem : olItem)
        if (!m) break
        const indent = Math.min(3, Math.floor((m[1]?.length || 0) / 2))
        items.push({ text: m[2].trim(), indent })
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    // Cita
    if (quote.test(line)) {
      const buf: string[] = []
      while (i < lines.length && quote.test(lines[i])) {
        buf.push((lines[i].match(quote) as RegExpMatchArray)[1])
        i++
      }
      blocks.push({ type: 'quote', text: buf.join(' ').trim() })
      continue
    }

    // Párrafo (agrupa líneas hasta un blanco o el inicio de otro bloque)
    const buf: string[] = []
    while (
      i < lines.length && !isBlank(lines[i]) &&
      !codeFence.test(lines[i]) && !heading.test(lines[i]) &&
      !ulItem.test(lines[i]) && !olItem.test(lines[i]) &&
      !quote.test(lines[i]) && !hr.test(lines[i])
    ) {
      buf.push(lines[i].trim())
      i++
    }
    blocks.push({ type: 'para', text: buf.join(' ') })
  }

  return blocks
}

// Tokeniza formato en línea: **negrita**, *cursiva*, `código`, [texto](url).
function tokenizeInline(text: string): InlineRun[] {
  const runs: InlineRun[] = []
  // Primero aislamos el código en línea para no tocar su contenido.
  const parts = text.split(/(`[^`]+`)/g)
  for (const seg of parts) {
    if (!seg) continue
    if (seg.length >= 2 && seg.startsWith('`') && seg.endsWith('`')) {
      runs.push({ text: seg.slice(1, -1), code: true })
    } else {
      parseEmphasis(seg, runs, {})
    }
  }
  return runs.length ? runs : [{ text }]
}

function parseEmphasis(text: string, out: InlineRun[], base: Partial<InlineRun>): void {
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pushPlain(text.slice(last, m.index), out, base)
    if (m[1]) parseEmphasis(m[2], out, { ...base, bold: true })
    else if (m[3]) parseEmphasis(m[4], out, { ...base, italic: true })
    else if (m[5]) out.push({ ...base, text: m[5], link: true })
    last = re.lastIndex
  }
  if (last < text.length) pushPlain(text.slice(last), out, base)
}

function pushPlain(t: string, out: InlineRun[], base: Partial<InlineRun>): void {
  if (t) out.push({ ...base, text: t })
}

// Las fuentes estándar de jsPDF (Helvetica/Courier) solo cubren WinAnsi (Latin-1).
// Mapeamos los caracteres frecuentes fuera de ese rango (flechas, símbolos) a
// equivalentes seguros y eliminamos emojis para que no salgan glifos corruptos.
const CHAR_MAP: Record<string, string> = {
  '→': '->', '⇒': '=>', '⟶': '->', '←': '<-', '⇐': '<=', '↔': '<->',
  '✓': '-', '✔': '-', '✗': 'x', '✘': 'x', '★': '*', '☆': '*',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '∞': 'inf',
  '−': '-', '‒': '-', '―': '—', '\u200B': '', '\u00A0': ' ',
}

// Extras de WinAnsi (CP1252) fuera de Latin-1 que las fuentes estándar sí traen.
const WINANSI_EXTRA = new Set(['€', '–', '—', '‘', '’', '“', '”', '•', '…', '‹', '›', '™'])

function toWinAnsi(text: string): string {
  let out = text
  for (const [from, to] of Object.entries(CHAR_MAP)) out = out.split(from).join(to)
  // Emojis y pictogramas fuera (junto con su selector de variante / ZWJ).
  out = out.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
  // Caracter a caracter: Latin-1 pasa tal cual; el resto intenta descomponerse
  // a su base Latin-1 (s con caron -> s) y si no la tiene, se omite.
  let res = ''
  for (const ch of out) {
    if ((ch.codePointAt(0) as number) <= 0xff || WINANSI_EXTRA.has(ch)) { res += ch; continue }
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    if (base && (base.codePointAt(0) as number) <= 0xff) res += base
  }
  return res
}

function sanitizeFilename(title: string): string {
  const clean = title
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita acentos
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return `Daya_Informe_${clean || 'Conversacion'}.pdf`
}

// ---- Motor de renderizado ----------------------------------

class PdfRenderer {
  private doc: jsPDF
  private t: LayoutTheme
  private y: number
  private readonly contentWidth: number

  constructor(theme: LayoutTheme) {
    this.t = theme
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    this.y = theme.contentTop
    this.contentWidth = theme.pageWidth - theme.marginX * 2
  }

  private newPage(): void {
    this.doc.addPage()
    this.y = this.t.contentTop
  }

  // Reserva una línea: si no cabe, salta de página. Devuelve la baseline.
  private nextBaseline(lineHeight: number): number {
    if (this.y + lineHeight > this.t.contentBottom) this.newPage()
    this.y += lineHeight
    return this.y
  }

  private gap(mm: number): void {
    this.y += mm
  }

  private setRunFont(run: InlineRun, size: number): void {
    const family = run.code ? this.t.fontMono : this.t.fontBody
    const style = run.bold && run.italic ? 'bolditalic' : run.bold ? 'bold' : run.italic ? 'italic' : 'normal'
    this.doc.setFont(family, style)
    this.doc.setFontSize(size)
  }

  private colorFor(run: InlineRun): RGB {
    if (run.link) return this.t.colors.accent
    if (run.code) return this.t.colors.codeText
    return this.baseColor
  }

  private baseColor: RGB = [26, 29, 35]

  // Renderiza texto con formato en línea, con ajuste de línea y paginación.
  private drawRich(runs: InlineRun[], x: number, maxWidth: number, style: TextStyle): void {
    this.baseColor = style.color
    // Expande a "palabras" conservando espacios, y parte palabras demasiado largas.
    const words: InlineRun[] = []
    for (const run of runs) {
      const segs = run.text.split(/(\s+)/)
      for (const s of segs) {
        if (s === '') continue
        this.setRunFont(run, style.size)
        if (!/^\s+$/.test(s) && this.doc.getTextWidth(s) > maxWidth) {
          for (const piece of this.doc.splitTextToSize(s, maxWidth) as string[]) {
            words.push({ ...run, text: piece })
          }
        } else {
          words.push({ ...run, text: s })
        }
      }
    }

    let line: { run: InlineRun; w: number }[] = []
    let lineW = 0

    const flush = () => {
      if (!line.length) return
      const baseline = this.nextBaseline(style.lineHeight)
      let cx = x
      for (const seg of line) {
        this.setRunFont(seg.run, style.size)
        const [r, g, b] = this.colorFor(seg.run)
        this.doc.setTextColor(r, g, b)
        this.doc.text(seg.run.text, cx, baseline)
        cx += seg.w
      }
      line = []
      lineW = 0
    }

    for (const w of words) {
      const isSpace = /^\s+$/.test(w.text)
      if (isSpace && line.length === 0) continue // sin espacio al inicio de línea
      this.setRunFont(w, style.size)
      const ww = this.doc.getTextWidth(w.text)
      if (!isSpace && line.length && lineW + ww > maxWidth) flush()
      line.push({ run: w, w: ww })
      lineW += ww
    }
    flush()
  }

  private drawHeading(level: 1 | 2 | 3, text: string): void {
    const size = level === 1 ? this.t.sizes.h1 : level === 2 ? this.t.sizes.h2 : this.t.sizes.h3
    this.gap(level === 1 ? 3 : 2.5)
    this.drawRich(tokenizeInline(text), this.t.marginX, this.contentWidth, {
      size,
      color: this.t.colors.text,
      lineHeight: ptToMm(size) * this.t.leading.heading,
    })
    this.gap(1.5)
  }

  private drawParagraph(text: string): void {
    this.drawRich(tokenizeInline(text), this.t.marginX, this.contentWidth, {
      size: this.t.sizes.body,
      color: this.t.colors.text,
      lineHeight: ptToMm(this.t.sizes.body) * this.t.leading.body,
    })
    this.gap(2)
  }

  private drawList(ordered: boolean, items: { text: string; indent: number }[]): void {
    const lh = ptToMm(this.t.sizes.body) * this.t.leading.body
    items.forEach((item, idx) => {
      const indentMm = 4 + item.indent * 6
      const bullet = ordered ? `${idx + 1}.` : '•'
      // Marca de viñeta en su propia baseline (compartida con la 1ª línea del texto).
      const baseline = this.nextBaseline(lh)
      this.doc.setFont(this.t.fontBody, 'normal')
      this.doc.setFontSize(this.t.sizes.body)
      const [r, g, b] = this.t.colors.muted
      this.doc.setTextColor(r, g, b)
      this.doc.text(bullet, this.t.marginX + indentMm - 4, baseline)
      // El texto se dibuja retrocediendo una línea (la baseline ya la consumió el bullet).
      this.y -= lh
      this.drawRich(tokenizeInline(item.text), this.t.marginX + indentMm, this.contentWidth - indentMm, {
        size: this.t.sizes.body,
        color: this.t.colors.text,
        lineHeight: lh,
      })
    })
    this.gap(2)
  }

  private drawQuote(text: string): void {
    const lh = ptToMm(this.t.sizes.body) * this.t.leading.body
    const indent = 6
    const yStart = this.y
    this.drawRich(tokenizeInline(text), this.t.marginX + indent, this.contentWidth - indent, {
      size: this.t.sizes.body,
      color: this.t.colors.muted,
      lineHeight: lh,
    })
    // Barra vertical de la cita (si abarca varias páginas, se dibuja el tramo visible).
    const [r, g, b] = this.t.colors.quoteBar
    this.doc.setFillColor(r, g, b)
    const barTop = Math.max(yStart, this.t.contentTop)
    if (this.y > barTop) this.doc.rect(this.t.marginX, barTop, 1, this.y - barTop, 'F')
    this.gap(2.5)
  }

  private drawCode(code: string): void {
    const size = this.t.sizes.code
    const lh = ptToMm(size) * this.t.leading.code
    const padX = 3
    const padY = 2.2
    this.doc.setFont(this.t.fontMono, 'normal')
    this.doc.setFontSize(size)
    // Ajusta cada línea al ancho disponible (respeta indentación monoespaciada).
    const rawLines = code.replace(/\n$/, '').split('\n')
    const wrapped: string[] = []
    for (const rl of rawLines) {
      const pieces = this.doc.splitTextToSize(rl === '' ? ' ' : rl, this.contentWidth - padX * 2) as string[]
      wrapped.push(...(pieces.length ? pieces : ['']))
    }
    this.gap(1.5)
    // Control de huérfanas: si no caben al menos 3 líneas (o el bloque entero si
    // es más corto) antes del corte, el bloque empieza en la página siguiente.
    const minLines = Math.min(3, wrapped.length)
    if (this.y + padY + minLines * lh > this.t.contentBottom) this.newPage()
    // Padding superior del bloque.
    this.paintCodeBand(padY)
    wrapped.forEach(cl => {
      if (this.y + lh > this.t.contentBottom) {
        this.newPage()
        this.paintCodeBand(padY) // continúa el fondo en la página nueva
      }
      // Fondo de la línea.
      const [br, bg, bb] = this.t.colors.codeBg
      this.doc.setFillColor(br, bg, bb)
      this.doc.rect(this.t.marginX, this.y, this.contentWidth, lh, 'F')
      this.y += lh
      const [cr, cg, cb] = this.t.colors.codeText
      this.doc.setTextColor(cr, cg, cb)
      this.doc.setFont(this.t.fontMono, 'normal')
      this.doc.setFontSize(size)
      this.doc.text(cl, this.t.marginX + padX, this.y - lh * 0.28)
    })
    this.paintCodeBand(padY) // padding inferior
    this.gap(2.5)
  }

  // Pinta una banda de fondo de código (para el padding superior/inferior).
  private paintCodeBand(h: number): void {
    if (this.y + h > this.t.contentBottom) return
    const [br, bg, bb] = this.t.colors.codeBg
    this.doc.setFillColor(br, bg, bb)
    this.doc.rect(this.t.marginX, this.y, this.contentWidth, h, 'F')
    this.y += h
  }

  private drawHr(): void {
    this.gap(2.5)
    const baseline = this.nextBaseline(1)
    const [r, g, b] = this.t.colors.rule
    this.doc.setDrawColor(r, g, b)
    this.doc.setLineWidth(0.2)
    this.doc.line(this.t.marginX, baseline, this.t.pageWidth - this.t.marginX, baseline)
    this.gap(2.5)
  }

  private drawTable(header: string[], rows: string[][]): void {
    const cols = header.length
    if (cols === 0) return
    const colW = this.contentWidth / cols
    const size = this.t.sizes.small
    const lh = ptToMm(size) * 1.4
    const padY = 1.6

    const drawRow = (cells: string[], bold: boolean) => {
      // Pre-calcula el número de líneas de cada celda para la altura de fila.
      this.doc.setFont(this.t.fontBody, bold ? 'bold' : 'normal')
      this.doc.setFontSize(size)
      const wrapped = cells.map(c => this.doc.splitTextToSize(c || ' ', colW - 4) as string[])
      const rowLines = Math.max(1, ...wrapped.map(w => w.length))
      const rowH = rowLines * lh + padY * 2
      if (this.y + rowH > this.t.contentBottom) this.newPage()
      const top = this.y
      const [tr, tg, tb] = this.t.colors.text
      this.doc.setTextColor(tr, tg, tb)
      wrapped.forEach((cellLines, ci) => {
        this.doc.setFont(this.t.fontBody, bold ? 'bold' : 'normal')
        this.doc.setFontSize(size)
        cellLines.forEach((cl, li) => {
          this.doc.text(cl, this.t.marginX + ci * colW + 2, top + padY + (li + 1) * lh - lh * 0.25)
        })
      })
      this.y = top + rowH
      const [rr, rg, rb] = this.t.colors.rule
      this.doc.setDrawColor(rr, rg, rb)
      this.doc.setLineWidth(bold ? 0.35 : 0.15)
      this.doc.line(this.t.marginX, this.y, this.t.pageWidth - this.t.marginX, this.y)
    }

    this.gap(1.5)
    drawRow(header, true)
    rows.forEach(r => drawRow(r, false))
    this.gap(3)
  }

  private drawBlock(block: Block): void {
    switch (block.type) {
      case 'heading': this.drawHeading(block.level, block.text); break
      case 'para': this.drawParagraph(block.text); break
      case 'list': this.drawList(block.ordered, block.items); break
      case 'quote': this.drawQuote(block.text); break
      case 'code': this.drawCode(block.code); break
      case 'hr': this.drawHr(); break
      case 'table': this.drawTable(block.header, block.rows); break
    }
  }

  // Etiqueta de rol (versalitas de color) sobre cada mensaje.
  private drawRoleLabel(label: string, color: RGB): void {
    const baseline = this.nextBaseline(ptToMm(this.t.sizes.label) * 1.6)
    this.doc.setFont(this.t.fontBody, 'bold')
    this.doc.setFontSize(this.t.sizes.label)
    const [r, g, b] = color
    this.doc.setTextColor(r, g, b)
    this.doc.text(label.toUpperCase(), this.t.marginX, baseline, { charSpace: 0.4 })
    this.gap(1)
  }

  // Portada mínima (solo en la página 1): título inteligente + subtítulo.
  private drawDocumentTitle(title: string, subtitle: string): void {
    this.gap(2)
    this.drawRich(tokenizeInline(title), this.t.marginX, this.contentWidth, {
      size: this.t.sizes.h1,
      color: this.t.colors.text,
      lineHeight: ptToMm(this.t.sizes.h1) * this.t.leading.heading,
    })
    this.gap(0.5)
    const baseline = this.nextBaseline(ptToMm(this.t.sizes.small) * 1.5)
    this.doc.setFont(this.t.fontBody, 'normal')
    this.doc.setFontSize(this.t.sizes.small)
    const [r, g, b] = this.t.colors.muted
    this.doc.setTextColor(r, g, b)
    this.doc.text(subtitle, this.t.marginX, baseline)
    this.drawHr()
  }

  // Encabezado de marca + pie con "Página X de Y" en TODAS las hojas.
  // Se dibuja al final, cuando ya se conoce el total de páginas.
  private paintChromeAllPages(dateStr: string): void {
    const total = this.doc.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p)

      // --- Encabezado: logotipo tipográfico "Daya" + fecha a la derecha ---
      this.doc.setFont(this.t.fontBody, 'bold')
      this.doc.setFontSize(10.5)
      const [tr, tg, tb] = this.t.colors.text
      this.doc.setTextColor(tr, tg, tb)
      this.doc.text('Daya', this.t.marginX, 13)
      const wordW = this.doc.getTextWidth('Daya')
      this.doc.setFont(this.t.fontBody, 'normal')
      this.doc.setFontSize(8.5)
      const [mr, mg, mb] = this.t.colors.faint
      this.doc.setTextColor(mr, mg, mb)
      this.doc.text('· Asistente de IA', this.t.marginX + wordW + 1.5, 13)
      this.doc.text(dateStr, this.t.pageWidth - this.t.marginX, 13, { align: 'right' })

      const [rr, rg, rb] = this.t.colors.rule
      this.doc.setDrawColor(rr, rg, rb)
      this.doc.setLineWidth(0.2)
      this.doc.line(this.t.marginX, 16, this.t.pageWidth - this.t.marginX, 16)

      // --- Pie: marca + "Página X de Y" ---
      this.doc.setDrawColor(rr, rg, rb)
      this.doc.line(this.t.marginX, this.t.pageHeight - 14, this.t.pageWidth - this.t.marginX, this.t.pageHeight - 14)
      this.doc.setFont(this.t.fontBody, 'normal')
      this.doc.setFontSize(this.t.sizes.footer)
      this.doc.setTextColor(mr, mg, mb)
      this.doc.text('Generado con Daya AI', this.t.marginX, this.t.pageHeight - 9)
      this.doc.text(`Página ${p} de ${total}`, this.t.pageWidth - this.t.marginX, this.t.pageHeight - 9, { align: 'right' })
    }
  }

  render(opts: PdfExportOptions): jsPDF {
    const date = opts.generatedAt || new Date()
    const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    const userLabel = opts.userLabel?.trim() || 'Tú'

    const msgs = opts.messages.filter(m => m.content && !m.content.startsWith('__'))

    this.drawDocumentTitle(toWinAnsi(opts.title || 'Conversación'), `Informe de conversación · ${dateStr}`)

    msgs.forEach((m, idx) => {
      if (idx > 0) this.gap(3)
      this.drawRoleLabel(m.role === 'user' ? toWinAnsi(userLabel) : 'Daya', m.role === 'user' ? this.t.colors.accent : this.t.colors.text)
      for (const block of parseBlocks(toWinAnsi(m.content))) this.drawBlock(block)
    })

    this.paintChromeAllPages(dateStr)
    return this.doc
  }
}

// ---- API pública -------------------------------------------

/** Renderiza la conversación y devuelve el documento jsPDF (testeable sin navegador). */
export function renderChatPdf(opts: PdfExportOptions): jsPDF {
  return new PdfRenderer(buildTheme()).render(opts)
}

/**
 * Genera y descarga un PDF editorial de la conversación.
 * No bloquea la UI: envuelve el trabajo en una microtarea asíncrona.
 */
export async function exportChatToPdf(opts: PdfExportOptions): Promise<void> {
  // Cede el hilo para que el micro-estado de carga se pinte antes del trabajo pesado.
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  renderChatPdf(opts).save(sanitizeFilename(opts.title))
}
