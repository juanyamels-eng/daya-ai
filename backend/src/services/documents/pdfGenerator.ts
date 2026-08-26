import { generateDocumentContent, generateImageQueries, GenerateRequest } from './documentService'
import { DESIGN } from './designSystem'
import { findImageCandidates, fetchAsDataUri } from './imageService'

// ============================================
// GENERADOR DE PDF / DOCUMENTO EJECUTIVO
// Formato ejecutivo · ritmo vertical · divisores · callouts · imágenes
// ============================================

export async function generatePDF(req: GenerateRequest): Promise<Buffer> {
  const docData = await generateDocumentContent(req)
  const html = await buildIllustratedHTML(docData.title, docData.content, docData.sections, req.prompt || docData.title)
  return Buffer.from(html, 'utf-8')
}

// Busca portada + imágenes de sección y devuelve el HTML ya ilustrado.
// La usa la ruta de documentos para el PDF (y el preview de Word).
export async function buildIllustratedHTML(
  title: string,
  content: string,
  sections: { heading: string; body: string }[],
  topic: string,
  branded: boolean = true,
  style: string = 'ejecutivo'
): Promise<string> {
  const cleanTopic = (topic || title)
    .replace(/\b(hazme|haz|cr[eé]a(?:me)?|gen[eé]ra(?:me)?|escr[ií]be(?:me)?|dame|necesito|quiero|elabora|prepara|redacta|arma)\b/gi, ' ')
    .replace(/\b(un|una|unos|unas|el|la|los|las)\b/gi, ' ')
    .replace(/\b(pdf|documento|informe|reporte|word|powerpoint|presentaci[oó]n|archivo|sobre|acerca|de|del)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || title.slice(0, 50)

  // Títulos de sección (## ...) del contenido markdown
  const headings = (content.match(/^##\s+(.+)$/gm) || [])
    .map(h => h.replace(/^##\s+/, '').trim())
    .slice(0, 4) // máximo 4 imágenes de sección, para no inflar el PDF

  // La IA genera búsquedas PROFESIONALES en inglés según el contexto real
  // (ej. doc médico sobre "corazón" → "human heart anatomy", no corazones de amor)
  const smartQueries: { cover: string; sections: Record<string, string> } =
    await generateImageQueries(topic || title, headings).catch(() => ({ cover: '', sections: {} as Record<string, string> }))

  // Dedup: cada imagen se usa UNA sola vez. De las candidatas de cada búsqueda
  // elegimos la primera NO usada → cada sección tiene una foto DISTINTA.
  const used = new Set<string>()
  const pickEmbedded = async (query: string): Promise<string | null> => {
    const candidates = await findImageCandidates(query).catch(() => [])
    for (const url of candidates) {
      if (used.has(url)) continue
      const data = await fetchAsDataUri(url)
      if (data) { used.add(url); return data }
    }
    return null
  }

  // Portada: query inteligente de la IA, o el tema limpio como respaldo
  const coverImage = await pickEmbedded(smartQueries.cover || cleanTopic)
  const sectionImages = new Map<string, string>()

  // Títulos estructurales genéricos: sin query inteligente usamos solo el tema.
  const genericHeading = /^(introducci[oó]n|conclusi[oó]n|conclusiones|resumen|resumen ejecutivo|antecedentes|contexto|desarrollo|objetivos?|metodolog[ií]a|recomendaciones|an[aá]lisis|discusi[oó]n|resultados|bibliograf[ií]a|referencias|anexos?)$/i

  for (const h of headings) {
    const smart = smartQueries.sections?.[h]
    const isGeneric = genericHeading.test(h.trim())
    const query = smart || (isGeneric ? cleanTopic : `${cleanTopic} ${h}`)
    const img = await pickEmbedded(query)
    if (img) sectionImages.set(h, img)
  }

  return buildProfessionalHTML(title, content, sections, coverImage, sectionImages, branded, style)
}

export function buildProfessionalHTML(
  title: string,
  content: string,
  sections: { heading: string; body: string }[],
  coverImage?: string | null,
  sectionImages?: Map<string, string>,
  branded: boolean = true,
  style: string = 'ejecutivo'
): string {
  const today = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })

  // ===== PLANTILLAS: cada una cambia fuentes, color de acento y detalles =====
  type Theme = {
    bodyFont: string; headingFont: string; accent: string; ink: string;
    align: string; dropCap: boolean; numbers: boolean; underline: boolean; bar: boolean; veil: string;
    bg: string; txt: string; txtSoft: string; heading: string; rule: string; surface: string;
  }
  const sans = DESIGN.font.sans
  const serif = "Georgia, 'Times New Roman', serif"
  const mk = (o: Partial<Theme> & { accent: string; ink: string }): Theme => ({
    bodyFont: sans, headingFont: sans, align: 'justify',
    dropCap: false, numbers: false, underline: false, bar: false,
    veil: `linear-gradient(180deg, rgba(15,15,20,0.15) 0%, rgba(15,15,20,0.45) 55%, ${o.ink}E6 100%)`,
    // Colores de página/texto (por defecto: fondo blanco, texto grafito).
    // Los temas oscuros sobrescriben bg/txt/txtSoft/heading.
    bg: DESIGN.color.white,
    txt: DESIGN.color.graphite,
    txtSoft: DESIGN.color.slate,
    heading: o.ink,
    rule: DESIGN.color.line,
    surface: DESIGN.color.surface,
    ...o,
  })
  // Helper para temas de FONDO OSCURO (negro/noche): invierte página y texto.
  const dark = (o: Partial<Theme> & { accent: string; bg?: string }): Theme => mk({
    ink: o.bg && o.bg.toLowerCase() === '#ffffff' ? '#0a0a0c' : '#f5f5f7',
    bg: '#0e0e11',
    txt: '#d4d4d8',
    txtSoft: '#a1a1aa',
    heading: '#fafafa',
    rule: '#27272a',
    surface: '#1a1a1e',
    veil: `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.92) 100%)`,
    ...o,
  })
  const themes: Record<string, Theme> = {
    // 1. Ejecutivo — monocromático, capitular, secciones numeradas
    ejecutivo: mk({ accent: DESIGN.color.charcoal, ink: DESIGN.color.ink, dropCap: true, numbers: true }),
    // 2. Académico — serif clásico, azul marino, formal
    academico: mk({ bodyFont: serif, headingFont: serif, accent: '#1e3a5f', ink: '#16243a', numbers: true }),
    // 3. Moderno — sans aireado, índigo, subrayado de color
    moderno: mk({ accent: '#4f46e5', ink: '#1e1b4b', align: 'left', underline: true }),
    // 4. Minimalista — gris suave, mucho espacio, sin adornos
    minimalista: mk({ accent: '#6b7280', ink: '#111827', align: 'left' }),
    // 5. Corporativo Azul — azul confianza, barra lateral en títulos
    corporativo: mk({ accent: '#1d4ed8', ink: '#172554', numbers: true, bar: true }),
    // 6. Esmeralda — verde naturaleza/eco, subrayado
    esmeralda: mk({ accent: '#059669', ink: '#064e3b', align: 'left', underline: true }),
    // 7. Editorial — serif tipo revista, terracota, capitular
    editorial: mk({ bodyFont: serif, headingFont: serif, accent: '#c2410c', ink: '#431407', dropCap: true }),
    // 8. Tech — acento cian, barra lateral, estilo producto
    tech: mk({ accent: '#0891b2', ink: '#0e2a33', align: 'left', bar: true }),
    // 9. Elegante — dorado sobre tinta, lujo, capitular
    elegante: mk({ accent: '#a16207', ink: '#1c1917', dropCap: true, numbers: true }),
    // 10. Cálido — ámbar/coral, cercano, subrayado
    calido: mk({ accent: '#ea580c', ink: '#7c2d12', align: 'left', underline: true }),

    // ───── FONDO BLANCO / NEGRO (lo que pediste) ─────
    // 11. Blanco — fondo blanco puro, súper limpio, tinta negra
    blanco: mk({ accent: '#111111', ink: '#0a0a0a', align: 'left', bg: '#ffffff', txt: '#1a1a1a', heading: '#000000' }),
    // 12. Negro / Noche — fondo NEGRO, texto claro, acento plateado
    negro: dark({ accent: '#e5e5e5' }),
    noche: dark({ accent: '#818cf8' }),            // negro con acento índigo
    // ───── MÁS VARIEDAD ─────
    // 13. Rubí — fondo claro, acento granate, formal cálido
    rubi: mk({ accent: '#be123c', ink: '#4c0519', numbers: true }),
    // 14. Océano — azul profundo, fresco, barra lateral
    oceano: mk({ accent: '#0369a1', ink: '#082f49', align: 'left', bar: true }),
    // 15. Violeta — creativo, morado, subrayado
    violeta: mk({ accent: '#7c3aed', ink: '#2e1065', align: 'left', underline: true }),
    // 16. Bosque — verde oscuro serio, serif
    bosque: mk({ bodyFont: serif, headingFont: serif, accent: '#15803d', ink: '#14532d', dropCap: true }),
    // 17. Slate — gris pizarra moderno, sobrio
    slate: mk({ accent: '#475569', ink: '#0f172a', align: 'left' }),
    // 18. Medianoche — azul casi negro de fondo, acento cian
    medianoche: dark({ accent: '#22d3ee', bg: '#0b1220', surface: '#13203a', rule: '#1e3a5f' }),
    // 19. Carbón — gris muy oscuro de fondo, acento ámbar
    carbon: dark({ accent: '#fbbf24', bg: '#161616', surface: '#222', rule: '#333' }),
    // 20. Coral — fresco y amigable, rosa coral
    coral: mk({ accent: '#e11d48', ink: '#4c0519', align: 'left', underline: true }),
  }
  const t = themes[style] || themes.ejecutivo

  // Portada: si hay imagen, página completa con título sobre la foto.
  // Marca solo en plan gratuito. En planes de pago el documento es "limpio" (white-label).
  const brandLine = branded ? `${DESIGN.brand.name} · ${DESIGN.brand.org}` : ''
  const eyebrowLight = branded ? `<div class="eyebrow eyebrow--light">${brandLine}</div>` : ''
  const eyebrowDark = branded ? `<div class="eyebrow">${brandLine}</div>` : ''

  // Si no, portada tipográfica limpia con banda de acento.
  const coverPage = coverImage
    ? `<section class="cover cover--media">
        <img class="cover__img" src="${coverImage}" alt="" />
        <div class="cover__veil"></div>
        <div class="cover__content">
          ${eyebrowLight}
          <h1 class="cover__title">${title}</h1>
          <div class="cover__date">Informe · ${today}</div>
        </div>
      </section>`
    : `<section class="cover cover--plain">
        ${eyebrowDark}
        <h1 class="cover__title">${title}</h1>
        <div class="cover__date">Informe · ${today}</div>
        <div class="cover__rule"></div>
      </section>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 2.4cm 2.2cm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ${t.bodyFont};
    color: ${t.txt};
    background: ${t.bg};
    line-height: 1.7;
    font-size: ${DESIGN.size.body}px;
    -webkit-font-smoothing: antialiased;
  }

  /* ===== PORTADA ===== */
  .cover { position: relative; page-break-after: always; }
  .cover--media { height: 24cm; border-radius: 16px; overflow: hidden; }
  .cover__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .cover__veil { position: absolute; inset: 0; background: ${t.veil}; }
  .cover__content { position: absolute; left: 0; right: 0; bottom: 0; padding: 44px; }
  .cover__title { font-family: ${t.headingFont}; }
  .cover--media .cover__title { color: #fff; font-size: 40px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; margin: 14px 0 16px; max-width: 90%; }
  .cover--media .cover__date { color: rgba(255,255,255,0.85); font-size: 13px; letter-spacing: 0.04em; }

  .cover--plain { padding: 5cm 0 0; }
  .cover--plain .cover__title { font-size: 44px; font-weight: 800; line-height: 1.1; letter-spacing: -0.025em; color: ${t.heading}; margin: 16px 0 18px; max-width: 16cm; }
  .cover--plain .cover__date { font-size: 14px; color: ${t.txtSoft}; letter-spacing: 0.04em; }
  .cover__rule { width: 72px; height: 4px; background: ${t.accent}; border-radius: 2px; margin-top: 28px; }

  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: ${t.accent}; font-family: ${DESIGN.font.sans}; }
  .eyebrow--light { color: rgba(255,255,255,0.92); }

  /* ===== CUERPO ===== */
  .doc-body { max-width: 100%; counter-reset: sec; }

  h2 {
    counter-increment: sec;
    font-family: ${t.headingFont};
    font-size: ${DESIGN.size.h2}px; font-weight: 750; color: ${t.heading};
    letter-spacing: -0.015em; line-height: 1.25;
    margin: 34px 0 14px; padding-top: 6px;
    ${t.bar ? `padding-left: 16px; border-left: 4px solid ${t.accent}; padding-top: 2px;` : ''}
    break-after: avoid; page-break-after: avoid;
  }
  ${t.numbers && !t.bar ? `h2::before {
    content: counter(sec, decimal-leading-zero);
    display: block; font-size: 12px; font-weight: 800; letter-spacing: 0.12em;
    color: ${t.accent}; margin-bottom: 6px;
  }` : ''}
  ${t.underline ? `h2::after {
    content: ''; display: block; width: 52px; height: 3px; background: ${t.accent};
    border-radius: 2px; margin-top: 10px;
  }` : ''}
  h3 {
    font-family: ${t.headingFont};
    font-size: ${DESIGN.size.h3}px; font-weight: 700; color: ${t.heading};
    letter-spacing: -0.01em; margin: 22px 0 8px;
    break-after: avoid; page-break-after: avoid;
  }
  p { margin-bottom: 14px; color: ${t.txt}; orphans: 3; widows: 3; text-align: ${t.align}; }
  ${t.dropCap ? `.doc-body > p:first-of-type::first-letter {
    float: left; font-size: 54px; line-height: 0.82; font-weight: 800;
    color: ${t.heading}; padding: 6px 10px 0 0; font-family: ${t.headingFont};
  }` : ''}
  strong { color: ${t.heading}; font-weight: 700; }
  em { color: ${t.txtSoft}; font-style: italic; }
  ul, ol { padding-left: 22px; margin: 4px 0 16px; }
  li { margin-bottom: 7px; color: ${t.txt}; }
  li::marker { color: ${t.accent}; }

  .section-img { margin: 16px 0 22px; break-inside: avoid; }
  .section-img img { width: 100%; height: 210px; object-fit: cover; border-radius: 12px; display: block; background: ${t.surface}; box-shadow: 0 1px 3px rgba(15,15,20,0.10), 0 8px 24px rgba(15,15,20,0.06); }

  table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13.5px; break-inside: avoid; }
  th { background: ${t.accent}; color: ${t.bg === '#ffffff' || t.bg === DESIGN.color.white ? '#fff' : '#0a0a0c'}; padding: 11px 15px; text-align: left; font-size: 12.5px; font-weight: 650; letter-spacing: 0.02em; }
  td { padding: 10px 15px; border-bottom: 1px solid ${t.rule}; color: ${t.txt}; }
  tr:nth-child(even) td { background: ${t.surface}; }

  blockquote {
    border-left: 3px solid ${t.accent};
    background: ${t.surface};
    padding: 14px 22px; margin: 20px 0; border-radius: 0 10px 10px 0;
    color: ${t.txtSoft}; font-size: 15px; break-inside: avoid;
  }
  code { background: ${t.surface}; padding: 2px 6px; border-radius: 4px; font-family: ${DESIGN.font.mono}; font-size: 0.85em; color: ${t.heading}; }
  pre { background: ${DESIGN.color.ink}; color: #E4E4E7; padding: 16px 20px; border-radius: 10px; overflow-x: auto; margin: 16px 0; font-size: 12.5px; break-inside: avoid; }
  hr { border: none; border-top: 1px solid ${t.rule}; margin: 26px 0; }

  .doc-footer { margin-top: 44px; padding-top: 16px; border-top: 1px solid ${t.rule}; display: flex; justify-content: space-between; font-size: 10.5px; color: ${t.txtSoft}; letter-spacing: 0.06em; text-transform: uppercase; }
  .doc-footer .stamp { font-weight: 700; color: ${t.accent}; }
</style>
</head>
<body>
${coverPage}
<div class="doc-body">
  ${markdownToHTML(content, sectionImages)}
</div>
${branded ? `<div class="doc-footer">
  <span>${DESIGN.brand.name} · Generado el ${today}</span>
  <span class="stamp">${DESIGN.brand.org}</span>
</div>` : `<div class="doc-footer">
  <span>Generado el ${today}</span>
</div>`}
</body>
</html>`
}

function markdownToHTML(markdown: string, sectionImages?: Map<string, string>): string {
  // Procesa por bloques separados por líneas en blanco — evita anidar <p> dentro de <h2>, etc.
  const blocks = markdown.split(/\n{2,}/)
  const html: string[] = []

  const inline = (t: string) => t
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')

  for (const raw of blocks) {
    const block = raw.trim()
    if (!block) continue

    // Encabezado: SOLO la primera línea es el título. Si el modelo pegó el
    // párrafo en la línea siguiente (sin línea en blanco), lo separamos —
    // si no, todo el párrafo se renderiza GIGANTE como parte del título.
    const headingMatch = block.match(/^(#{1,3})\s+(.+?)(?:\n([\s\S]*))?$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const headingText = headingMatch[2].trim()
      const rest = (headingMatch[3] || '').trim()

      if (level === 3) {
        html.push(`<h3>${inline(headingText)}</h3>`)
      } else {
        html.push(`<h2>${inline(headingText)}</h2>`)
        const img = sectionImages?.get(headingText)
        if (img) html.push(`<div class="section-img"><img src="${img}" alt="${headingText}" /></div>`)
      }

      // El resto del bloque (el párrafo pegado) se procesa como texto normal
      if (rest) html.push(`<p>${inline(rest).replace(/\n/g, '<br>')}</p>`)
      continue
    }

    // Cita (callout)
    if (/^>\s+/.test(block)) { html.push(`<blockquote>${inline(block.replace(/^>\s+/, ''))}</blockquote>`); continue }

    // Lista (todas las líneas empiezan con - o número)
    const lines = block.split('\n')
    const isList = lines.every(l => /^\s*([-*]|\d+\.)\s+/.test(l))
    if (isList) {
      const items = lines.map(l => `<li>${inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`).join('')
      const ordered = /^\s*\d+\.\s+/.test(lines[0])
      html.push(ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`)
      continue
    }

    // Párrafo normal (saltos de línea simples → <br>)
    html.push(`<p>${inline(block).replace(/\n/g, '<br>')}</p>`)
  }

  return html.join('\n')
}
