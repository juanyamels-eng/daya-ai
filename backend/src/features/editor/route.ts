// ============================================
// DAYA IA — Feature: Editor con IA ("tú escribes, la IA asiste")
// El usuario escribe; pide a la IA mejorar/reescribir/resumir/expandir/corregir/
// traducir un texto (o una selección). Puede guardar el resultado en su Biblioteca
// (lo que además lo indexa para el RAG). Reusa chatSingle.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { chatSingle } from '../../services/openrouter'
import { getCheapModel } from '../../services/modelCatalog'
import { saveToLibrary } from '../../services/documents/documentService'
import { findImageCandidates } from '../../services/documents/imageService'
import { buildDOCX } from '../../services/documents/docxGenerator'
import { buildPPTX } from '../../services/documents/pptxGenerator'
import { htmlToPDF } from '../../services/documents/pdfRenderer'
import type { SlideData } from '../../services/documents/pptGenerator'

const router = Router()
router.use(requireAuth)

// Instrucciones predefinidas (el frontend manda la clave)
const ACTIONS: Record<string, string> = {
  improve: 'Mejora la redacción del texto: más claro, fluido y profesional, SIN cambiar su significado ni su idioma.',
  rewrite: 'Reescribe el texto con otras palabras manteniendo el mismo significado e idioma.',
  shorten: 'Resume el texto de forma más breve y directa, conservando lo esencial y el idioma.',
  expand: 'Amplía el texto con más detalle y ejemplos relevantes, manteniendo el tono y el idioma.',
  fix: 'Corrige ortografía, gramática y puntuación del texto. Devuelve solo el texto corregido, mismo idioma.',
  formal: 'Reescribe el texto en un tono más formal y profesional, mismo idioma.',
  simple: 'Reescribe el texto en un lenguaje más simple y fácil de entender, mismo idioma.',
}

router.post('/assist', async (req: Request, res: Response) => {
  const { text, action, instruction } = req.body as { text?: string; action?: string; instruction?: string }
  if (!text || !text.trim()) return res.status(400).json({ error: 'No hay texto para procesar.' })

  const directive = instruction?.trim() || ACTIONS[action || 'improve'] || ACTIONS.improve
  const system = `Eres un editor de textos experto. Aplica EXACTAMENTE lo que se pide y devuelve ÚNICAMENTE el texto resultante, sin comentarios, sin comillas y sin explicaciones. Conserva el formato markdown si lo hay.`

  try {
    const result = await chatSingle(
      [{ role: 'user', content: `Instrucción: ${directive}\n\nTexto:\n"""\n${text.slice(0, 8000)}\n"""` }],
      'claude', system, getCheapModel()
    )
    res.json({ result: (result || '').trim() })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo procesar el texto.' })
  }
})

// Genera el contenido COMPLETO de una plantilla a partir de un tema (relleno por IA)
const TEMPLATE_GUIDE: Record<string, string> = {
  informe: 'un INFORME profesional en markdown con: # Título, un resumen ejecutivo, secciones con ## encabezados (Introducción, Desarrollo con datos, Análisis, Conclusiones) y, si aplica, una lista de recomendaciones. Tono formal y claro.',
  carta: 'una CARTA formal en markdown: lugar y fecha, destinatario, saludo, cuerpo de 2-3 párrafos bien redactados, despedida y firma. Usa marcadores como [Tu nombre] donde falten datos.',
  cv: 'un CURRÍCULUM (CV) en markdown con: # Nombre y titular, ## Perfil profesional, ## Experiencia (puestos con viñetas de logros), ## Educación, ## Habilidades y ## Idiomas. Usa marcadores [ ] donde falten datos personales.',
  acta: 'un ACTA de reunión en markdown: # Acta de reunión, fecha/hora/lugar, asistentes, ## Orden del día, ## Desarrollo y acuerdos, ## Tareas asignadas (con responsables) y ## Próxima reunión.',
  ensayo: 'un ENSAYO en markdown con: # Título, introducción con tesis, varios párrafos de desarrollo con argumentos y ejemplos bajo ## subtítulos, y una conclusión. Tono reflexivo y bien estructurado.',
  propuesta: 'una PROPUESTA / proyecto en markdown con: # Título, ## Resumen, ## Problema u oportunidad, ## Solución propuesta, ## Plan y cronograma, ## Presupuesto estimado y ## Beneficios esperados.',
  presentacion: 'el GUION de una PRESENTACIÓN en markdown, una diapositiva por sección usando ## como título de cada diapositiva (8-10 diapositivas): portada, agenda, contexto, puntos clave, datos, ejemplo, conclusiones y cierre. Bajo cada ## pon 3-5 viñetas concisas.',
}
router.post('/generate', async (req: Request, res: Response) => {
  const { template, topic } = req.body as { template?: string; topic?: string }
  if (!topic || !topic.trim()) return res.status(400).json({ error: 'Falta el tema.' })
  const guide = TEMPLATE_GUIDE[(template || 'informe').toLowerCase()] || TEMPLATE_GUIDE.informe
  const system = `Eres un redactor profesional. Generas documentos completos y bien estructurados en español (o el idioma del tema), en formato markdown limpio. Devuelve ÚNICAMENTE el documento, sin comentarios ni explicaciones, sin envolverlo en bloques de código. No inventes datos concretos (cifras, nombres, fechas) que no se den: usa marcadores entre corchetes como [dato] cuando falten.`
  try {
    const result = await chatSingle(
      [{ role: 'user', content: `Crea ${guide}\n\nTema / instrucciones del usuario: "${topic.slice(0, 1500)}"` }],
      'claude', system
    )
    res.json({ text: (result || '').trim() })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo generar el documento.' })
  }
})

