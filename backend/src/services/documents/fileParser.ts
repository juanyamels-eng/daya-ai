// ============================================
// DAYA IA — Motor de lectura de archivos
// Extrae texto de PDF, Word, Excel, CSV y TXT
// ============================================

import * as XLSX from 'xlsx'

export interface ParsedFile {
  text: string
  metadata: {
    type: string
    pages?: number
    sheets?: string[]
    rows?: number
    wordCount: number
  }
}

// Lee un PDF y extrae todo su texto
async function parsePDF(buffer: Buffer): Promise<ParsedFile> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  let text = (result.text || '').trim()
  const pages = result.total || (result.pages?.length ?? undefined)

  // Tablas: el texto plano mezcla las columnas en un muro ilegible. pdf-parse detecta
  // las tablas por sus líneas/rectángulos vectoriales y nos las da como filas×celdas;
  // las convertimos a markdown y las añadimos para que el modelo lea la tabla, no un
  // amasijo. Solo con texto (un PDF escaneado no tiene vectores) y acotado por páginas
  // para no disparar el coste. Nunca rompe la extracción: si falla, seguimos con el texto.
  let tablesMd = ''
  if (text && (!pages || pages <= 50)) {
    try {
      const tableResult = await parser.getTable()
      const tables = (tableResult.mergedTables?.length
        ? tableResult.mergedTables
        : (tableResult.pages || []).flatMap((p: any) => p.tables || []))
      tablesMd = tablesToMarkdown(tables)
    } catch (e: any) {
      console.warn('[fileParser] Detección de tablas del PDF falló:', e?.message || e)
    }
  }

  await parser.destroy()

  // PDF sin texto seleccionable (escaneado / foto): en vez de rendirse, intentamos
  // OCR de sus páginas. Si el OCR falla o no hay texto, caemos a un aviso claro.
  if (!text) {
    try {
      const ocr = await ocrScannedPdf(buffer, pages)
      if (ocr && ocr.trim().length > 20) text = ocr.trim()
    } catch (e: any) {
      console.warn('[fileParser] OCR de PDF escaneado falló:', e?.message || e)
    }
  }

  if (tablesMd) text = `${text}\n\n${tablesMd}`.trim()

  const finalText = text || (pages
    ? `[Este PDF de ${pages} ${pages === 1 ? 'página' : 'páginas'} no tiene texto seleccionable y el OCR no logró extraer texto legible.]`
    : text)
  return {
    text: finalText,
    metadata: {
      type: 'pdf',
      pages,
      wordCount: finalText.split(/\s+/).filter(Boolean).length,
    }
  }
}

// OCR de un PDF escaneado: renderiza sus páginas a PNG y les pasa Tesseract (español
// + inglés). Acotado a las primeras páginas para no disparar tiempo/memoria; imports
// perezosos para no pagar el coste (ni cargar el WASM) cuando el PDF sí tiene texto.
async function ocrScannedPdf(buffer: Buffer, totalPages?: number): Promise<string> {
  const MAX_PAGES = 5
  const n = Math.min(totalPages || MAX_PAGES, MAX_PAGES)
  const pageList = Array.from({ length: n }, (_, i) => i + 1)

  const { pdfToPng } = await import('pdf-to-png-converter')
  const pngs = await pdfToPng(buffer, { viewportScale: 2.0, pagesToProcess: pageList })
  if (!pngs?.length) return ''

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa+eng')
  try {
    let out = ''
    for (const p of pngs) {
      if (!p.content) continue
      const { data } = await worker.recognize(p.content)
      const t = (data?.text || '').trim()
      if (t) out += t + '\n\n'
    }
    return out.trim()
  } finally {
    await worker.terminate()
  }
}

