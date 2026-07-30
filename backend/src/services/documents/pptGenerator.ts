import { generateDocumentContent, GenerateRequest } from './documentService'
import { DESIGN, hex } from './designSystem'
import { chatJSON, MODELS } from '../../services/openrouter'

// ============================================
// GENERADOR DE POWERPOINT
// Con búsqueda real de imágenes para cada slide
// ============================================

export interface SlideData {
  slideNumber: number
  title: string
  type: 'cover' | 'agenda' | 'content' | 'data' | 'quote' | 'closing'
  bulletPoints: string[]
  speakerNotes: string
  imageQuery: string
  imageUrl?: string
  backgroundColor?: string
}

export async function generatePresentationData(req: GenerateRequest): Promise<{
  title: string
  subtitle: string
  slides: SlideData[]
  theme: { primary: string; secondary: string; accent: string }
}> {
  const prompt = `Eres un consultor experto que diseña presentaciones de nivel McKinsey/Apple Keynote.
Crea una presentación PROFESIONAL, sustanciosa y bien narrada sobre: "${req.prompt}"
${req.answers && Object.keys(req.answers).length ? `\nPreferencias del usuario (respétalas): ${Object.entries(req.answers).map(([k, v]) => `${k}: ${v}`).join(' · ')}\n` : ''}
REGLAS DE ORO (síguelas todas):
1. Estructura narrativa con arco: portada → agenda → contexto/problema → desarrollo (3-5 slides) → datos/cifras → conclusiones → cierre.
2. Genera entre 9 y 11 slides en total.
3. Cada slide de contenido lleva 3-4 viñetas. CADA viñeta con el formato "Idea clave: explicación breve" (la idea en 2-5 palabras, luego dos puntos y una explicación concreta de 1 línea). Nada de viñetas de una sola palabra ni párrafos largos.
4. Usa datos, cifras y ejemplos CONCRETOS y realistas (invéntalos coherentes si hace falta; NADA de [corchetes]).
5. Incluye AL MENOS un slide type "data" con métricas/porcentajes.
6. speakerNotes: 2-3 frases útiles y naturales para quien expone, no un resumen del slide.
7. imageQuery: en INGLÉS, muy específica y fotográfica para cada slide (no abstracto).
8. Idioma del contenido visible: ${req.language || 'español'}.

Responde SOLO con JSON válido (sin texto extra), con esta forma exacta:
{
  "title": "Título potente y específico (no genérico)",
  "subtitle": "Subtítulo de una línea que enmarca el valor",
  "theme": { "primary": "#4f46e5", "secondary": "#2563eb", "accent": "#10b981" },
  "slides": [
    { "slideNumber": 1, "type": "cover", "title": "Título de portada", "bulletPoints": [], "speakerNotes": "gancho de apertura", "imageQuery": "specific photographic english query" },
    { "slideNumber": 2, "type": "agenda", "title": "Agenda", "bulletPoints": ["Sección 1: qué cubre", "Sección 2: qué cubre", "Sección 3: qué cubre"], "speakerNotes": "...", "imageQuery": "..." },
    { "slideNumber": 3, "type": "content", "title": "Título del tema", "bulletPoints": ["Idea clave: explicación concreta", "Otra idea: dato o ejemplo", "Tercera idea: implicación"], "speakerNotes": "...", "imageQuery": "..." },
    { "slideNumber": 4, "type": "data", "title": "Cifras que importan", "bulletPoints": ["Métrica 1: 42% de mejora interanual", "Métrica 2: 3.5x más rápido", "Métrica 3: ahorro de $1.2M"], "speakerNotes": "...", "imageQuery": "data charts analytics" },
    { "slideNumber": 9, "type": "closing", "title": "Mensaje de cierre", "bulletPoints": ["Próximo paso accionable"], "speakerNotes": "llamado a la acción", "imageQuery": "..." }
  ]
}`

  // FREE → DeepSeek V4 Pro (barato/bueno). Pago → Kimi K2.6 (el que mejor escribe).
  // Por alias, no por id: así el sanador del catálogo los mantiene vivos.
  const pptModel = (req.plan && !/free/i.test(req.plan)) ? MODELS.writer : MODELS.chat
  const parsed = await chatJSON(prompt, undefined, pptModel)

  // Garantizar estructura mínima
  const slides = Array.isArray(parsed.slides) && parsed.slides.length
    ? parsed.slides
    : [{ slideNumber: 1, type: 'cover', title: parsed.title || req.prompt, bulletPoints: [], speakerNotes: '', imageQuery: req.prompt }]

  // Buscar imágenes reales para cada slide
  const slidesWithImages = await fetchImagesForSlides(slides)

  return {
    title: parsed.title || req.prompt.slice(0, 60),
    subtitle: parsed.subtitle || '',
    theme: parsed.theme || { primary: '#2563eb', secondary: '#1d4ed8', accent: '#3b82f6' },
    slides: slidesWithImages,
  }
}