// Genera un MAPA / DIAGRAMA en sintaxis Mermaid a partir de un tema
const DIAGRAM_GUIDE: Record<string, string> = {
  mindmap: `un MAPA MENTAL en Mermaid usando "mindmap". Empieza con "mindmap" y luego una raíz con el tema central entre paréntesis dobles, p.ej. root((Tema)). Usa indentación (2 espacios por nivel) para 3-6 ramas principales y sub-ramas. NO uses guiones ni viñetas, solo texto e indentación. Ejemplo:
mindmap
  root((Tema central))
    Rama A
      Sub A1
      Sub A2
    Rama B
      Sub B1`,
  flowchart: `un DIAGRAMA DE FLUJO en Mermaid usando "flowchart TD". Usa nodos con id y texto entre corchetes, y flechas -->. Incluye decisiones con llaves {} cuando aplique. Ejemplo:
flowchart TD
  A[Inicio] --> B{¿Condición?}
  B -->|Sí| C[Acción 1]
  B -->|No| D[Acción 2]`,
  orgchart: `un ORGANIGRAMA jerárquico en Mermaid usando "flowchart TD" con nodos en cajas y flechas de arriba hacia abajo que representen la jerarquía. Ejemplo:
flowchart TD
  CEO[Dirección General] --> A[Área 1]
  CEO --> B[Área 2]
  A --> A1[Equipo A]`,
  timeline: `una LÍNEA DE TIEMPO en Mermaid usando "timeline". Empieza con "timeline", luego "title <título>", y cada periodo como "etiqueta : evento : evento". Ejemplo:
timeline
  title Historia
  2020 : Evento uno
  2021 : Evento dos : Evento tres`,
}
router.post('/diagram', async (req: Request, res: Response) => {
  const { type, topic } = req.body as { type?: string; topic?: string }
  if (!topic || !topic.trim()) return res.status(400).json({ error: 'Falta el tema.' })
  const guide = DIAGRAM_GUIDE[(type || 'mindmap').toLowerCase()] || DIAGRAM_GUIDE.mindmap
  const system = `Eres un experto en visualización de información con Mermaid.js. Generas SIEMPRE código Mermaid VÁLIDO y nada más: sin explicaciones, sin comentarios, sin bloques de código markdown (nada de \`\`\`). Mantén el texto de los nodos corto (sin comas dentro de los corchetes ni caracteres que rompan Mermaid: evita "()", ":", ";", comillas y "&" dentro del texto de los nodos). Responde en el idioma del tema.`
  try {
    let code = await chatSingle(
      [{ role: 'user', content: `Crea ${guide}\n\nTema: "${topic.slice(0, 800)}"` }],
      'claude', system
    )
    code = (code || '').trim().replace(/^```(mermaid)?/i, '').replace(/```$/,'').trim()
    res.json({ code })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo generar el diagrama.' })
  }
})

// Guardar el documento del editor en la Biblioteca (se indexa para el RAG)
router.post('/save', async (req: Request, res: Response) => {
  const { title, content } = req.body as { title?: string; content?: string }
  if (!content || !content.trim()) return res.status(400).json({ error: 'El documento está vacío.' })
  try {
    const fileName = (title?.trim() || 'Documento sin título') + '.md'
    const docId = await saveToLibrary((req as any).userId, fileName, 'word', content, Buffer.byteLength(content, 'utf8'))
    res.status(201).json({ success: true, docId })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo guardar.' })
  }
})

// Buscar imágenes para insertar en el editor (Unsplash/Pexels + respaldo Wikimedia)
router.get('/images', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json({ images: [] })
  try {
    const images = await findImageCandidates(q)
    res.json({ images: (images || []).slice(0, 8) })
  } catch (e: any) {
    res.status(500).json({ error: 'No se pudieron buscar imágenes.', images: [] })
  }
})