// Convierte las tablas detectadas (filas×celdas) a markdown GFM. Descarta las
// degeneradas (menos de 2 filas o 2 columnas, o vacías) y escapa `|`/saltos para no
// romper la sintaxis de tabla. La primera fila se usa como cabecera.
function tablesToMarkdown(tables: string[][][]): string {
  const clean = (c: string) => String(c ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
  const blocks: string[] = []

  for (const table of tables || []) {
    const rows = (table || []).filter(r => Array.isArray(r) && r.some(c => clean(c)))
    if (rows.length < 2) continue
    const cols = Math.max(...rows.map(r => r.length))
    if (cols < 2) continue

    const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => clean(r[i]))
    const header = pad(rows[0])
    const body = rows.slice(1).map(pad)

    const md = [
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...body.map(r => `| ${r.join(' | ')} |`),
    ].join('\n')
    blocks.push(md)
  }

  if (!blocks.length) return ''
  const title = blocks.length === 1 ? '## Tabla detectada' : '## Tablas detectadas'
  return `${title}\n\n${blocks.join('\n\n')}`
}

// Lee un Word (.docx) y extrae el texto CON ESTRUCTURA.
// convertToHtml preserva títulos, listas, negritas y tablas; Turndown lo pasa a
// markdown limpio para que el modelo entienda la estructura, no un muro de texto.
async function parseWord(buffer: Buffer): Promise<ParsedFile> {
  const mammoth = await import('mammoth')
  let text = ''
  try {
    const html = (await mammoth.convertToHtml({ buffer })).value
    const TurndownService = (await import('turndown')).default
    const { gfm } = await import('turndown-plugin-gfm')
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
    td.use(gfm)        // sin esto, las tablas del Word (mammoth las da como <table>) salen aplastadas a texto
    td.remove('img')   // mammoth embebe las imágenes como data-URI base64 gigantes → fuera
    text = td.turndown(normalizeHtmlTables(html || '')).replace(/\n{3,}/g, '\n\n').trim()
  } catch {}
  // Fallback al texto plano de siempre si el markdown falla o queda demasiado corto.
  if (text.length < 20) {
    const raw = await mammoth.extractRawText({ buffer })
    text = raw.value.trim()
  }
  return {
    text,
    metadata: {
      type: 'word',
      wordCount: text.split(/\s+/).filter(Boolean).length,
    }
  }
}

// Normaliza las tablas HTML de mammoth para que el plugin GFM de Turndown las pase a
// markdown limpio. Dos arreglos por tabla: (1) el plugin solo convierte tablas con fila
// de cabecera (`<th>`) y mammoth emite `<td>` → promovemos la primera fila a `<th>`;
// (2) mammoth mete cada celda en `<p>`, y esos párrafos generan saltos de línea que
// romperían la fila markdown (una fila debe ir en una sola línea) → los volvemos inline.
function normalizeHtmlTables(html: string): string {
  return html.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    let t = table.replace(/<tr[\s\S]*?<\/tr>/i, (tr) =>   // solo la PRIMERA fila (sin flag /g)
      tr.replace(/<td(\s[^>]*)?>/gi, '<th$1>').replace(/<\/td>/gi, '</th>')
    )
    t = t.replace(/<\/p>\s*<p[^>]*>/gi, ' ').replace(/<\/?p[^>]*>/gi, '')  // párrafos → inline
    return t
  })
}