// Busca imagen real — Unsplash → Pexels → Wikimedia → Picsum
async function fetchImagesForSlides(slides: SlideData[]): Promise<SlideData[]> {
  const slidesWithImages = await Promise.all(
    slides.map(async (slide) => {
      try {
        // 1️⃣ Unsplash — mejor calidad, fotos profesionales
        if (process.env.UNSPLASH_ACCESS_KEY) {
          const query = encodeURIComponent(slide.imageQuery)
          const res = await fetch(
            `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape&content_filter=high`,
            { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }
          )
          const data = await res.json() as any
          const imageUrl = data.results?.[0]?.urls?.regular
          if (imageUrl) {
            console.log(`✅ Unsplash: ${slide.imageQuery} → ${imageUrl.slice(0, 60)}...`)
            return { ...slide, imageUrl }
          }
        }

        // 2️⃣ Pexels — segunda opción, también profesional
        if (process.env.PEXELS_API_KEY) {
          const query = encodeURIComponent(slide.imageQuery)
          const res = await fetch(
            `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=landscape`,
            { headers: { Authorization: process.env.PEXELS_API_KEY } }
          )
          const data = await res.json() as any
          const imageUrl = data.photos?.[0]?.src?.large
          if (imageUrl) {
            console.log(`✅ Pexels: ${slide.imageQuery} → ${imageUrl.slice(0, 60)}...`)
            return { ...slide, imageUrl }
          }
        }

        // 3️⃣ Wikimedia Commons — gratis, sin límites, ideal para temas técnicos/históricos
        const wikiImageUrl = await searchWikimedia(slide.imageQuery)
        if (wikiImageUrl) {
          console.log(`✅ Wikimedia: ${slide.imageQuery} → ${wikiImageUrl.slice(0, 60)}...`)
          return { ...slide, imageUrl: wikiImageUrl }
        }

        // 4️⃣ Picsum — último fallback, siempre funciona
        return {
          ...slide,
          imageUrl: `https://picsum.photos/seed/${encodeURIComponent(slide.imageQuery)}/1200/675`
        }
      } catch {
        return {
          ...slide,
          imageUrl: `https://picsum.photos/seed/${slide.slideNumber}/1200/675`
        }
      }
    })
  )

  return slidesWithImages
}

// Wikimedia Commons API — completamente gratis, sin API key
async function searchWikimedia(query: string): Promise<string | null> {
  try {
    // Busca en Commons por archivos de imagen
    const searchQuery = encodeURIComponent(query)
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${searchQuery}&srnamespace=6&srlimit=5&format=json&origin=*`

    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json() as any
    const results = searchData?.query?.search

    if (!results || results.length === 0) return null

    // Filtra solo imágenes de buena calidad (JPG o PNG)
    const imageResults = results.filter((r: any) =>
      r.title && (r.title.toLowerCase().includes('.jpg') || r.title.toLowerCase().includes('.png'))
    )

    if (imageResults.length === 0) return null

    // Obtiene la URL real de la imagen del primer resultado
    const fileName = encodeURIComponent(imageResults[0].title.replace('File:', ''))
    const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${fileName}&prop=imageinfo&iiprop=url|size&iiurlwidth=1200&format=json&origin=*`

    const infoRes = await fetch(infoUrl)
    const infoData = await infoRes.json() as any
    const pages = infoData?.query?.pages
    if (!pages) return null

    const page = Object.values(pages)[0] as any
    const imageUrl = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url

    // Filtra imágenes demasiado pequeñas
    const width = page?.imageinfo?.[0]?.thumbwidth || 0
    if (width < 400) return null

    return imageUrl || null
  } catch {
    return null
  }
}