export default router

// ============================================
// Exportación del documento del Editor a PDF / Word / PowerPoint
// Convierte el markdown del usuario y reusa los generadores de DAYA.
// ============================================

// ── Markdown → HTML mejorado para PDF ──────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:6px;"/>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#1a1a1a;text-decoration:underline">$1</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:.1em .35em;border-radius:3px;font-family:monospace;font-size:.88em">$1</code>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
}

// Detecta y renderiza tablas markdown (| col | col |)
function mdTable(lines: string[]): string {
  const rows = lines.filter(l => l.includes('|'))
  if (rows.length < 2) return ''
  const parse = (l: string) => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
  const headers = parse(rows[0])
  const body = rows.slice(2) // fila 1 = cabecera, fila 2 = separador, resto = datos
  let html = '<table><thead><tr>' + headers.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
  for (const row of body) {
    if (/^[\s|:-]+$/.test(row)) continue
    html += '<tr>' + parse(row).map((c, i) => i < headers.length ? `<td>${inline(c)}</td>` : '').join('') + '</tr>'
  }
  return html + '</tbody></table>'
}

function mdToHtmlBody(md: string): string {
  const rawLines = (md || '').replace(/\r/g, '').split('\n')
  let html = ''
  let i = 0

  const push = (s: string) => { html += s }

  while (i < rawLines.length) {
    const line = rawLines[i].trimEnd()

    // Bloque de código fenced ```
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < rawLines.length && !/^```/.test(rawLines[i])) {
        codeLines.push(escapeHtml(rawLines[i])); i++
      }
      push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${codeLines.join('\n')}</code></pre>`)
      i++; continue
    }

    // Tabla markdown (detectar bloque de filas con |)
    if (line.includes('|') && rawLines[i + 1]?.includes('--')) {
      const tableLines: string[] = []
      while (i < rawLines.length && rawLines[i].includes('|')) { tableLines.push(rawLines[i]); i++ }
      push(mdTable(tableLines))
      continue
    }

    // Línea horizontal
    if (/^---+$|^\*\*\*+$/.test(line.trim())) { push('<hr/>'); i++; continue }

    // Encabezados
    const hm = line.match(/^(#{1,6})\s+(.+)$/)
    if (hm) {
      const lvl = hm[1].length
      push(`<h${lvl}>${inline(hm[2])}</h${lvl}>`)
      i++; continue
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const bqLines: string[] = []
      while (i < rawLines.length && /^>\s?/.test(rawLines[i])) {
        bqLines.push(rawLines[i].replace(/^>\s?/, '')); i++
      }
      push(`<blockquote>${bqLines.map(l => `<p>${inline(l)}</p>`).join('')}</blockquote>`)
      continue
    }

    // Lista sin orden
    if (/^[-*+]\s+/.test(line)) {
      push('<ul>')
      while (i < rawLines.length && /^[-*+]\s+/.test(rawLines[i])) {
        push(`<li>${inline(rawLines[i].replace(/^[-*+]\s+/, ''))}</li>`); i++
      }
      push('</ul>'); continue
    }

    // Lista ordenada
    if (/^\d+\.\s+/.test(line)) {
      push('<ol>')
      while (i < rawLines.length && /^\d+\.\s+/.test(rawLines[i])) {
        push(`<li>${inline(rawLines[i].replace(/^\d+\.\s+/, ''))}</li>`); i++
      }
      push('</ol>'); continue
    }

    // Línea vacía
    if (!line.trim()) { i++; continue }

    // Párrafo normal
    push(`<p>${inline(line)}</p>`)
    i++
  }

  return html
}