// Lee un PowerPoint (.pptx) y extrae el texto de cada diapositiva CON ESTRUCTURA.
// Un .pptx es un zip OOXML: cada diapositiva es `ppt/slides/slideN.xml` y su texto
// vive en elementos `<a:t>`, agrupados en párrafos `<a:p>`. DAYA ya *genera* pptx
// (buildPPTX) pero no podía *leer* los que le subían; esto cierra esa asimetría.
// Sin dependencia nueva: jszip ya viene instalado (lo usa mammoth).
async function parsePptx(buffer: Buffer): Promise<ParsedFile> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)

  const decode = (s: string) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

  // Texto de una diapositiva: un renglón por párrafo `<a:p>`, uniendo sus runs `<a:t>`.
  const slideText = (xml: string): string => {
    const lines: string[] = []
    for (const para of xml.split('</a:p>')) {
      const runs = para.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []
      const line = runs.map(r => decode(r.replace(/<\/?a:t>/g, ''))).join('').trim()
      if (line) lines.push(line)
    }
    return lines.join('\n')
  }

  // Ordena slide1, slide2, … numéricamente (no lexicográficamente: slide10 va tras slide9).
  const slideNames = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (parseInt(a.match(/(\d+)/)![1], 10) - parseInt(b.match(/(\d+)/)![1], 10)))

  const blocks: string[] = []
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.files[slideNames[i]].async('string')
    const t = slideText(xml)
    if (t) blocks.push(`## Diapositiva ${i + 1}\n\n${t}`)
  }

  const text = blocks.join('\n\n').trim()
  const finalText = text || `[Esta presentación de ${slideNames.length} ${slideNames.length === 1 ? 'diapositiva' : 'diapositivas'} no tiene texto legible (posiblemente solo imágenes).]`
  return {
    text: finalText,
    metadata: {
      type: 'powerpoint',
      pages: slideNames.length,
      wordCount: finalText.split(/\s+/).filter(Boolean).length,
    }
  }
}

// Lee un EPUB (libro electrónico) y extrae su texto EN ORDEN DE LECTURA, con estructura.
// Un .epub es un zip: META-INF/container.xml apunta al OPF; el OPF define el manifiesto
// (id→href) y el spine (el orden de lectura de los capítulos). Cada capítulo es un XHTML;
// lo pasamos a markdown con Turndown (igual que en Word) para conservar títulos y listas.
// Sin dependencia nueva: jszip y turndown ya vienen instalados.
async function parseEpub(buffer: Buffer): Promise<ParsedFile> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)

  const readFile = async (path: string): Promise<string> => {
    const f = zip.file(path)
    return f ? await f.async('string') : ''
  }

  // 1) container.xml → ruta del OPF (con fallback: buscar cualquier .opf del zip)
  const container = await readFile('META-INF/container.xml')
  let opfPath = (container.match(/full-path="([^"]+)"/i) || [])[1]
    || Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.opf')) || ''
  const opfDir = opfPath.includes('/') ? opfPath.replace(/\/[^/]*$/, '/') : ''
  const opf = opfPath ? await readFile(opfPath) : ''

  // 2) manifiesto: id → href (relativo al OPF)
  const manifest: Record<string, string> = {}
  for (const m of opf.match(/<item\b[^>]*>/gi) || []) {
    const id = (m.match(/\bid="([^"]+)"/i) || [])[1]
    const href = (m.match(/\bhref="([^"]+)"/i) || [])[1]
    if (id && href) manifest[id] = decodeURIComponent(href)
  }

  // 3) spine: orden de lectura. Sin spine legible, caemos a todos los (x)html del zip
  let hrefs: string[] = []
  const spine = (opf.match(/<spine\b[\s\S]*?<\/spine>/i) || [])[0] || ''
  for (const ref of spine.match(/<itemref\b[^>]*>/gi) || []) {
    const idref = (ref.match(/\bidref="([^"]+)"/i) || [])[1]
    if (idref && manifest[idref]) hrefs.push(opfDir + manifest[idref])
  }
  if (!hrefs.length) {
    hrefs = Object.keys(zip.files).filter(n => /\.x?html?$/i.test(n)).sort()
  }

  // 4) cada capítulo XHTML → markdown, en orden (solo el <body>, sin <head>/estilos)
  const TurndownService = (await import('turndown')).default
  const { gfm } = await import('turndown-plugin-gfm')
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  td.use(gfm)
  td.remove('img')  // las portadas/ilustraciones van embebidas → fuera

  const blocks: string[] = []
  for (const href of hrefs) {
    const xhtml = await readFile(href)
    if (!xhtml) continue
    const body = (xhtml.match(/<body[\s\S]*?<\/body>/i) || [xhtml])[0]
    let md = ''
    try { md = td.turndown(normalizeHtmlTables(body)) } catch { md = body.replace(/<[^>]+>/g, ' ') }
    md = md.replace(/\n{3,}/g, '\n\n').trim()
    if (md) blocks.push(md)
  }

  const text = blocks.join('\n\n').trim()
  const finalText = text || '[Este EPUB no contiene texto legible.]'
  return {
    text: finalText,
    metadata: {
      type: 'epub',
      pages: hrefs.length,
      wordCount: finalText.split(/\s+/).filter(Boolean).length,
    }
  }
}