// Genera HTML de la presentación completa
export function buildPresentationHTML(
  title: string,
  subtitle: string,
  slides: SlideData[],
  theme: { primary: string; secondary: string; accent: string },
  style: string = 'ejecutivo'
): string {
  // Paleta de la vista previa según el tema elegido (incluye temas OSCUROS)
  const DARK: Record<string, { bg: string; surface: string; text: string; heading: string; soft: string; accent: string }> = {
    negro:      { bg: '#0e0e11', surface: '#1c1c22', text: '#d4d4d8', heading: '#fafafa', soft: '#a1a1aa', accent: '#e5e5e5' },
    noche:      { bg: '#0e0e11', surface: '#1c1c22', text: '#d4d4d8', heading: '#fafafa', soft: '#a1a1aa', accent: '#818cf8' },
    medianoche: { bg: '#0b1220', surface: '#13203a', text: '#cbd5e1', heading: '#f1f5f9', soft: '#94a3b8', accent: '#22d3ee' },
    carbon:     { bg: '#161616', surface: '#222222', text: '#d6d3d1', heading: '#fafaf9', soft: '#a8a29e', accent: '#fbbf24' },
  }
  const ACCENTS: Record<string, string> = {
    ejecutivo: DESIGN.color.charcoal, academico: '#1e3a5f', moderno: '#4f46e5', minimalista: '#6b7280',
    corporativo: '#1d4ed8', esmeralda: '#059669', editorial: '#c2410c', tech: '#0891b2', elegante: '#a16207',
    calido: '#ea580c', blanco: '#111111', rubi: '#be123c', oceano: '#0369a1', violeta: '#7c3aed',
    bosque: '#15803d', slate: '#475569', coral: '#e11d48',
  }
  const dk = DARK[style]
  const C = dk
    ? { bgPage: dk.surface, slideBg: dk.bg, text: dk.text, heading: dk.heading, soft: dk.soft, accent: dk.accent, line: '#2a2a32' }
    : { bgPage: DESIGN.color.surfaceAlt, slideBg: DESIGN.color.white, text: DESIGN.color.graphite, heading: DESIGN.color.ink, soft: DESIGN.color.mist, accent: ACCENTS[style] || DESIGN.color.charcoal, line: DESIGN.color.line }

  const slidesHTML = slides.map((slide, i) => buildSlideHTML(slide, slides.length, i === 0, C)).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${DESIGN.font.sans}; background: ${C.bgPage}; color: ${C.heading}; }
  .presentation { width: 100%; }
  .slide {
    width: 100%; aspect-ratio: 16/9; position: relative; overflow: hidden;
    display: flex; page-break-after: always; min-height: 540px;
    background: ${C.slideBg};
  }
  /* Grilla limpia con márgenes generosos y consistentes */
  .slide-pad { padding: 64px 72px; display: flex; flex-direction: column; justify-content: center; width: 100%; position: relative; z-index: 2; }
  .slide-number { position: absolute; bottom: 28px; right: 36px; font-size: 12px; color: ${C.soft}; z-index: 5; letter-spacing: 0.05em; }
  .brand-stamp { position: absolute; bottom: 28px; left: 36px; font-size: 11px; font-weight: 700; color: ${C.soft}; letter-spacing: 0.12em; text-transform: uppercase; z-index: 5; }
  h1 { font-size: 52px; font-weight: 800; letter-spacing: -0.04em; line-height: 1.05; color: ${C.heading}; }
  h2 { font-size: 34px; font-weight: 750; letter-spacing: -0.03em; line-height: 1.15; color: ${C.heading}; margin-bottom: 28px; }
  .subtitle { font-size: 19px; color: ${C.soft}; font-weight: 400; line-height: 1.5; }
  /* Línea geométrica minimalista */
  .geo-line { width: 64px; height: 4px; background: ${C.accent}; border-radius: 2px; margin: 24px 0; }
  .bullet { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 18px; font-size: 17px; line-height: 1.5; color: ${C.text}; }
  .bullet b, .bullet strong { color: ${C.heading}; }
  .bullet-dot { width: 7px; height: 7px; border-radius: 2px; background: ${C.accent}; flex-shrink: 0; margin-top: 8px; }
  .eyebrow { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${C.accent}; margin-bottom: 20px; }
  /* Imagen en mitad derecha */
  .split { display: grid; grid-template-columns: 1fr 1fr; width: 100%; height: 100%; }
  .split-text { padding: 64px 56px; display: flex; flex-direction: column; justify-content: center; }
  .split-img { background-size: cover; background-position: center; }
  /* Tarjeta flotante de imagen */
  .img-card { border-radius: 16px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.12); border: 1px solid ${C.line}; background-size: cover; background-position: center; }
  /* Bloque de color neutro para portada */
  .cover-block { position: absolute; top: 0; right: 0; width: 38%; height: 100%; background: ${C.accent}; z-index: 1; }
  .cover-img { position: absolute; top: 0; right: 0; width: 38%; height: 100%; background-size: cover; background-position: center; z-index: 1; }
  /* Cierre VIP */
  .closing { background: ${DESIGN.color.ink}; }
  .closing h2, .closing .big { color: ${DESIGN.color.white}; }
  .closing .subtitle { color: ${DESIGN.color.mist}; }
  .closing .eyebrow { color: ${C.accent}; }
  .nav { position: fixed; bottom: 24px; right: 24px; display: flex; gap: 8px; z-index: 100; }
  .nav button { width: 42px; height: 42px; border-radius: 10px; background: ${C.slideBg}; border: 1px solid ${C.line}; color: ${C.heading}; cursor: pointer; font-size: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); transition: all 0.15s; }
  .nav button:hover { background: ${C.bgPage}; }
  @media print { .nav { display: none; } .slide { page-break-after: always; } }