// Genera el HTML completo del PDF con portada profesional
function buildEditorHTML(title: string, body: string): string {
  const today = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })
  const cover = title ? `
    <div class="cover">
      <div class="cover-brand">DAYA AI</div>
      <div class="cover-line"></div>
      <h1 class="cover-title">${escapeHtml(title)}</h1>
      <div class="cover-date">${today}</div>
    </div>
    <div class="page-break"></div>` : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 2.4cm 2.2cm 2.8cm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.72; font-size: 11.5pt; margin: 0; }

  /* Portada */
  .cover { display: flex; flex-direction: column; justify-content: center; min-height: 22cm; padding: 3cm 2cm; }
  .cover-brand { font-size: 9pt; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #71717a; margin-bottom: 2.4cm; }
  .cover-line { width: 3cm; height: 3px; background: #18181b; margin-bottom: 1cm; }
  .cover-title { font-size: 30pt; font-weight: 800; line-height: 1.15; margin: 0 0 1.2cm; color: #0f0f14; letter-spacing: -.03em; }
  .cover-date { font-size: 10pt; color: #71717a; }
  .page-break { page-break-after: always; }

  /* Tipografía */
  h1 { font-size: 20pt; font-weight: 700; margin: 1.6em 0 .5em; color: #0f0f14; border-bottom: 2px solid #18181b; padding-bottom: .2em; page-break-after: avoid; }
  h2 { font-size: 15pt; font-weight: 700; margin: 1.4em 0 .4em; color: #18181b; page-break-after: avoid; }
  h3 { font-size: 12.5pt; font-weight: 700; margin: 1.2em 0 .3em; color: #27272a; page-break-after: avoid; }
  h4,h5,h6 { font-size: 11pt; font-weight: 700; margin: 1em 0 .2em; color: #3f3f46; page-break-after: avoid; }
  p { margin: 0 0 .9em; text-align: justify; orphans: 3; widows: 3; }

  /* Listas */
  ul, ol { margin: .2em 0 .9em 1.4em; }
  li { margin: .3em 0; }
  ul ul, ol ol, ul ol, ol ul { margin-top: .1em; }

  /* Citas */
  blockquote { border-left: 3.5px solid #d4d4d8; margin: .8em 0 .8em 1em; padding: .4em 1em; color: #52525b; font-style: italic; background: #fafafa; border-radius: 0 4px 4px 0; }
  blockquote p { margin: 0; }

  /* Código */
  pre { background: #f5f5f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 14px 18px; overflow-x: auto; font-size: 9pt; line-height: 1.55; margin: .6em 0 1em; }
  pre code { background: none; padding: 0; border-radius: 0; font-family: 'Courier New', monospace; }

  /* Tablas */
  table { width: 100%; border-collapse: collapse; margin: .8em 0 1.2em; font-size: 10.5pt; page-break-inside: avoid; }
  th { background: #18181b; color: #fff; padding: 9px 14px; font-weight: 700; text-align: left; font-size: 10pt; }
  td { padding: 8px 14px; border-bottom: 1px solid #e4e4e7; }
  tr:nth-child(even) td { background: #fafafa; }

  /* Separador */
  hr { border: none; border-top: 1.5px solid #d4d4d8; margin: 1.6em 0; }

  img { max-width: 100%; border-radius: 6px; margin: .6em 0; }
</style>
</head>
<body>
  ${cover}
  ${body}
</body>
</html>`
}

// Markdown -> diapositivas (cada título # o ## inicia una diapositiva)
function mdToSlides(title: string, md: string): SlideData[] {
  const lines = (md || '').replace(/\r/g, '').split('\n')
  const slides: SlideData[] = []
  let current: SlideData | null = null
  let n = 1
  const push = () => { if (current) { slides.push(current); current = null } }
  for (const raw of lines) {
    const line = raw.trim()
    if (/^#{1,3}\s/.test(line)) {
      push()
      current = { slideNumber: ++n, title: line.replace(/^#+\s/, ''), type: 'content', bulletPoints: [], speakerNotes: '', imageQuery: '' }
    } else if (line) {
      if (!current) current = { slideNumber: ++n, title: title || 'Contenido', type: 'content', bulletPoints: [], speakerNotes: '', imageQuery: '' }
      current.bulletPoints.push(line.replace(/^[-*]\s+/, '').replace(/[#*`>]/g, ''))
    }
  }
  push()
  if (!slides.length) slides.push({ slideNumber: 2, title: title || 'Contenido', type: 'content', bulletPoints: [md.slice(0, 200)], speakerNotes: '', imageQuery: '' })
  return slides
}

router.post('/export', async (req: Request, res: Response) => {
  const { title, content, format } = req.body as { title?: string; content?: string; format?: string }
  if (!content || !content.trim()) return res.status(400).json({ error: 'El documento está vacío.' })
  const safeTitle = (title?.trim() || 'documento').replace(/[^\w\sáéíóúñ-]/gi, '').slice(0, 60) || 'documento'
  try {
    let buffer: Buffer
    let contentType: string
    let ext: string
    if (format === 'docx') {
      buffer = await buildDOCX(title?.trim() || 'Documento', content)
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ext = 'docx'
    } else if (format === 'pptx') {
      const slides = mdToSlides(title?.trim() || 'Presentación', content)
      buffer = await buildPPTX(title?.trim() || 'Presentación', '', slides)
      contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ext = 'pptx'
    } else {
      const html = buildEditorHTML(title?.trim() || '', mdToHtmlBody(content))
      buffer = await htmlToPDF(html)
      contentType = 'application/pdf'
      ext = 'pdf'
    }
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.${ext}"`)
    res.send(buffer)
  } catch (e: any) {
    console.error('[editor/export] error:', e?.message || e)
    res.status(500).json({ error: 'No se pudo exportar: ' + (e?.message || 'error') })
  }
})