// Lee un Excel (.xlsx, .xls) y convierte cada hoja a texto
function parseExcel(buffer: Buffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheets: string[] = []
  let allText = ''
  let totalRows = 0

  for (const sheetName of workbook.SheetNames) {
    sheets.push(sheetName)
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    const rows = csv.split('\n').filter(Boolean)
    totalRows += rows.length
    allText += `\n=== Hoja: ${sheetName} ===\n${csv}\n`
  }

  return {
    text: allText.trim(),
    metadata: {
      type: 'excel',
      sheets,
      rows: totalRows,
      wordCount: allText.split(/\s+/).filter(Boolean).length,
    }
  }
}

// Lee CSV directamente
function parseCSV(buffer: Buffer): ParsedFile {
  const text = buffer.toString('utf-8')
  const rows = text.split('\n').filter(Boolean)
  return {
    text: text.trim(),
    metadata: {
      type: 'csv',
      rows: rows.length,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    }
  }
}

// Lee texto plano (.txt, .md, etc.)
function parseText(buffer: Buffer): ParsedFile {
  const text = buffer.toString('utf-8')
  return {
    text: text.trim(),
    metadata: {
      type: 'text',
      wordCount: text.split(/\s+/).filter(Boolean).length,
    }
  }
}

// ============================================
// FUNCIÓN PRINCIPAL — detecta el tipo y extrae
// ============================================
export async function parseFile(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<ParsedFile> {
  const ext = fileName.toLowerCase().split('.').pop() || ''

  try {
    // PDF
    if (ext === 'pdf' || mimeType === 'application/pdf') {
      return await parsePDF(buffer)
    }

    // Word
    if (ext === 'docx' || ext === 'doc' || mimeType?.includes('word') || mimeType?.includes('officedocument.wordprocessing')) {
      return await parseWord(buffer)
    }

    // PowerPoint (.pptx moderno; el .ppt binario antiguo no es OOXML y no se soporta)
    if (ext === 'pptx' || mimeType?.includes('presentationml')) {
      return await parsePptx(buffer)
    }

    // EPUB (libro electrónico) — es un zip OOXML/XHTML, se detecta antes que el texto plano
    if (ext === 'epub' || mimeType === 'application/epub+zip') {
      return await parseEpub(buffer)
    }

    // Excel
    if (ext === 'xlsx' || ext === 'xls' || mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) {
      return parseExcel(buffer)
    }

    // CSV
    if (ext === 'csv' || mimeType === 'text/csv') {
      return parseCSV(buffer)
    }

    // Texto plano y todo lo demás
    return parseText(buffer)

  } catch (error: any) {
    throw new Error(`No se pudo leer el archivo ${fileName}: ${error.message}`)
  }
}

// Lista de tipos soportados (para mostrar al usuario)
export const SUPPORTED_TYPES = {
  pdf:        ['.pdf'],
  word:       ['.docx', '.doc'],
  powerpoint: ['.pptx'],
  excel:      ['.xlsx', '.xls'],
  epub:       ['.epub'],
  csv:   ['.csv'],
  text:  ['.txt', '.md', '.json', '.log'],
}

export function isSupported(fileName: string): boolean {
  const ext = '.' + (fileName.toLowerCase().split('.').pop() || '')
  return Object.values(SUPPORTED_TYPES).flat().includes(ext)
}