</style>
</head>
<body>
<div class="presentation" id="presentation">
${slidesHTML}
</div>
<div class="nav">
  <button onclick="prevSlide()">\u2190</button>
  <button onclick="nextSlide()">\u2192</button>
</div>
<script>
let current = 0;
const slides = document.querySelectorAll('.slide');
function show(n) { slides.forEach((s,i) => s.style.display = i === n ? 'flex' : 'none'); current = n; }
function nextSlide() { if(current < slides.length-1) show(current+1); }
function prevSlide() { if(current > 0) show(current-1); }
document.addEventListener('keydown', e => {
  if(e.key === 'ArrowRight' || e.key === 'ArrowDown') nextSlide();
  if(e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevSlide();
});
show(0);
</script>
</body>
</html>`
}

function buildSlideHTML(slide: SlideData, total: number, isFirst: boolean, C: any): string {
  const n = slide.slideNumber
  const stamp = `<div class="brand-stamp">${DESIGN.brand.name}</div>`
  const num = `<div class="slide-number">${n} / ${total}</div>`
  const display = isFirst ? 'flex' : 'none'

  // Resalta la idea clave: "Idea: explicación" → "<b>Idea:</b> explicación"
  const fmt = (b: string) => {
    const m = b.match(/^\s*([^:–—]{2,42})[:–—]\s+(.+)$/)
    return m ? `<b>${m[1].trim()}:</b> ${m[2].trim()}` : b
  }
  const bullets = (slide.bulletPoints || []).map(b => `
    <div class="bullet"><div class="bullet-dot"></div><span>${fmt(b)}</span></div>`).join('')

  // === PORTADA: título grande + bloque neutro / imagen a la derecha ===
  if (slide.type === 'cover') {
    const rightSide = slide.imageUrl
      ? `<div class="cover-img" style="background-image:url('${slide.imageUrl}')"></div>`
      : `<div class="cover-block"></div>`
    return `
    <div class="slide" style="display:${display}">
      ${rightSide}
      <div class="slide-pad" style="max-width:62%;align-items:flex-start">
        <div class="eyebrow">${DESIGN.brand.name}</div>
        <h1>${slide.title}</h1>
        <div class="geo-line"></div>
        ${slide.speakerNotes ? `<p class="subtitle" style="max-width:90%">${slide.speakerNotes}</p>` : ''}
      </div>
      ${stamp}${num}
    </div>`
  }

  // === CIERRE VIP: fondo oscuro elegante ===
  if (slide.type === 'closing') {
    return `
    <div class="slide closing" style="display:${display}">
      <div class="slide-pad" style="align-items:flex-start">
        <div class="eyebrow" style="color:${DESIGN.color.mist}">${DESIGN.brand.org}</div>
        <h2 class="big" style="font-size:44px">${slide.title}</h2>
        <div class="geo-line" style="background:${DESIGN.color.white}"></div>
        ${slide.speakerNotes ? `<p class="subtitle">${slide.speakerNotes}</p>` : ''}
        ${bullets}
      </div>
      ${stamp}${num}
    </div>`
  }

  // === CONTENIDO MIXTO: texto izquierda + imagen derecha (mitad exacta) ===
  if (slide.imageUrl && (slide.type === 'content' || slide.type === 'data')) {
    return `
    <div class="slide" style="display:${display}">
      <div class="split">
        <div class="split-text">
          <div class="eyebrow">${slide.type === 'data' ? 'Datos' : 'Contenido'}</div>
          <h2>${slide.title}</h2>
          <div class="geo-line"></div>
          ${bullets}
        </div>
        <div class="split-img" style="background-image:url('${slide.imageUrl}')"></div>
      </div>
      ${stamp}${num}
    </div>`
  }

  // === SOLO TEXTO ===
  return `
  <div class="slide" style="display:${display}">
    <div class="slide-pad" style="align-items:flex-start">
      <div class="eyebrow">${slide.type === 'agenda' ? 'Agenda' : slide.type === 'quote' ? 'Cita' : 'Contenido'}</div>
      <h2>${slide.title}</h2>
      <div class="geo-line"></div>
      ${bullets}
    </div>
    ${stamp}${num}
  </div>`
}
