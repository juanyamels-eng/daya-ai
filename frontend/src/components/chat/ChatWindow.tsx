'use client'
import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore, useAuthStore } from '../../store'
import { toast } from '../../lib/toast'
import { sendMessageStream, chatAPI, shareAPI } from '../../lib/api'
import { downloadImage } from '../../lib/download'
import { useTabSync, publish } from '../../hooks/useTabSync'
import ImageLightbox from './ImageLightbox'
import { useT, useI18n } from '../../lib/i18n'
import MessageBubble from './MessageBubble'
import ChatSearch from './ChatSearch'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import ArtifactPanel, { Artifact } from './ArtifactPanel'
import PageTitle from '../PageTitle'
import { modelLabel } from '../../lib/modelLabel'

const API = process.env.NEXT_PUBLIC_API_URL || ''

// fetch con tope de tiempo: si el servidor tarda demasiado, abortamos con un
// error claro en vez de dejar la UI "cargando" para siempre.
// ¿Lo que se está arrastrando son archivos? Arrastrar texto seleccionado o un
// enlace también dispara los eventos de drag, y ahí no queremos enseñar nada.
function dragHasFiles(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types
  return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 90000): Promise<Response> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(id)
  }
}


type ExportFormat = 'pdf' | 'md' | 'docx' | 'json'

/* Lo que Daya está haciendo, dicho en castellano. El servidor manda el nombre
   técnico de la herramienta (buscar_web, crear_tarea…) y aquí se traduce: al
   usuario le importa saber que está buscando, no cómo se llama la función. */
const TOOL_LABEL: Record<string, string> = {
  buscar_web: 'Buscando en la web…',
  leer_url: 'Leyendo la página…',
  buscar_en_documentos: 'Mirando en tus documentos…',
  calcular: 'Calculando…',
  generar_imagen: 'Generando la imagen…',
  crear_tarea: 'Creando la tarea…',
  crear_nota: 'Guardando la nota…',
  crear_evento: 'Agendando el evento…',
  crear_documento: 'Preparando el documento…',
  ver_imagen: 'Mirando la imagen…',
}
const EXPORT_FORMATS: { id: ExportFormat; ext: string; label: string }[] = [
  { id: 'pdf',  ext: 'PDF',  label: 'Documento editorial' },
  { id: 'md',   ext: 'MD',   label: 'Markdown' },
  { id: 'docx', ext: 'DOC',  label: 'Word' },
  { id: 'json', ext: 'JSON', label: 'Datos en bruto' },
]

const THINKING_MESSAGES: Record<string, string[]> = {
  es: ['Pensando', 'Analizando tu mensaje', 'Conectando ideas', 'Redactando la respuesta', 'Afinando los detalles'],
  en: ['Thinking', 'Analyzing your message', 'Connecting ideas', 'Writing the response', 'Polishing the details'],
}

function detectDocumentRequest(message: string): { isDoc: boolean; docType: string } {
  const lower = message.toLowerCase()

  // ===== POWERPOINT / PRESENTACIONES =====
  if (/(presentaci[oó]n|slides?|diapositivas?|power\s?point|\bppt\b|pitch\s?deck|\bdeck\b|expo(sici[oó]n)?)/i.test(lower))
    return { isDoc: true, docType: 'powerpoint' }

  // ===== EXCEL / HOJAS DE CÁLCULO / GRÁFICOS =====
  if (/(excel|hoja de c[aá]lculo|spreadsheet|planilla|tabla de datos|gr[aá]fic[oa]s?|estad[ií]sticas?|presupuesto|proyecci[oó]n financiera|datos num[eé]ricos|\bcsv\b)/i.test(lower))
    return { isDoc: true, docType: 'excel' }

  // ===== WORD =====
  if (/(word|documento word|\bdocx?\b|\bdoc\b)/i.test(lower))
    return { isDoc: true, docType: 'word' }

  // ===== PDF / DOCUMENTOS FORMALES =====
  if (/(\bpdf\b|informe|reporte|contrato|propuesta|plan de negocio|curr[ií]culum|\bcv\b|factura|acta|manual|gu[ií]a|pol[ií]tica|carta (formal|de)|ensayo|art[ií]culo|memor[aá]nd|comunicado|resumen ejecutivo|brief|dossier)/i.test(lower))
    return { isDoc: true, docType: 'pdf' }

  // ===== VERBO DE CREACIÓN + DOCUMENTO GENÉRICO =====
  const createVerb = /(crea|genera|hazme|h[aá]z|elabora|dame|necesito|quiero|prepara|dise[ñn]a|arma|redacta|escr[ií]be|produce|gener[aá]me)/i.test(lower)
  if (createVerb && /(documento|archivo|texto formal|escrito|reporte|trabajo)/i.test(lower))
    return { isDoc: true, docType: 'pdf' }

  return { isDoc: false, docType: '' }
}

// ── Búsqueda de imágenes en Wikimedia Commons ──────────────────────────────

interface WikiImage { title: string; thumb: string; url: string }

function detectImageSearch(message: string): string | null {
  const m = message.trim()
  const match = m.match(
    /^(?:(?:busca?r?|muéstrame?|muestra|encuentra|ver?)\s+)?(?:imágenes?|fotos?|fotografías?|ilustraciones?|pictures?|photos?|images?)\s+(?:de|sobre|del?|acerca\s+de|of)\s+(.+)/i
  ) || m.match(
    /^(?:búscame|quiero\s+(?:ver|buscar))\s+(?:imágenes?|fotos?)\s+(?:de|sobre|del?)\s+(.+)/i
  )
  if (match) return match[1].trim().slice(0, 100)
  return null
}

async function searchWikimediaImages(query: string): Promise<WikiImage[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=filetype:bitmap+${encodeURIComponent(query)}&gsrlimit=18&prop=imageinfo&iiprop=url|mime&iiurlwidth=400&format=json&origin=*`
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  const data = await res.json()
  const pages = Object.values(data.query?.pages || {}) as any[]
  return pages
    .filter(p => {
      const info = p.imageinfo?.[0]
      if (!info?.url) return false
      const mime = info.mime || ''
      return mime.startsWith('image/') && !mime.includes('svg') && !mime.includes('gif')
    })
    .map(p => {
      const info = p.imageinfo[0]
      return {
        title: (p.title || '').replace('File:', '').replace(/\.(jpe?g|png|webp|tiff?)$/i, '').replace(/_/g, ' ').trim(),
        thumb: info.thumburl || info.url,
        url: info.url,
      }
    })
    .slice(0, 12)
}

function ImageSearchMessage({ data }: { data?: { query: string; images?: WikiImage[]; error?: boolean } }) {
  if (!data) return null
  const { query, images, error } = data
  const loading = !images && !error
  return (
    <div style={{ display: 'flex', marginBottom: 24, animation: 'dayaRise 0.34s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
            <div style={{ width: 13, height: 13, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            Buscando imágenes de «{query}» en Wikimedia Commons…
          </div>
        )}
        {error && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No encontré imágenes para «{query}». Intenta con otro término.</div>}
        {images && images.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No encontré resultados para «{query}» en Wikimedia Commons. Intenta con otro término en inglés.</div>}
        {images && images.length > 0 && (
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
              {images.length} imágenes de <strong style={{ color: 'var(--text-primary)' }}>«{query}»</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 7, maxWidth: 720 }}>
              {images.map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noopener noreferrer"
                  title={img.title}
                  style={{ borderRadius: 10, overflow: 'hidden', display: 'block', border: '1px solid var(--border-default)', textDecoration: 'none', background: 'var(--bg-surface)', transition: 'all 0.17s cubic-bezier(0.16,1,0.3,1)', animationDelay: `${i * 0.04}s`, animation: 'dayaRise 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.14)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border-default)' }}>
                  <div style={{ width: '100%', paddingTop: '72%', position: 'relative', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                    <img src={img.thumb} alt={img.title} loading="lazy"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.22s ease' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = 'none' }} />
                  </div>
                  <div style={{ padding: '5px 8px 7px', fontSize: '0.65rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>{img.title}</div>
                </a>
              ))}
            </div>
            <div style={{ marginTop: 9, fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>
              Fuente: Wikimedia Commons · Haz clic en cada imagen para ver su licencia
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Generación de imágenes con Pollinations AI ──────────────────────────────

// Palabras que indican documento/texto/código — NUNCA imagen
const NOT_IMAGE = /\b(informe|reporte|resumen|texto|lista|carta|email|correo|ensayo|artículo|poema|cuento|historia|plan|propuesta|código|función|script|tabla|fórmula|cálculo|pregunta|respuesta|explicación|análisis|descripción)\b/i

// Verbos narrativos/explicativos → la frase es una pregunta o declaración, NO una descripción visual
const NARR_VERB = /\b(es|son|fue|era|fueron|eran|está[n]?|estuvo|estaba|tiene[n]?|tuvo|tenía|hace[n]?|hizo|hacía|puede[n]?|podía|debe[n]?|quiere[n]?|sabe[n]?|viene[n]?|va[n]?|cambia[n]?|cambió|describe|explica|significa|han|hemos|había|hubo|habría|explícame|cuéntame|dime|qué es|cómo)\b/i

// Detecta peticiones de código para activar el flujo de preguntas inteligentes
function detectCodeRequest(message: string): boolean {
  const m = message.trim()
  const NOT_DOC = /\b(pdf|word|docx|excel|powerpoint|presentaci[oó]n|informe|reporte|curr[ií]culum|\bcv\b|contrato|propuesta|ensayo|art[ií]culo|carta formal)\b/i
  const NOT_IMG = /\b(imagen|foto|ilustraci[oó]n|dibujo|wallpaper|icono|logo|poster)\b/i
  if (NOT_DOC.test(m) || NOT_IMG.test(m)) return false
  const CODE_NOUN = /\b(función|funcion|script|código|codigo|clase|componente|api|endpoint|algoritmo|programa|app|aplicaci[oó]n|bot|servidor|server|m[oó]dulo|hook|middleware|query|base de datos|schema|model|controller|service|route|p[aá]gina web|landing|crud|rest|graphql|websocket|cli|daemon|pipeline|microservicio|librería|librer[ií]a|paquete|plugin|extension|widget|test|unittest|e2e|selenium|playwright)\b/i
  const CREATE_VERB = /^(crea|cr[eé]ame|hazme|h[aá]z un[ao]?|escr[ií]be|genera|implementa|programa|construye|desarrolla|arma|dame un[ao]?|necesito un[ao]?|quiero un[ao]?|make|create|write|build|implement|generate)/i
  return CREATE_VERB.test(m) && CODE_NOUN.test(m)
}

function detectImageGeneration(message: string): string | null {
  const m = message.trim()
  const words = m.split(/\s+/).length

  if (NOT_IMAGE.test(m)) return null  // descarta texto/docs/código

  // r1: verbo explícito + palabra de imagen + descripción
  // Los verbos toleran acentos (genérame, créame, diséñame, dibújame, píntame…):
  // el flag /i ignora mayúsculas pero NO tildes, por eso van como [eé], [uú], etc.
  const r1 = m.match(
    /^(?:gen[eé]ra(?:me|dme)?|cr[eé]a(?:me|dme)?|dib[uú]j[ao](?:me)?|h[aá]z(?:me)?|p[ií]nta(?:me|dme)?|dis[eé][ñn]a(?:me|dme)?|imagina|make|create|draw|generate|d[aá]me|quiero|mu[eé]strame|ponme|necesito)\s+(?:(?:un[ao]?|el|la)\s+)?(?:imagen|foto|fotograf[ií]a|ilustraci[oó]n|dibujo|arte|dise[ñn]o|image|picture|photo|artwork|wallpaper|poster|logo|icono)\s*(?:de|del?|sobre|of|con|with|:)?\s*[:\-]?\s*(.+)/i
  )
  if (r1?.[1]?.trim()) return r1[1].trim().slice(0, 600)

  // r2: verbos de dibujo directo ("dibuja un dragón", "pinta un paisaje")
  const r2 = m.match(/^(?:dib[uú]j[ao]m?e?|p[ií]ntam?e?|bosqu[eé]jam?e?|sketch)\s+(.+)/i)
  if (r2?.[1]?.trim()) return r2[1].trim().slice(0, 600)

  // r3: "imagen de X" / "foto de X" / "retrato de X" sin verbo
  const r3 = m.match(/^(?:imagen|foto(?:grafía)?|ilustraci[oó]n|wallpaper|fondo\s+de\s+pantalla|retrato|arte)\s+(?:de|del?|sobre|con)\s+(.+)/i)
  if (r3?.[1]?.trim()) return r3[1].trim().slice(0, 600)

  // r4: "genera/crea un [sujeto]" sin palabra de imagen (ej: "crea una ciudad futurista")
  const r4 = m.match(/^(?:gen[eé]ra(?:me)?|cr[eé]a(?:me)?|h[aá]z(?:me)?|mu[eé]strame)\s+(?:un[ao]?|el|la|los|las)\s+(.{4,})/i)
  if (r4?.[1]?.trim()) return r4[1].trim().slice(0, 600)

  // r5: frase con keywords de estilo visual → casi siempre es una petición de imagen
  // Captura: "una chica de estilo anime", "paisaje estilo ghibli", "retrato cyberpunk", etc.
  const VISUAL_STYLE = /\b(?:de\s+)?estilo\s+(?:anime|manga|3d|pixel(?:\s*art)?|acuarela|óleo|realista|fotorrealista|fantástico|fantasy|cyberpunk|steampunk|cartoon|chibi|kawaii|surrealista|abstracto|minimalista|gótico|medieval|futurista|sci[\s-]?fi|ghibli|disney|marvel|ukiyo|impresionista|retro|vintage|neon|hiperrealista)\b|\b(?:anime|manga|pixelart|chibi|kawaii|cyberpunk|steampunk|ghibli)\s+(?:art|style|aesthetic)/i
  if (VISUAL_STYLE.test(m) && !NARR_VERB.test(m)) return m.slice(0, 600)

  // r6: sujetos visuales fuertes en frases cortas sin verbos narrativos
  // Captura: "un dragón de fuego", "un samurai en la niebla", "un robot en el espacio"
  const VISUAL_NOUN = /\b(?:dragón|dragon|unicornio|fénix|kraken|sirena|hada|elfo|orco|vampiro|górgona|guerrero|samurai|ninja|mago|bruja|robot|cyborg|androide|astronauta|pirata|caballero|vikingo|nave\s*espacial|castillo|palacio|fortaleza|aldea\s+medieval|ciudad\s+futurista|galaxia|nebulosa|planeta|aurora|volcán)\b/i
  if (VISUAL_NOUN.test(m) && words <= 20 && !NARR_VERB.test(m)) return m.slice(0, 600)

  return null
}

const IMG_QUALITY: Record<string, string> = {
  'flux-realism': 'RAW photo, photorealistic, ultra-detailed, 8K UHD, DSLR, sharp focus, professional photography',
  'flux':         'high quality, detailed, 8k, masterpiece',
  'flux-anime':   'anime key visual, detailed anime art, vibrant colors, clean linework, studio quality',
  'flux-3d':      '3D render, Blender Cycles, volumetric lighting, PBR materials, ray tracing',
  'turbo':        'high quality, detailed',
}

// Deduce dimensiones de Pollinations a partir del texto (prompt del usuario +
// respuestas del panel). Robusto: detecta la orientación por palabra clave esté
// donde esté (ya no depende de una pregunta fija en posición 0). Si gemini-flash NO
// pregunta el formato porque el usuario ya lo dijo ("horizontal"), igual lo capta del
// prompt. Sin pista → cuadrado. Orden: ratios y palabras específicas primero.
function deriveImgSize(text: string): { width: number; height: number } {
  const t = text.toLowerCase()
  if (/16\s*[:x/]\s*9|horizontal|apaisad|panor[aá]mic|paisaje|wide|landscape/.test(t)) return { width: 1344, height: 768 }
  if (/9\s*[:x/]\s*16|vertical|historia|story|m[oó]vil|portrait\s*phone/.test(t)) return { width: 768, height: 1344 }
  if (/3\s*[:x/]\s*4|retrato|portrait/.test(t)) return { width: 896, height: 1152 }
  // 1:1 / cuadrado / square o sin pista → cuadrado por defecto.
  return { width: 1024, height: 1024 }
}
// Deriva el modelo de Pollinations según el estilo elegido (mismo criterio que el
// sistema viejo de preguntas de imagen).
function deriveImgModel(answersText: string): string {
  const t = answersText.toLowerCase()
  if (/anime|manga|kawaii|chibi/.test(t)) return 'flux-anime'
  if (/3d|render|blender|cgi/.test(t)) return 'flux-3d'
  if (/foto|real|dslr|photograph/.test(t)) return 'flux-realism'
  return 'flux'
}

interface GenImageData { prompt: string; model: string; url?: string; error?: boolean; errorMsg?: string }

const CREATIVE_SUFFIXES = ['cinematic composition', 'dramatic lighting', 'golden hour light', 'perfect artistic composition', 'stunning visual details', 'award-winning photography']


function ImageGenMessage({ data, onRegenerate, onZoom }: { data?: GenImageData; onRegenerate?: (model: string) => void; onZoom?: (url: string, prompt?: string) => void }) {
  // El estado de carga lo lleva el PROPIO <img> (onLoad/onError) — ya no hay un
  // new Image() preload aparte (eso pedía la url dos veces a Pollinations). Un
  // timeout de 35s cubre el caso colgado.
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const loadedRef = useRef(false)
  const url = data?.url
  useEffect(() => {
    loadedRef.current = false
    setLoaded(false)
    setFailed(false)
    if (!url) return
    const t = setTimeout(() => { if (!loadedRef.current) setFailed(true) }, 35000)
    return () => clearTimeout(t)
  }, [url])

  if (!data) return null
  const isError = !!data.error || failed
  const isLoading = !isError && (!data.url || !loaded)
  return (
    <div style={{ display: 'flex', marginBottom: 24, animation: 'dayaRise 0.34s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
            <div style={{ width: 13, height: 13, border: '2px solid var(--border-default)', borderTopColor: 'var(--accent-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            Generando imagen de «{data.prompt.slice(0, 60)}{data.prompt.length > 60 ? '…' : ''}»…
          </div>
        )}
        {isError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {data.errorMsg || 'La imagen tardó demasiado o falló. Intenta de nuevo.'}
            </span>
            {onRegenerate && !data.errorMsg && (
              <button onClick={() => onRegenerate(data.model || 'flux-realism')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', boxShadow: 'none' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Reintentar
              </button>
            )}
          </div>
        )}
        {data.url && !isError && (
          <div>
            {/* El <img> se carga SIEMPRE (única petición). Mientras no termine, se
                oculta y se muestra el spinner de arriba; al cargar, aparece. */}
            <div onClick={() => loaded && onZoom?.(data.url!, data.prompt)} title="Clic para ampliar y editar"
              style={{ maxWidth: 520, borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid var(--border-default)', cursor: 'zoom-in', display: loaded ? 'block' : 'none' }}>
              <img src={data.url} alt={data.prompt}
                onLoad={() => { loadedRef.current = true; setLoaded(true) }}
                onError={() => setFailed(true)}
                style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function ThinkingIndicator({ deep, web, doc, model, status }: { deep?: boolean; web?: boolean; doc?: boolean; model?: string; status?: string }) {
  const [msgIndex, setMsgIndex] = useState(0)
  const lang = useI18n((s) => s.lang)
  // Buscando en la web: estado distinto al "pensando" normal de la IA.
  const webMsgs = lang === 'en'
    ? ['Searching the web', 'Reviewing sources', 'Reading results', 'Cross-checking facts']
    : ['Buscando en la web', 'Revisando fuentes', 'Leyendo resultados', 'Contrastando datos']
  // En Profundo, mensajes que dejan claro que está razonando más (y por eso tarda).
  const deepMsgs = lang === 'en'
    ? ['Thinking deeply', 'Reasoning step by step', 'Considering alternatives', 'Verifying the answer']
    : ['Pensando a fondo', 'Razonando paso a paso', 'Considerando alternativas', 'Verificando la respuesta']
  // Pidió un documento: no es "pensando", es que lo está escribiendo.
  const docMsgs = lang === 'en'
    ? ['Drafting the document', 'Structuring the sections', 'Writing the content', 'Formatting']
    : ['Redactando documento', 'Estructurando los apartados', 'Escribiendo el contenido', 'Dando formato']
  const base = web ? webMsgs : doc ? docMsgs : deep ? deepMsgs : (THINKING_MESSAGES[lang] ?? THINKING_MESSAGES.es)
  // En cuanto el backend dice qué modelo responde, se abre nombrándolo: enseña
  // que Daya enruta a la IA que mejor le va a cada mensaje.
  const who = modelLabel(model)
  const msgs = who
    ? [lang === 'en' ? `${who} is writing` : `${who} está escribiendo`, ...base]
    : base
  useEffect(() => {
    const m = setInterval(() => setMsgIndex(i => (i + 1) % msgs.length), 2600)
    return () => clearInterval(m)
  }, [msgs.length])
  // Al saberse el modelo, volvemos al principio para que lo primero que se lea
  // sea su nombre y no el mensaje genérico por el que fuera pasando.
  useEffect(() => { if (who) setMsgIndex(0) }, [who])
  // Si hay un estado en vivo (investigación profunda), se muestra tal cual; si no, se cicla.
  const label = status && status.trim() ? status : msgs[msgIndex % msgs.length]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 0 24px' }}>
      <span className="daya-think-text" style={{ fontSize: '0.95rem', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
        {label}
      </span>
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        {[0,1,2].map(i => (
          <span key={i} className="daya-think-dot" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </span>
      <style>{`
        @keyframes dayaPulse{
          0%,100%{opacity:0.5;transform:scale(0.93)}
          50%{opacity:1;transform:scale(1.02)}
        }
        .daya-think-text{
          background:linear-gradient(90deg,
            var(--text-tertiary) 0%,
            var(--text-tertiary) 30%,
            var(--text-primary) 48%,
            var(--text-primary) 52%,
            var(--text-tertiary) 70%,
            var(--text-tertiary) 100%
          );
          background-size:250% 100%;
          -webkit-background-clip:text;background-clip:text;
          -webkit-text-fill-color:transparent;
          animation:thinkShimmer 2.4s ease-in-out infinite;
        }
        @keyframes thinkShimmer{
          0%{background-position:160% 0}
          100%{background-position:-160% 0}
        }
        .daya-think-dot{
          display:inline-block;
          width:3.5px;height:3.5px;
          border-radius:50%;
          background:var(--text-tertiary);
          animation:thinkDot 1.4s cubic-bezier(0.45,0,0.55,1) infinite both;
        }
        @keyframes thinkDot{
          0%,100%{transform:translateY(0) scale(1);opacity:0.3}
          40%{transform:translateY(-5px) scale(1.2);opacity:1}
          65%{transform:translateY(-2px) scale(1.05);opacity:0.7}
        }
      `}</style>
    </div>
  )
}

function DocumentMessage({ docType, fileName, downloadUrl, previewHTML, onOpen }: any) {
  const colors: Record<string, string> = { pdf: '#ef4444', word: '#2563eb', excel: '#16a34a', powerpoint: '#d97706', zip: '#7c3aed' }
  const labels: Record<string, string> = { pdf: 'PDF', word: 'Word', excel: 'Excel', powerpoint: 'Presentación', zip: 'ZIP' }
  const color = colors[docType] || '#18181b'
  // Hay vista grande disponible si tenemos el HTML, o si es un PDF (se ve por su URL)
  const canView = !!previewHTML || docType === 'pdf'
  const open = () => canView && onOpen && onOpen({ docType, fileName, downloadUrl, previewHTML })

  return (
    <div style={{ display: 'flex', marginBottom: 20, animation: 'dayaRise 0.34s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ flex: 1 }}>
        <div className="daya-lift" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, overflow: 'hidden', maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
          {/* Miniatura clicable de la vista previa */}
          {canView && (
            <button onClick={open} title="Abrir vista grande"
              style={{ display: 'block', width: '100%', height: 190, border: 'none', padding: 0, cursor: 'pointer', background: 'var(--bg-elevated)', position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border-default)' }}>
              {previewHTML ? (
                <div style={{ width: '200%', height: '380px', transform: 'scale(0.5)', transformOrigin: 'top left', pointerEvents: 'none' }}>
                  <iframe srcDoc={previewHTML} scrolling="no" style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} title="preview" />
                </div>
              ) : (
                <iframe src={`${API}${downloadUrl}#toolbar=0&navpanes=0`} scrolling="no" style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} title="preview" />
              )}
              {/* Capa de "Abrir" al pasar el cursor */}
              <span className="doc-open-overlay" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,12,0.0)', transition: 'background 0.2s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,10,12,0.32)'; const c = (e.currentTarget.firstChild as HTMLElement); if (c) c.style.opacity = '1' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,10,12,0)'; const c = (e.currentTarget.firstChild as HTMLElement); if (c) c.style.opacity = '0' }}>
                <span style={{ opacity: 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.96)', color: '#111', fontSize: '0.8rem', fontWeight: 700, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M14 10l7-7M9 21H3v-6M10 14l-7 7"/></svg>
                  Abrir vista
                </span>
              </span>
            </button>
          )}

          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: color + '14', border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{labels[docType] || 'Documento'} listo</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {canView && (
                <button onClick={open}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 9, background: 'var(--text-primary)', border: 'none', color: 'var(--bg-base)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
                  Ver documento
                </button>
              )}
              <a href={`${API}${downloadUrl}`} download
                style={{ flex: canView ? 'none' : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {canView ? '' : 'Descargar'}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════ VISOR GRANDE DE DOCUMENTOS (panel tipo artefacto, como Claude) ════════
function DocumentViewer({ doc, onClose }: { doc: any; onClose: () => void }) {
  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [doc, onClose])

  if (!doc) return null
  const labels: Record<string, string> = { pdf: 'PDF', word: 'Documento Word', excel: 'Hoja de Excel', powerpoint: 'Presentación' }
  const srcDoc = doc.previewHTML
  const pdfSrc = !doc.previewHTML && doc.docType === 'pdf' ? `${API}${doc.downloadUrl}` : null

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(10px, 3vh, 40px)', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', animation: 'fadeIn 0.2s ease' }}>
      <div style={{ width: '100%', maxWidth: 1100, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden', animation: 'docViewerPop 0.26s cubic-bezier(0.16,1,0.3,1)' }}>
        {/* Barra superior */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <img src="/logo.png" alt="Daya" style={{ width: 22, height: 22, objectFit: 'contain', filter: 'var(--logo-filter)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60vw' }}>{doc.fileName}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{labels[doc.docType] || 'Documento'} · Vista previa</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <a href={`${API}${doc.downloadUrl}`} download
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 9, background: 'var(--text-primary)', color: 'var(--bg-base)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar
            </a>
            <button onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)"
              style={{ width: 36, height: 36, borderRadius: 9, background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        {/* Lienzo del documento */}
        <div style={{ flex: 1, minHeight: 0, background: '#52525b', display: 'flex', justifyContent: 'center', overflow: 'auto', padding: 'clamp(8px, 2vw, 28px)' }}>
          {srcDoc ? (
            <iframe srcDoc={srcDoc} style={{ width: '100%', maxWidth: 980, height: '100%', minHeight: 600, border: 'none', borderRadius: 8, background: '#fff', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }} title="Documento" />
          ) : pdfSrc ? (
            <iframe src={pdfSrc} style={{ width: '100%', maxWidth: 980, height: '100%', minHeight: 600, border: 'none', borderRadius: 8, background: '#fff', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }} title="Documento" />
          ) : (
            <div style={{ alignSelf: 'center', textAlign: 'center', color: '#e4e4e7' }}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>La vista previa no está disponible</p>
              <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Descarga el archivo para verlo completo.</p>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes docViewerPop{from{opacity:0;transform:scale(0.97) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  )
}

// Preguntas de aclaración: tarjeta elegante con opciones tappables + progreso


export default function ChatWindow() {
  const t = useT()
  const lang = useI18n((s) => s.lang)
  const router = useRouter()
  const { user, token } = useAuthStore()
  const { messages, addMessage, activeConversation, isLoading, setLoading,
    streamingContent, appendStream, setStream, clearStream, setActiveConversation, setActiveId, setConversations } = useChatStore()
  const [input, setInput] = useState('')
  const [findOpen, setFindOpen] = useState(false)

  // Sugerencias del chat vacío, a partir de los títulos de las últimas
  // conversaciones. Se recalculan solo cuando cambia la lista.
  const conversations = useChatStore((s) => s.conversations)

  // Ctrl+F busca DENTRO de la conversación en vez de abrir el buscador del
  // navegador (que no ve los mensajes que aún no se han desplazado a la vista).
  // allowInInput: se usa casi siempre con el cursor puesto en el redactor.
  useKeyboardShortcuts([
    { key: 'f', ctrl: true, allowInInput: true, run: () => setFindOpen(true) },
  ], messages.length > 0)

  // Otra pestaña escribió en la conversación que tengo abierta: la recargo del
  // servidor. Si estoy recibiendo MI respuesta en streaming lo dejo pasar y ya se
  // sincroniza al terminar (recargar a mitad cortaría la respuesta en pantalla).
  useTabSync((ev) => {
    if (ev.type !== 'messages') return
    const active = useChatStore.getState().activeConversation
    if (!active || active.id !== ev.convId) return
    if (useChatStore.getState().isLoading) return
    chatAPI.getConversation(ev.convId)
      .then(r => useChatStore.getState().setActiveConversation(r.data))
      .catch(() => {})
  })

  // Si llega una plantilla de prompt desde /prompts ("Usar"), la carga en el input.
  useEffect(() => {
    try {
      const seed = sessionStorage.getItem('daya_prompt_seed')
      if (seed) { setInput(seed); sessionStorage.removeItem('daya_prompt_seed'); return }
      // "Conversar" desde la Biblioteca: arranca enfocado en ese documento. El chat
      // normal ya hace RAG sobre tus documentos (buildSystemPrompt → retrieveRelevant),
      // así que NO se entra al modo agente: el chat principal lo resuelve solo.
      const docChat = sessionStorage.getItem('daya_doc_chat')
      if (docChat) {
        setInput(`Resume el documento «${docChat}» y dime sus puntos clave.`)
        sessionStorage.removeItem('daya_doc_chat')
        return
      }
      // "Preguntar a los seleccionados" desde la Biblioteca: varios documentos a la vez.
      // Mismo camino que arriba (el RAG ya busca en todos tus documentos); nombrar los
      // archivos guía la recuperación hacia ese conjunto para compararlos/cruzarlos.
      const docsChat = sessionStorage.getItem('daya_docs_chat')
      if (docsChat) {
        sessionStorage.removeItem('daya_docs_chat')
        try {
          const names: string[] = JSON.parse(docsChat)
          if (Array.isArray(names) && names.length) {
            const list = names.map(n => `«${n}»`).join(', ')
            setInput(`Compara y cruza estos documentos: ${list}. Dame los puntos clave de cada uno y en qué coinciden o se contradicen.`)
            return
          }
        } catch {}
      }
      // Restaurar borrador si el usuario no envió nada todavía
      const draft = sessionStorage.getItem('daya_draft')
      if (draft) setInput(draft)
    } catch {}
  }, [])
  const [isFocused, setIsFocused] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  // Cuántos elementos anidados tiene el cursor encima mientras arrastra.
  const dragDepth = useRef(0)
  const [docMessages, setDocMessages] = useState<Record<string, any>>({})
  const [imageMessages, setImageMessages] = useState<Record<string, { query: string; images?: WikiImage[]; error?: boolean }>>({})
  const [genImages, setGenImages] = useState<Record<string, GenImageData>>({})
  const [imgMode, setImgMode] = useState(false)
  const [viewerDoc, setViewerDoc] = useState<any>(null)
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; prompt?: string } | null>(null)
  // Panel de preguntas inteligentes universal (imagen, documento, …). docType solo aplica a documentos.
  const [researchStatus, setResearchStatus] = useState('')
  // Qué modelo respondió el turno en curso (lo dice el backend antes del 1er token)
  // y si lo que se pidió es un documento: los dos alimentan el indicador de escritura.
  const [activeModel, setActiveModel] = useState('')
  const [docPending, setDocPending] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [chatMode, setChatMode] = useState<'chat' | 'voice'>('chat')
  const [webMode, setWebMode] = useState(() => { try { return localStorage.getItem('daya_web') === '1' } catch { return false } })
  // Nivel por defecto: NORMAL (equilibrado). Se respeta la elección previa guardada.
  const [thinkLevel, setThinkLevel] = useState<'fast' | 'normal' | 'deep'>(() => { try { const v = localStorage.getItem('daya_think'); return v === 'fast' || v === 'normal' || v === 'deep' ? v : 'normal' } catch { return 'normal' } })
  const [thinkOpen, setThinkOpen] = useState(false)
  // Menú del título del chat (renombrar / fijar / ver lo creado + descargar)
  const [titleMenuOpen, setTitleMenuOpen] = useState(false)
  // Micro-estado del motor de exportación a PDF ("Generando documento…")
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // Enlace público de esta conversación (null = no compartida).
  const [shareSlug, setShareSlug] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  // Razonamiento (modo Profundo): en vivo durante el stream + guardado por mensaje.
  const [streamReasoning, setStreamReasoning] = useState('')
  const [msgReasoning, setMsgReasoning] = useState<Record<string, string>>({})
  const reasoningRef = useRef('')
  const [researchMode, setResearchMode] = useState(() => { try { return localStorage.getItem('daya_research') === '1' } catch { return false } })
  const bottomRef = useRef<HTMLDivElement>(null)
  // ¿El usuario está pegado al fondo? Si sube a leer, dejamos de auto-scrollear.
  const atBottomRef = useRef(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recognitionRef = useRef<any>(null)
  const speechBaseRef = useRef('')
  const convIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastUserMsgRef = useRef('')
  const lastAutoArtifactRef = useRef('')
  const sendingRef = useRef(false)  // guard síncrono anti doble-envío
  const stoppedRef = useRef(false)  // el usuario pulsó Detener: onDone/onError no deben re-añadir

  // Auto-abre el ArtifactPanel cuando la respuesta contiene HTML o SVG
  useEffect(() => {
    if (isLoading || streamingContent || messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant' || last.id === lastAutoArtifactRef.current) return
    const htmlMatch = last.content.match(/```html\n([\s\S]{200,}?)```/)
    const svgMatch = last.content.match(/```svg\n([\s\S]{80,}?)```/)
    const jsMatch = last.content.match(/```(?:javascript|js)\n([\s\S]{200,}?)```/)
    const target = htmlMatch?.[1] || svgMatch?.[1] || jsMatch?.[1]
    const lang = htmlMatch ? 'html' : svgMatch ? 'svg' : 'javascript'
    if (target) { lastAutoArtifactRef.current = last.id; setArtifact({ lang, code: target.trim() }) }
  }, [messages, isLoading, streamingContent])

  // Genera una imagen con Pollinations y actualiza el mensaje correspondiente
  // Genera la imagen con Pollinations. Al cargar, la PERSISTE en el servidor:
  //  - persist.userText presente → modo completo: el backend asegura la
  //    conversación + crea el mensaje del usuario y el assistant con la imagen,
  //    así sobrevive a la recarga y queda en la Biblioteca.
  //  - sin persist (variante/regenerar) → imageOnly: solo se añade a la Biblioteca.
  const triggerImageGen = useCallback((msgId: string, prompt: string, model: string, persist?: { conversationId?: string | null; userText?: string }, size?: { width: number; height: number }) => {
    const quality = IMG_QUALITY[model] || 'high quality, detailed, 8k'
    const fullPrompt = `${prompt}, ${quality}`
    const seed = Math.floor(Math.random() * 9999999)
    const w = size?.width || 1024, h = size?.height || 1024
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=${model}`
    // Publica la URL de inmediato: el propio <img> de ImageGenMessage la carga UNA
    // sola vez (y maneja spinner/error con sus eventos onLoad/onError + timeout).
    // Antes había un new Image() preload que pedía la MISMA url por separado → dos
    // generaciones en Pollinations por imagen (una corría invisible "por debajo").
    setGenImages(prev => ({ ...prev, [msgId]: { prompt, model, url } }))
    // GUARDADO GARANTIZADO en el servidor — se dispara YA, NO depende de que la
    // imagen cargue en el navegador. Antes este POST vivía dentro de img.onload, así
    // que si Pollinations iba lento o fallaba la carga, onload no disparaba y la
    // imagen NUNCA se guardaba en la Biblioteca. La URL de Pollinations es
    // determinista, así que se persiste de inmediato. Reintenta ante fallos transitorios.
    ;(async () => {
      const tok = useAuthStore.getState().token
      const body = persist
        ? { prompt, model, url, conversationId: persist.conversationId || undefined, userText: persist.userText }
        : { prompt, model, url, messageId: msgId, imageOnly: true }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`${API}/api/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify(body),
          })
          if (!res.ok) {
            const detail = await res.text().catch(() => '')
            console.warn('[Biblioteca] no se pudo guardar la imagen:', res.status, detail)
            // Límite del plan alcanzado: quita la imagen optimista y avisa al usuario.
            if (res.status === 429) {
              let msg = 'Alcanzaste tu límite de imágenes. Mejora tu plan para continuar.'
              try { const j = JSON.parse(detail); if (j?.error) msg = j.error } catch { /* texto plano */ }
              setGenImages(prev => ({ ...prev, [msgId]: { ...(prev[msgId] || { prompt, model }), url: undefined, error: true, errorMsg: msg } }))
              toast(msg, 'error')
              return
            }
            // 5xx (incl. cold-start de Railway): reintentar sin perder el guardado.
            if (res.status >= 500 && attempt < 2) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue }
            return
          }
          const data = await res.json().catch(() => null)
          // Modo completo: el backend aseguró la conversación. Marcarla activa (para
          // reabrirla al recargar) y refrescar el sidebar.
          if (data?.conversationId) {
            convIdRef.current = data.conversationId
            const st = useChatStore.getState()
            if (!st.activeConversation) {
              st.setActiveId({ id: data.conversationId, title: (persist?.userText || prompt).slice(0, 60), model: 'claude', mode: 'SINGLE', updatedAt: new Date().toISOString() })
            }
            import('../../lib/api').then(({ chatAPI }) => chatAPI.getConversations().then(r => st.setConversations(r.data)).catch(() => {}))
          }
          return
        } catch (e) {
          console.warn('[Biblioteca] error de red al guardar la imagen:', e)
          if (attempt < 2) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue }
        }
      }
    })()
  }, [])

  // Crea el mensaje de imagen y dispara la generación combinando la petición del
  // usuario + sus respuestas del panel en UN prompt profesional en inglés (paso
  // gemini-flash en el backend). El tamaño se deduce del prompt + respuestas (no
  // posicional) y el modelo del estilo elegido. Si la mejora falla, cae al combinado
  // simple de siempre. Sin respuestas (Saltar) → igual mejora la petición sola.
  const runImageGen = useCallback(async (basePrompt: string, answers: string[]) => {
    if (sendingRef.current) return   // evita doble generación por doble clic en el panel
    sendingRef.current = true
    try {
    const answersText = answers.filter(Boolean).join(' ')
    const size = deriveImgSize(`${basePrompt} ${answersText}`)
    const styleAnswers = answers.filter(a => a
      && !/sorprén|lo que mejor|da igual|el que|la que|lo que encaje/i.test(a)
      && !/cuadrad|vertical|horizontal|retrato|panor|apaisad|paisaje|1\s*[:x/]\s*1|9\s*[:x/]\s*16|16\s*[:x/]\s*9|3\s*[:x/]\s*4/i.test(a))
    const model = deriveImgModel(styleAnswers.join(' '))

    // Mejora del prompt (petición + respuestas → prompt profesional en inglés).
    setLoading(true)
    let fullPrompt = ''
    try {
      const tok = useAuthStore.getState().token
      const res = await fetchWithTimeout(`${API}/api/images/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ basePrompt, answers }),
      }, 12000)
      const data = await res.json().catch(() => null)
      if (data?.prompt && typeof data.prompt === 'string') fullPrompt = data.prompt.trim()
    } catch { /* fallback abajo */ }
    setLoading(false)

    // Fallback client-side: combinado simple de siempre (nunca se rompe).
    if (!fullPrompt) {
      const creative = CREATIVE_SUFFIXES[Math.floor(Math.random() * CREATIVE_SUFFIXES.length)]
      const extra = styleAnswers.join(', ')
      fullPrompt = extra ? `${basePrompt}, ${extra}, ${creative}` : `${basePrompt}, ${creative}`
    }

    const genMsgId = Date.now().toString()
    addMessage({ id: genMsgId, role: 'assistant', content: `__IMGGEN__|${fullPrompt}|${model}`, createdAt: new Date().toISOString() })
    setGenImages(prev => ({ ...prev, [genMsgId]: { prompt: fullPrompt, model } }))
    triggerImageGen(genMsgId, fullPrompt, model, { conversationId: useChatStore.getState().activeConversation?.id || convIdRef.current, userText: basePrompt }, size)
    } finally { sendingRef.current = false }
  }, [addMessage, triggerImageGen, setLoading])

  // Detiene la generación en curso (botón Detener)
  const handleStop = useCallback(() => {
    // Marca que el corte fue manual: al abortar, sendMessageStream llama a onDone,
    // que NO debe volver a añadir el mensaje (ya lo guardamos aquí) ni reintentar.
    stoppedRef.current = true
    abortRef.current?.abort()
    abortRef.current = null
    streamDoneRef.current = true
    setLoading(false)
    // Guarda lo que se alcanzó a generar como mensaje
    const partial = bufferRef.current
    if (partial && partial.trim()) {
      addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: partial, createdAt: new Date().toISOString() })
    }
    clearStream()
  }, [addMessage, clearStream, setLoading])

  // ===== TYPEWRITER (escribir poco a poco) =====
  // Los chunks que llegan del backend pueden venir en bloques grandes. Para que
  // SIEMPRE se vea fluido, no los mostramos directo: los acumulamos en un buffer
  // y un "pump" los vacía carácter a carácter al texto visible.
  const bufferRef = useRef('')        // texto pendiente por mostrar
  const shownRef = useRef('')         // texto ya mostrado
  const streamDoneRef = useRef(false) // el backend ya terminó de enviar
  const pumpRef = useRef<number | null>(null)

  const startPump = useCallback(() => {
    if (pumpRef.current != null) return
    const tick = () => {
      const pending = bufferRef.current.length - shownRef.current.length
      if (pending > 0) {
        // Velocidad tipo ChatGPT: fluido pero ágil. Acelera con backlog grande.
        const step = pending > 400 ? 18 : pending > 150 ? 8 : pending > 50 ? 4 : pending > 12 ? 2 : 1
        shownRef.current = bufferRef.current.slice(0, shownRef.current.length + step)
        setStream(shownRef.current)
      } else if (streamDoneRef.current) {
        // Terminó y ya mostramos todo: detener el pump.
        if (pumpRef.current != null) { cancelAnimationFrame(pumpRef.current); pumpRef.current = null }
        return
      }
      pumpRef.current = requestAnimationFrame(tick)
    }
    pumpRef.current = requestAnimationFrame(tick)
  }, [setStream])

  // Alimenta el buffer (lo llama la API en cada chunk recibido)
  const feedStream = useCallback((chunk: string) => {
    bufferRef.current += chunk
    startPump()
  }, [startPump])

  // Reinicia el estado del typewriter para un mensaje nuevo
  const resetTypewriter = useCallback(() => {
    bufferRef.current = ''
    shownRef.current = ''
    streamDoneRef.current = false
    if (pumpRef.current != null) { cancelAnimationFrame(pumpRef.current); pumpRef.current = null }
  }, [])

  // Espera a que el typewriter termine de mostrar todo el buffer
  const waitTypewriterDone = useCallback(() => new Promise<string>((resolve) => {
    streamDoneRef.current = true
    const check = () => {
      if (shownRef.current.length >= bufferRef.current.length) resolve(bufferRef.current)
      else setTimeout(check, 30)
    }
    check()
  }), [])

  // Mantiene convIdRef sincronizado con la conversacion activa del store.
  // Cuando se abre un chat del historial -> apunta a ese id.
  // Cuando se pulsa "Nueva conversacion" (activeConversation = null) -> se limpia,
  // asi el proximo mensaje crea un chat nuevo en vez de escribir en el anterior.
  useEffect(() => {
    convIdRef.current = activeConversation?.id || null
  }, [activeConversation?.id])

  useEffect(() => {
    // Foco en el campo de escritura al cargar (en escritorio; en móvil evita abrir teclado de golpe)
    if (typeof window !== 'undefined' && window.innerWidth > 768) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
    return () => {
      if (pumpRef.current != null) cancelAnimationFrame(pumpRef.current)
      // Cancela el stream si el componente se desmonta (navegación rápida)
      abortRef.current?.abort()
    }
  }, [lang])

  // Persiste modos en localStorage
  useEffect(() => { try { if (webMode) localStorage.setItem('daya_web', '1'); else localStorage.removeItem('daya_web') } catch {} }, [webMode])
  useEffect(() => { try { localStorage.setItem('daya_think', thinkLevel) } catch {} }, [thinkLevel])
  useEffect(() => { try { if (researchMode) localStorage.setItem('daya_research', '1'); else localStorage.removeItem('daya_research') } catch {} }, [researchMode])

  // Carga imágenes guardadas desde el backend para restaurarlas en el chat al recargar
  useEffect(() => {
    const tok = useAuthStore.getState().token
    if (!tok) return
    fetch(`${API}/api/images`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : [])
      .then((imgs: any[]) => {
        if (!imgs.length) return
        setGenImages(prev => {
          const next = { ...prev }
          imgs.forEach(img => { if (img.messageId && !next[img.messageId]) next[img.messageId] = { prompt: img.prompt, model: img.model, url: img.url } })
          return next
        })
      })
      .catch(() => {})
  }, [])

  // Al enviar el usuario un mensaje: baja al fondo (para ver "Pensando…") y se
  // considera "pegado al fondo", así la respuesta que sigue se irá siguiendo sola.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user') return
    atBottomRef.current = true
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Mientras Daya escribe: si el usuario está pegado al fondo, seguimos la respuesta
  // hacia abajo (instantáneo, sin lag). Si subió a leer, NO lo movemos — puede leer
  // tranquilo y el botón ↓ lo devuelve al final cuando quiera.
  useEffect(() => {
    if (!streamingContent || !atBottomRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [streamingContent])

  useEffect(() => {
    if (textareaRef.current) {
      const cap = typeof window !== 'undefined' && window.innerWidth < 768 ? 130 : 200
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, cap) + 'px'
    }
    // Guardar borrador para restaurarlo si el usuario navega y vuelve
    try {
      if (input) sessionStorage.setItem('daya_draft', input)
      else sessionStorage.removeItem('daya_draft')
    } catch {}
  }, [input])

  // El cierre al hacer clic fuera lo maneja un fondo invisible (ver más abajo),
  // que es totalmente fiable y no interfiere con el clic en las opciones.

  // Genera el documento (con o sin respuestas de las preguntas) y muestra la tarjeta
  const runDocGeneration = useCallback(async (prompt: string, docType: string, answers: Record<string, string>) => {
    if (sendingRef.current) return   // evita doble documento por doble clic en el panel
    sendingRef.current = true
    setLoading(true)
    try {
      const res = await fetchWithTimeout(`${API}/api/documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, docType, language: 'es', answers })
      }, 120000)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setLoading(false)
        // Prioriza el mensaje REAL del backend (p.ej. "Alcanzaste tu límite de
        // documentos. Mejora tu plan…"). Solo si no viene, cae al genérico.
        const content = errData.error
          || (res.status === 429 ? 'Vas muy rápido creando documentos. Espera unos segundos e intenta de nuevo.' : 'No pude generar el documento. Intenta de nuevo.')
        addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content, createdAt: new Date().toISOString() })
        return
      }
      const data = await res.json()
      setLoading(false)
      if (data.success) {
        // Tarjeta del documento. Guardamos el previewHTML en memoria de la sesión
        // (es pesado para persistir) y usamos un marcador __DOCJSON__ que SÍ se guarda
        // en el historial, para que el documento reaparezca al reabrir el chat.
        const cardData = { docType, fileName: data.fileName, downloadUrl: data.downloadUrl }
        const marker = `__DOCJSON__${JSON.stringify(cardData)}`
        setDocMessages((prev: any) => ({ ...prev, [data.downloadUrl]: { ...cardData, previewHTML: data.previewHTML } }))
        addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: marker, createdAt: new Date().toISOString() })

        // Persistir en el historial (crea conversación si no había)
        try {
          const { chatAPI } = await import('../../lib/api')
          const convId = useChatStore.getState().activeConversation?.id || convIdRef.current || undefined
          const r = await chatAPI.saveDocNote({ conversationId: convId, prompt, marker })
          if (r.data?.conversationId) {
            convIdRef.current = r.data.conversationId
            if (!useChatStore.getState().activeConversation) {
              setActiveId({ id: r.data.conversationId, title: r.data.title || data.fileName, model: 'claude', mode: 'SINGLE', updatedAt: new Date().toISOString() })
            }
            chatAPI.getConversations().then((rr: any) => setConversations(rr.data)).catch(() => {})
          }
        } catch {}
      } else {
        addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: `No pude generar el documento: ${data.error || 'Error'}. Intenta de nuevo.`, createdAt: new Date().toISOString() })
      }
    } catch (e: any) {
      setLoading(false)
      const timedOut = e?.name === 'AbortError'
      addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: timedOut
        ? 'La creación del documento tardó demasiado. Suele pasar con temas muy largos: intenta de nuevo o pídelo más corto.'
        : 'No pude conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', createdAt: new Date().toISOString() })
    } finally { sendingRef.current = false }
  }, [token, addMessage])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    // Guard SÍNCRONO contra doble disparo (Enter + clic, repetición de tecla, doble
    // render). isLoading es estado asíncrono: NO bloquea dos llamadas en el mismo tick,
    // así que el mensaje (y el POST al modelo) se duplicaba. sendingRef sí lo bloquea.
    if ((!msg && attachedFiles.length === 0) || isLoading || sendingRef.current) return
    sendingRef.current = true
    try {
    if (msg) lastUserMsgRef.current = msg

    // Estado del indicador de escritura para ESTE turno: el modelo aún no se sabe
    // (lo dirá el backend) y aquí ya se puede oler si lo que se pide es un documento.
    setActiveModel('')
    setDocPending(detectDocumentRequest(msg).isDoc)

    // Limpia la barra de escritura de inmediato al enviar, en TODOS los flujos,
    // para que el texto no se quede ahí (ni se reenvíe sin querer). El contenido
    // ya quedó capturado en `msg` / `attachedFiles` arriba.
    setInput('')
    try { sessionStorage.removeItem('daya_draft') } catch {}
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // ===== URL AUTOMÁTICA: si el mensaje contiene una URL, se lee la página =====
    // Endpoint propio /api/read-url (ya no usa el agente).
    const hasURL = /https?:\/\/[^\s]{4,}/i.test(msg)
    if (hasURL && !webMode && attachedFiles.length === 0) {
      addMessage({ id: Date.now().toString(), role: 'user', content: msg, createdAt: new Date().toISOString() })
      setLoading(true)
      setResearchStatus('Leyendo página…')
      try {
        const tok = useAuthStore.getState().token
        const res = await fetch(`${API}/api/read-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ message: msg }),
        })
        const data = await res.json().catch(() => ({}))
        const answer = data?.answer
        setLoading(false); setResearchStatus('')
        addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: answer || 'No pude leer la página. Intenta con otra URL.', createdAt: new Date().toISOString() })
      } catch {
        setLoading(false); setResearchStatus('')
        addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: 'No pude acceder a esa URL. Verifica que sea pública e intenta de nuevo.', createdAt: new Date().toISOString() })
      }
      return
    }

    // ===== MODO WEB (toggle "+") =====
    // El modo web NO se intercepta aquí: viaja como flag a /api/chat/send (más
    // abajo, en doStream) para reusar el streaming/typewriter/persistencia del
    // chat normal. El backend fuerza la búsqueda con searchAndRank y anexa las
    // fuentes. Solo nos aseguramos de que webMode tenga prioridad sobre la
    // detección automática de research/imagen (ver guardas con !webMode abajo).

    // ===== INVESTIGACIÓN PROFUNDA — SOLO MANUAL (botón "Research" del "+") =====
    // Nunca se dispara sola: es pesada (multi-ronda). Solo si researchMode está ON.
    // (La búsqueda web sí es auto+manual; eso lo maneja el backend con needsWebSearch.)
    let userMsgAlreadyAdded = false
    if (!webMode && researchMode && msg) {
      const userMsgId = Date.now().toString()
      addMessage({ id: userMsgId, role: 'user', content: msg, createdAt: new Date().toISOString() })
      userMsgAlreadyAdded = true
      setLoading(true)
      setResearchStatus('Consultando fuentes...')
      try {
        const token = useAuthStore.getState().token
        const res = await fetch(`${API}/api/chat/deep-research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ topic: msg }),
        })
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            let data: any
            try { data = JSON.parse(line.slice(6)) } catch { continue }
            if (data.status) setResearchStatus(data.status)
            if (data.error) {
              // Si la investigación no está disponible, caer al chat normal
              setResearchStatus('')
              throw new Error('fallback')
            }
            if (data.done) {
              const sourcesText = data.sources?.length
                ? `\n\n---\n**Fuentes consultadas:** ${data.sources.length} referencias`
                : ''
              addMessage({ id: Date.now().toString(), role: 'assistant', content: `# ${data.title}\n\n${data.markdown}${sourcesText}`, createdAt: new Date().toISOString() })
            }
          }
        }
        setLoading(false)
        setResearchStatus('')
        return
      } catch (e: any) {
        // Si falla (sin key u otro error), continúa como chat normal abajo
        setResearchStatus('')
        if (e.message !== 'fallback') {
          setLoading(false)
          addMessage({ id: Date.now().toString(), role: 'assistant', content: 'Hubo un error al investigar. Intenta de nuevo.', createdAt: new Date().toISOString() })
          return
        }
        // fallback: sigue al chat normal (no return)
      }
    }

    const filesToSend = [...attachedFiles]
    setInput('')
    setAttachedFiles([])

    const userMsgId = Date.now().toString()
    // Preparar los adjuntos para que SE VEAN en el chat: las imágenes como
    // miniatura (data URL) y los demás archivos como tarjeta con su nombre.
    const imgDataUrls: string[] = []
    const fileChips: { name: string; type: string }[] = []
    for (const f of filesToSend) {
      if (f.type.startsWith('image/')) {
        try {
          const url = await new Promise<string>((resolve, reject) => {
            const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(f)
          })
          imgDataUrls.push(url)
        } catch { /* si falla la lectura, se omite la miniatura */ }
      } else {
        fileChips.push({ name: f.name, type: f.type })
      }
    }
    // No re-añadir la burbuja del usuario si el flujo de research ya la añadió
    // (research falló y cayó al chat normal). Sin esto el mensaje aparecía DOS veces.
    if (!userMsgAlreadyAdded) addMessage({
      id: userMsgId, role: 'user', content: msg, createdAt: new Date().toISOString(),
      images: imgDataUrls.length ? imgDataUrls : undefined,
      files: fileChips.length ? fileChips : undefined,
    })
    setLoading(true)
    clearStream()

    // ===== MODO IMAGEN: abre el panel de preguntas inteligentes (formato + estilo) =====
    // Activa si imgMode está ON, o si el mensaje pide una imagen explícitamente.
    const autoImgPrompt = (!imgMode && !webMode) ? detectImageGeneration(msg) : null
    if ((imgMode || autoImgPrompt) && msg && filesToSend.length === 0) {
      setLoading(false)
      runImageGen(autoImgPrompt ?? msg, [])
      return
    }

    // ===== BÚSQUEDA DE IMÁGENES (Wikimedia Commons) =====
    const imgQuery = detectImageSearch(msg)
    if (imgQuery && filesToSend.length === 0) {
      setLoading(false)
      const imgMsgId = (Date.now() + 1).toString()
      addMessage({ id: imgMsgId, role: 'assistant', content: `__IMGSEARCH__${imgMsgId}`, createdAt: new Date().toISOString() })
      setImageMessages(prev => ({ ...prev, [imgMsgId]: { query: imgQuery } }))
      searchWikimediaImages(imgQuery)
        .then(images => setImageMessages(prev => ({ ...prev, [imgMsgId]: { query: imgQuery, images } })))
        .catch(() => setImageMessages(prev => ({ ...prev, [imgMsgId]: { query: imgQuery, error: true } })))
      return
    }


    // ===== SUBIDA Y LECTURA DE ARCHIVOS =====
    if (filesToSend.length > 0) {
      const file = filesToSend[0]

      // Si es IMAGEN → análisis visual (vision) vía chat streaming
      if (file.type.startsWith('image/')) {
        try {
          const base64 = imgDataUrls[0] || await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
          await sendMessageStream(
            { message: msg || 'Analiza esta imagen en detalle: describe su contenido, y si tiene fórmulas, diagramas o texto, interprétalos.', model: 'claude', mode: 'SINGLE', conversationId: activeConversation?.id, imageData: base64 },
            appendStream,
            async (conversationId) => {
              setLoading(false)
              const { useChatStore } = await import('../../store')
              const finalContent = useChatStore.getState().streamingContent
              if (finalContent) {
                addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: finalContent, createdAt: new Date().toISOString() })
                clearStream()
              }
              if (!activeConversation) setActiveId({ id: conversationId, title: (msg || 'Análisis de imagen').slice(0, 60), model: 'claude', mode: 'SINGLE', updatedAt: new Date().toISOString() })
            },
            (err) => { setLoading(false); addMessage({ id: Date.now().toString(), role: 'assistant', content: 'No pude analizar la imagen. Inténtalo de nuevo.', createdAt: new Date().toISOString() }) }
          )
        } catch {
          addMessage({ id: Date.now().toString(), role: 'assistant', content: 'No pude analizar la imagen.', createdAt: new Date().toISOString() })
        } finally {
          setLoading(false)
        }
        return
      }

      // Si es AUDIO → transcripción + acta con audiointel
      if (file.type.startsWith('audio/')) {
        try {
          const formData = new FormData()
          formData.append('audio', file)
          const res = await fetchWithTimeout(`${API}/api/audiointel/process`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          }, 120000)
          const data = await res.json()
          setLoading(false)
          if (data.success && data.insight) {
            const ins = data.insight
            const lines: string[] = []
            if (ins.summary) lines.push(`**Resumen:** ${ins.summary}`)
            if (ins.actionItems?.length) {
              lines.push('\n**Tareas:**')
              ins.actionItems.forEach((a: any) => lines.push(`- [ ] ${a.task}${a.owner ? ` — ${a.owner}` : ''}${a.due ? ` (${a.due})` : ''}`))
            }
            if (ins.decisions?.length) {
              lines.push('\n**Decisiones:**')
              ins.decisions.forEach((d: string) => lines.push(`- ${d}`))
            }
            if (ins.openQuestions?.length) {
              lines.push('\n**Preguntas abiertas:**')
              ins.openQuestions.forEach((q: string) => lines.push(`- ${q}`))
            }
            if (data.transcript) lines.push(`\n---\n_Transcripción:_ ${data.transcript.slice(0, 2000)}${data.transcript.length > 2000 ? '…' : ''}`)
            addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: lines.join('\n'), createdAt: new Date().toISOString() })
          } else {
            addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: `No pude procesar el audio: ${data.error || 'error desconocido'}.`, createdAt: new Date().toISOString() })
          }
        } catch {
          setLoading(false)
          addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: 'No pude procesar el audio. Verifica tu conexión o el formato del archivo.', createdAt: new Date().toISOString() })
        }
        return
      }

      try {
        // Procesa el primer archivo (el más relevante)
        const file = filesToSend[0]
        const formData = new FormData()
        formData.append('file', file)
        formData.append('action', 'analyze')
        formData.append('question', msg || '¿De qué trata este documento? Resúmelo y destaca lo más importante.')

        const res = await fetchWithTimeout(`${API}/api/documents/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }, 90000)
        if (!res.ok && res.status !== 200) {
          const errData = await res.json().catch(() => ({}))
          setLoading(false)
          const tooBig = res.status === 413
          addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: tooBig
            ? 'El archivo es demasiado grande (máximo 10 MB). Prueba con uno más liviano.'
            : `No pude leer el archivo: ${errData.error || 'el servidor respondió con un error'}.`, createdAt: new Date().toISOString() })
          return
        }
        const data = await res.json()
        setLoading(false)

        if (data.success) {
          const r = data.result
          // El análisis puede venir en distintos campos según la acción
          const analysisText = r?.summary || r?.analysis || r?.answer || r?.content ||
            (typeof r === 'string' ? r : JSON.stringify(r, null, 2))
          const meta = data.metadata
          const metaLine = meta
            ? `\n\n_📄 ${data.fileName} · ${meta.type}${meta.pages ? ` · ${meta.pages} págs` : ''}${meta.rows ? ` · ${meta.rows} filas` : ''} · ${meta.wordCount} palabras_`
            : ''
          addMessage({
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: analysisText + metaLine,
            createdAt: new Date().toISOString(),
          })
        } else {
          addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: `No pude leer el archivo: ${data.error || 'Error desconocido'}.`, createdAt: new Date().toISOString() })
        }
        return
      } catch (e: any) {
        setLoading(false)
        const timedOut = e?.name === 'AbortError'
        addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: timedOut
          ? 'El archivo tardó demasiado en procesarse. Si es muy grande o tiene muchas páginas, prueba con uno más corto.'
          : 'No pude subir el archivo. Revisa tu conexión e inténtalo de nuevo.', createdAt: new Date().toISOString() })
        return
      }
    }

    // Code generation — abre el panel de preguntas inteligentes (lenguaje, alcance,
    // framework) y al confirmar/saltar genera el código por el chat normal.
    if (detectCodeRequest(msg) && filesToSend.length === 0) {
      setLoading(false)
      sendChatDirect(msg)
      return
    }

    // Document generation — abre el panel de preguntas inteligentes (tono, extensión,
    // estructura) y al confirmar/saltar genera con runDocGeneration.
    const docRequest = detectDocumentRequest(msg)
    if (docRequest.isDoc) {
      setLoading(false)
      runDocGeneration(msg, docRequest.docType || 'pdf', {})
      return
    }

    // Normal chat — continua SIEMPRE la conversacion activa (sea nueva o abierta del historial)
    const currentConvId = activeConversation?.id || convIdRef.current || undefined

    // Optimistic sidebar: si es un chat nuevo, lo añadimos al sidebar de inmediato
    // con un título provisional. El backend lo reemplaza con el título real al terminar.
    if (!currentConvId) {
      const optimisticId = `optimistic-${Date.now()}`
      const optimisticTitle = msg.slice(0, 50) || 'Nueva conversación'
      setConversations([
        { id: optimisticId, title: optimisticTitle, model: 'claude', mode: 'SINGLE', updatedAt: new Date().toISOString() },
        ...useChatStore.getState().conversations,
      ])
    }

    resetTypewriter()
    stoppedRef.current = false
    abortRef.current = new AbortController()

    const doStream = async (isRetry = false) => {
      resetTypewriter()
      reasoningRef.current = ''
      setStreamReasoning('')
      await sendMessageStream(
        { message: msg, model: 'claude', mode: 'SINGLE', conversationId: convIdRef.current || currentConvId, webMode: webMode || undefined, thinkLevel: thinkLevel !== 'normal' ? thinkLevel : undefined },
        feedStream,
        async (conversationId, failed, title) => {
          convIdRef.current = conversationId

          // Corte manual (Detener): handleStop ya guardó el parcial y limpió. No
          // re-añadir ni reintentar.
          if (stoppedRef.current) { stoppedRef.current = false; abortRef.current = null; return }

          const finalContent = await waitTypewriterDone()
          abortRef.current = null

          // Auto-reintento transparente: si falló y es el primer intento, reintenta 1 vez
          if ((failed || !finalContent?.trim()) && !isRetry) {
            clearStream()
            await new Promise(r => setTimeout(r, 800))
            return doStream(true)
          }

          setLoading(false)
          if (failed || !finalContent?.trim()) {
            clearStream()
            if (failed) addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: 'No pude generar una respuesta. Revisa tu conexión e intenta de nuevo.', createdAt: new Date().toISOString() })
            return
          }

          const newMsgId = (Date.now()+1).toString()
          if (reasoningRef.current.trim()) setMsgReasoning(prev => ({ ...prev, [newMsgId]: reasoningRef.current.trim() }))
          addMessage({ id: newMsgId, role: 'assistant', content: finalContent, createdAt: new Date().toISOString() })
          clearStream()

          // TTS: en modo voz, Daya lee la respuesta en voz alta
          if (chatMode === 'voice' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const clean = finalContent.replace(/[#*`_~\[\]>|]/g, '').slice(0, 2000)
            const utt = new SpeechSynthesisUtterance(clean)
            utt.lang = lang === 'en' ? 'en-US' : 'es-ES'; utt.rate = 1.05; utt.pitch = 1
            window.speechSynthesis.cancel()
            window.speechSynthesis.speak(utt)
          }

          const { useChatStore } = await import('../../store')
          const convTitle = title || msg.slice(0, 60)
          if (!useChatStore.getState().activeConversation) {
            setActiveId({ id: conversationId, title: convTitle, model: 'claude', mode: 'SINGLE', updatedAt: new Date().toISOString() })
          }
          const { chatAPI } = await import('../../lib/api')
          chatAPI.getConversations().then(r => setConversations(r.data)).catch(() => {})
          // Avisa a las demás pestañas: ya está guardado en el servidor, así que
          // cuando lo pidan tendrán el intercambio completo.
          publish({ type: 'messages', convId: conversationId })
          if (typeof window !== 'undefined' && window.innerWidth > 768) textareaRef.current?.focus()
        },
        (error) => {
          setLoading(false)
          abortRef.current = null
          if (stoppedRef.current) { stoppedRef.current = false; return }
          // Mostrar el motivo REAL (p.ej. "Alcanzaste tu límite de mensajes") en vez de
          // un genérico de conexión que confunde cuando el problema es la cuota.
          addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: error || 'Algo salió mal. Revisa tu conexión e inténtalo de nuevo.', createdAt: new Date().toISOString() })
        },
        abortRef.current?.signal,
        // Capa 2: el backend detectó una petición de imagen → abrir el panel
        (prompt) => {
          abortRef.current = null
          clearStream()
          setLoading(false)
          runImageGen(prompt, [])
          // El sidebar optimista quedaría huérfano (el backend no creó conversación): refrescar
          import('../../lib/api').then(({ chatAPI }) => chatAPI.getConversations().then(r => setConversations(r.data)).catch(() => {}))
        },
        // Razonamiento en vivo (modo Profundo) → bloque plegable
        (r) => { reasoningRef.current += r; setStreamReasoning(reasoningRef.current) },
        // Modelo elegido por el enrutador → el indicador lo nombra
        (m) => setActiveModel(m),
        // Herramienta en marcha → se dice EN CASTELLANO lo que está haciendo.
        // Llega antes del primer token, así que llena el silencio de los
        // segundos en que Daya está buscando o creando algo.
        (tool) => setResearchStatus(TOOL_LABEL[tool] || 'Trabajando…')
      )
    }
    await doStream()
    } finally { sendingRef.current = false }
  }, [input, isLoading, activeConversation, attachedFiles, token, messages.length, feedStream, resetTypewriter, waitTypewriterDone, chatMode, addMessage, setInput])

  // Envía un prompt enriquecido directamente al chat (para los flujos de preguntas de código)
  const sendChatDirect = useCallback(async (enrichedPrompt: string) => {
    if (isLoading || sendingRef.current) return
    sendingRef.current = true
    setLoading(true)
    resetTypewriter()
    stoppedRef.current = false
    abortRef.current = new AbortController()
    const currentConvId = activeConversation?.id || convIdRef.current || undefined
    try {
    await sendMessageStream(
      { message: enrichedPrompt, model: 'claude', mode: 'SINGLE', conversationId: currentConvId },
      feedStream,
      async (conversationId, failed, title) => {
        convIdRef.current = conversationId
        if (stoppedRef.current) { stoppedRef.current = false; abortRef.current = null; return }
        const finalContent = await waitTypewriterDone()
        abortRef.current = null
        setLoading(false)
        if (!failed && finalContent?.trim()) {
          addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: finalContent, createdAt: new Date().toISOString() })
          clearStream()
        }
        const { useChatStore } = await import('../../store')
        if (!useChatStore.getState().activeConversation) {
          setActiveId({ id: conversationId, title: title || enrichedPrompt.slice(0, 60), model: 'claude', mode: 'SINGLE', updatedAt: new Date().toISOString() })
        }
        const { chatAPI } = await import('../../lib/api')
        chatAPI.getConversations().then(r => setConversations(r.data)).catch(() => {})
      },
      () => {
        setLoading(false)
        abortRef.current = null
        if (stoppedRef.current) { stoppedRef.current = false; return }
        addMessage({ id: Date.now().toString(), role: 'assistant', content: 'No pude generar el código. Inténtalo de nuevo.', createdAt: new Date().toISOString() })
      },
      abortRef.current?.signal
    )
    } finally { sendingRef.current = false }
  }, [isLoading, activeConversation, feedStream, resetTypewriter, waitTypewriterDone, addMessage, clearStream, setActiveId, setConversations])

  // Regenera la última respuesta de Daya: quita la respuesta anterior y reenvía
  // el último mensaje del usuario en la misma conversación.
  const handleRegenerate = useCallback(async () => {
    if (isLoading || sendingRef.current) return
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    sendingRef.current = true

    const { setMessages } = useChatStore.getState()
    // Quitar de la VISTA la última respuesta del asistente, guardándola por si la
    // regeneración falla (el backend ya no la borra hasta que la nueva tenga éxito).
    const msgs = [...messages]
    const removed: typeof messages = []
    while (msgs.length && msgs[msgs.length - 1].role === 'assistant') removed.unshift(msgs.pop()!)
    setMessages(msgs)

    setLoading(true)
    stoppedRef.current = false
    abortRef.current = new AbortController()
    const currentConvId = activeConversation?.id || convIdRef.current || undefined
    const restorePrev = () => setMessages([...useChatStore.getState().messages, ...removed])

    resetTypewriter()
    try {
      await sendMessageStream(
        { message: lastUser.content, model: 'claude', mode: 'SINGLE', conversationId: currentConvId, regenerate: true },
        feedStream,
        async (conversationId, failed) => {
          convIdRef.current = conversationId
          // Corte manual: handleStop ya guardó el parcial. No re-añadir ni restaurar.
          if (stoppedRef.current) { stoppedRef.current = false; abortRef.current = null; return }
          const finalContent = await waitTypewriterDone()
          abortRef.current = null
          setLoading(false)
          if (failed || !finalContent?.trim()) {
            clearStream()
            restorePrev()   // se conserva la respuesta anterior
            toast('No pude regenerar la respuesta. Se mantuvo la anterior.', 'error')
            return
          }
          addMessage({ id: (Date.now()+1).toString(), role: 'assistant', content: finalContent, createdAt: new Date().toISOString() })
          clearStream()
        },
        (error) => {
          setLoading(false)
          abortRef.current = null
          if (stoppedRef.current) { stoppedRef.current = false; return }
          restorePrev()
          toast('Algo salió mal al regenerar. Se mantuvo la respuesta anterior.', 'error')
        },
        abortRef.current?.signal
      )
    } finally { sendingRef.current = false }
  }, [isLoading, messages, activeConversation, feedStream, resetTypewriter, waitTypewriterDone, addMessage, clearStream])


  const toggleRecording = () => {
    if (isRecording) { try { recognitionRef.current?.stop() } catch { } setIsRecording(false); return }
    const SR: any = (typeof window !== 'undefined') && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    if (!SR) { toast('Tu navegador no soporta el dictado por voz. Prueba con Chrome o Edge.', 'error'); return }
    try {
      const rec = new SR()
      rec.lang = 'es-ES'
      rec.continuous = true
      rec.interimResults = true
      // Texto que ya había en la barra: lo dictado se va añadiendo a esto, en vivo.
      speechBaseRef.current = input ? input + ' ' : ''
      rec.onresult = (e: any) => {
        let txt = ''
        for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript
        setInput((speechBaseRef.current + txt).replace(/[ \t]+/g, ' ').trimStart())
      }
      rec.onerror = (e: any) => {
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') toast('Permite el micrófono en tu navegador para dictar.', 'error')
        setIsRecording(false)
      }
      rec.onend = () => { setIsRecording(false) }
      recognitionRef.current = rec
      rec.start()
      setIsRecording(true)
    } catch { toast('No se pudo iniciar el dictado por voz.', 'error'); setIsRecording(false) }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files)
    const tooBig = arr.filter(f => f.size >= 10 * 1024 * 1024)
    if (tooBig.length) toast(`${tooBig.length === 1 ? 'Un archivo supera' : 'Algunos archivos superan'} el límite de 10 MB y no se adjuntó${tooBig.length === 1 ? '' : 'aron'}.`, 'error')
    setAttachedFiles(prev => [...prev, ...arr.filter(f => f.size < 10 * 1024 * 1024)].slice(0, 5))
  }

  const openFilePicker = (accept: string) => {
    setPlusOpen(false)
    const el = document.createElement('input')
    el.type = 'file'; el.accept = accept; el.multiple = true
    el.onchange = (ev) => handleFiles((ev.target as HTMLInputElement).files)
    el.click()
  }

  const isEmpty = messages.length === 0 && !streamingContent
  const firstName = user?.name?.split(' ')[0] || ''

  // "Proyectos" generados en esta conversación (imágenes, código, documentos).
  // Se listan en el menú del título del chat: llevar al mensaje + descargar.
  type Project = { id: string; kind: 'image' | 'code' | 'doc'; label: string; url?: string; downloadUrl?: string }
  const projects: Project[] = []
  for (const m of messages) {
    const c = m.content
    if (c.startsWith('__IMGGEN__|')) {
      const segs = c.slice('__IMGGEN__|'.length).split('|')
      const url = (segs.length >= 3 && /^https?:/i.test(segs[segs.length - 1])) ? segs[segs.length - 1] : genImages[m.id]?.url
      projects.push({ id: m.id, kind: 'image', label: 'Imagen', url })
    } else if (c.startsWith('__DOCJSON__')) {
      try { const p = JSON.parse(c.replace('__DOCJSON__', '')); projects.push({ id: m.id, kind: 'doc', label: p.fileName || 'Documento', downloadUrl: p.downloadUrl }) }
      catch { projects.push({ id: m.id, kind: 'doc', label: 'Documento' }) }
    }
    else if (c.startsWith('__DOC__')) { const dd = docMessages[c.replace('__DOC__', '')]; projects.push({ id: m.id, kind: 'doc', label: dd?.fileName || 'Documento', downloadUrl: dd?.downloadUrl }) }
    else if (m.role === 'assistant' && !c.startsWith('__') && /```[\s\S]*?```/.test(c)) projects.push({ id: m.id, kind: 'code', label: 'Código' })
  }

  const scrollToMsg = (id: string) => {
    document.getElementById('m-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Descargar un elemento creado desde el propio menú del chat.
  const downloadProject = (p: Project) => {
    if (p.kind === 'image' && p.url) { downloadImage(p.url, `${(p.label || 'imagen')}.png`); return }
    if (p.kind === 'doc' && p.downloadUrl) {
      // downloadUrl es una ruta relativa del backend: hay que prefijar API (como en DocumentMessage)
      const href = /^https?:/i.test(p.downloadUrl) ? p.downloadUrl : `${API}${p.downloadUrl}`
      const a = document.createElement('a'); a.href = href; a.download = p.label || 'documento'; document.body.appendChild(a); a.click(); a.remove(); return
    }
    scrollToMsg(p.id)  // código u otros: llevar al mensaje (tiene su propio botón de descarga)
  }

  // Renombrar / fijar el chat activo desde el menú del título.
  const chatTitle = activeConversation?.title || 'Conversación'
  const chatIsPinned = !!(activeConversation as any)?.pinned
  const commitTitleRename = async () => {
    const title = titleDraft.trim()
    setRenaming(false); setTitleMenuOpen(false)
    if (!title || !activeConversation) return
    setActiveConversation({ ...activeConversation, title } as any)
    setConversations(useChatStore.getState().conversations.map(c => c.id === activeConversation.id ? { ...c, title } : c))
    try { const { chatAPI } = await import('../../lib/api'); await chatAPI.renameConversation(activeConversation.id, title) } catch {}
  }
  const toggleChatPin = async () => {
    setTitleMenuOpen(false)
    if (!activeConversation) return
    const next = !chatIsPinned
    setActiveConversation({ ...activeConversation, pinned: next } as any)
    const updated = useChatStore.getState().conversations.map(c => c.id === activeConversation.id ? { ...c, pinned: next } : c)
    updated.sort((a: any, b: any) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    setConversations(updated)
    try { const { chatAPI } = await import('../../lib/api'); await chatAPI.pinConversation(activeConversation.id, next) } catch {}
  }

  // Exporta la conversación como un PDF editorial (motor en lib/pdfExport.ts).
  // El módulo (jsPDF incluido) se carga bajo demanda para no inflar el bundle inicial.
  // ── Compartir la conversación por enlace ──────────────────────────────────
  const shareUrl = (slug: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${slug}`

  // Al abrir el menú se consulta si ya hay enlace vivo, para que el botón diga
  // "Compartir" o "Dejar de compartir" sin adivinarlo.
  useEffect(() => {
    const id = activeConversation?.id
    if (!titleMenuOpen || !id) return
    shareAPI.status(id).then(r => setShareSlug(r.data?.slug || null)).catch(() => {})
  }, [titleMenuOpen, activeConversation?.id])

  useEffect(() => { setShareSlug(null) }, [activeConversation?.id])

  const toggleShare = useCallback(async () => {
    const id = activeConversation?.id
    if (!id || sharing) return
    setSharing(true)
    try {
      if (shareSlug) {
        await shareAPI.unshare(id)
        setShareSlug(null)
        toast('El enlace ya no funciona.', 'success')
      } else {
        const r = await shareAPI.share(id)
        const slug = r.data?.slug
        if (!slug) throw new Error('sin slug')
        setShareSlug(slug)
        try {
          await navigator.clipboard?.writeText(shareUrl(slug))
          toast('Enlace copiado. Quien lo abra verá la conversación en solo lectura.', 'success')
        } catch {
          toast('Enlace creado.', 'success')
        }
      }
    } catch {
      toast('No se pudo cambiar el enlace. Inténtalo de nuevo.', 'error')
    } finally { setSharing(false) }
  }, [activeConversation?.id, shareSlug, sharing])

  // Los cuatro formatos comparten los mismos mensajes del store. El PDF es el
  // único que tarda (compone un documento editorial con jsPDF); los otros tres
  // son texto y se descargan al instante.
  const runExport = useCallback(async (format: ExportFormat) => {
    if (!messages.length || exporting) return
    const title = activeConversation?.title || 'Conversación'
    const userLabel = user?.name?.split(' ')[0] || undefined
    const plain = messages.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt }))

    if (format !== 'pdf') {
      try {
        const ex = await import('../../lib/chatExport')
        if (format === 'md') ex.exportMarkdown(title, plain, userLabel)
        else if (format === 'json') ex.exportJson(title, plain)
        else ex.exportWord(title, plain, userLabel)
      } catch {
        toast('No se pudo exportar la conversación. Inténtalo de nuevo.', 'error')
      }
      return
    }

    setExporting(true)
    try {
      const { exportChatToPdf } = await import('../../lib/pdfExport')
      await exportChatToPdf({
        title,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        userLabel,
      })
    } catch {
      toast('No se pudo generar el PDF. Inténtalo de nuevo.', 'error')
    } finally {
      setExporting(false)
    }
  }, [messages, activeConversation, exporting, user])

  return (
    <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', overflowX: 'hidden', display: 'flex', flexDirection: 'row', height: '100%', background: 'var(--bg-base)', position: 'relative' }}>
    {activeConversation?.title && <PageTitle title={activeConversation.title} />}
    {/* ── Panel lateral de artefacto de código ── */}
    {artifact && (
      <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />
    )}
    {/* El aviso de "suelta aquí" se lleva por un contador de entrar/salir: con
        dragLeave a secas parpadeaba cada vez que el cursor pasaba por encima de
        un hijo (cada burbuja cuenta como salir del padre). Y solo se enciende si
        lo que se arrastra son ARCHIVOS: arrastrar texto o un enlace no cuenta. */}
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}
      onDragEnter={e => { if (!dragHasFiles(e)) return; dragDepth.current++; setDragOver(true) }}
      onDragOver={e => { if (!dragHasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDragLeave={e => { if (!dragHasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragOver(false) }}
      onDrop={e => { if (!dragHasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDragOver(false); handleFiles(e.dataTransfer.files) }}>

      {/* Visor grande del documento (panel tipo artefacto) */}
      <DocumentViewer doc={viewerDoc} onClose={() => setViewerDoc(null)} />

      {/* Lightbox de imágenes (ampliar al hacer clic) */}
      {lightbox && <ImageLightbox url={lightbox.url} prompt={lightbox.prompt} onClose={() => setLightbox(null)} />}

      {/* Borde superior (sin barra ni línea): nombre del chat con menú a la izquierda,
          Exportar a la derecha. No hacen scroll con el chat. */}
      {!isEmpty && (
        <div style={{ position: 'absolute', top: 8, left: 0, right: 0, zIndex: 30, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '0 14px', pointerEvents: 'none' }}>
          {/* Nombre del chat + menú (renombrar / fijar / ver y descargar lo creado) */}
          <div style={{ position: 'relative', pointerEvents: 'auto', maxWidth: '72%' }}>
            {renaming ? (
              <input autoFocus value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitTitleRename(); if (e.key === 'Escape') { setRenaming(false); setTitleMenuOpen(false) } }}
                onBlur={commitTitleRename}
                style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600, outline: 'none', fontFamily: 'var(--font-body)', width: 240, maxWidth: '100%' }} />
            ) : (
              <button onClick={() => setTitleMenuOpen(o => !o)} title={chatTitle}
                style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%', padding: '5px 7px 5px 10px', borderRadius: 8, background: titleMenuOpen ? 'var(--bg-elevated)' : 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'background 0.15s' }}
                onMouseEnter={e => { if (!titleMenuOpen) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                onMouseLeave={e => { if (!titleMenuOpen) e.currentTarget.style.background = 'transparent' }}>
                {chatIsPinned && <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent-500)', flexShrink: 0, opacity: 0.8 }}><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chatTitle}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6, transition: 'transform 0.18s ease', transform: titleMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            )}
            {titleMenuOpen && (
              <>
                <div onClick={() => setTitleMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, minWidth: 244, maxWidth: 300, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', padding: 6, zIndex: 40, animation: 'dayaScaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both', transformOrigin: 'top left' }}>
                  <button onClick={() => { setTitleDraft(activeConversation?.title || ''); setRenaming(true); setTitleMenuOpen(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Renombrar
                  </button>
                  <button onClick={toggleChatPin}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={chatIsPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
                    {chatIsPinned ? 'Quitar fijado' : 'Fijar chat'}
                  </button>
                  <button onClick={toggleShare} disabled={sharing}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: sharing ? 'default' : 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49"/></svg>
                    {sharing ? 'Un momento…' : shareSlug ? 'Dejar de compartir' : 'Compartir con un enlace'}
                  </button>
                  {shareSlug && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 4px 4px', padding: '7px 9px', borderRadius: 8, background: 'var(--bg-elevated)' }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.71rem', color: 'var(--text-tertiary)' }}>{shareUrl(shareSlug)}</span>
                      <button onClick={() => { navigator.clipboard?.writeText(shareUrl(shareSlug)).then(() => toast('Enlace copiado.', 'success')).catch(() => {}) }}
                        style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-secondary)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Copiar
                      </button>
                    </div>
                  )}
                  {projects.length > 0 && (
                    <>
                      <div style={{ height: 1, background: 'var(--border-default)', margin: '5px 8px' }} />
                      <div style={{ padding: '2px 10px 6px', fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Creado en este chat</div>
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {projects.map((p, i) => {
                          const meta = projMeta(p.kind)
                          const canDownload = (p.kind === 'image' && p.url) || (p.kind === 'doc' && p.downloadUrl)
                          return (
                            <div key={p.id + i} style={{ display: 'flex', alignItems: 'center', borderRadius: 8 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <button onClick={() => { scrollToMsg(p.id); setTitleMenuOpen(false) }} title={p.label}
                                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                                <span className="daya-proj-ico" style={{ background: meta.color + '1a', color: meta.color }}>{meta.icon}</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                              </button>
                              {canDownload && (
                                <button onClick={() => downloadProject(p)} title="Descargar" aria-label="Descargar"
                                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, marginRight: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', borderRadius: 7 }}
                                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          {/* Exportar la conversación: PDF editorial, Markdown, Word o JSON */}
          <div style={{ position: 'relative', pointerEvents: 'auto', flexShrink: 0 }}>
            <button onClick={() => setExportOpen(o => !o)} disabled={exporting} title={exporting ? 'Generando documento…' : 'Exportar conversación'} aria-label="Exportar conversación" aria-haspopup="menu" aria-expanded={exportOpen}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, minWidth: 32, padding: exporting ? '0 10px' : 0, borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-tertiary)', cursor: exporting ? 'default' : 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'all 0.15s', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}
              onMouseEnter={e => { if (!exporting) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-base)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
              {exporting ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: 'spin 0.9s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Generando documento…
                </>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              )}
            </button>
            {exportOpen && !exporting && (
              <>
                <div onMouseDown={() => setExportOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div role="menu" className="anim-rise" style={{ position: 'absolute', top: 38, right: 0, zIndex: 41, minWidth: 186, padding: 5, borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
                  {EXPORT_FORMATS.map(f => (
                    <button key={f.id} role="menuitem" onClick={() => { setExportOpen(false); runExport(f.id) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 700, minWidth: 34, fontSize: '0.7rem', letterSpacing: '0.03em', color: 'var(--text-tertiary)' }}>{f.ext}</span>
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Buscar dentro de esta conversación (Ctrl+F) */}
      {findOpen && !isEmpty && <ChatSearch messages={messages} onClose={() => setFindOpen(false)} />}

      {dragOver && (
        <div style={{ position: 'fixed', inset: 16, background: 'rgba(0,0,0,0.03)', border: '2px dashed var(--accent-500)', borderRadius: 16, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Suelta los archivos aquí</p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Imágenes, PDF o texto · hasta 10 MB cada uno</p>
        </div>
      )}

      <div ref={scrollRef} onScroll={(e) => {
        const el = e.currentTarget
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight
        // Pegado al fondo (con margen): mientras lo esté, Daya sigue bajando al escribir.
        // Si el usuario sube a leer, se despega y el auto-scroll se detiene.
        atBottomRef.current = dist < 120
        // Muestra el botón si el usuario se alejó más de 240px del final
        setShowScrollBtn(dist > 240)
      }} style={{ flex: 1, overflowY: 'auto', position: 'relative' }} aria-live="polite" aria-label="Conversación">
        {isEmpty ? (
          // El relleno inferior reserva el sitio del compositor, que flota sobre
          // esta capa: con 40px, en ventanas bajas las sugerencias se metían
          // debajo del cuadro de escribir y salían partidas a media frase.
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '48px 28px 150px', textAlign: 'center', position: 'relative' }}>
            <img src="/logo.png" alt="Daya" style={{ position: 'relative', width: 48, height: 48, objectFit: 'contain', filter: 'var(--logo-filter)', marginBottom: 20, animation: 'dayaRise 0.45s cubic-bezier(0.16,1,0.3,1) both' }} />
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', letterSpacing: '-0.01em', lineHeight: 1.1, color: 'var(--text-primary)', margin: '0 0 10px', animation: 'dayaRise 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s both' }}>
              {(() => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches' })()}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.93rem', animation: 'dayaRise 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>{t('howCanIHelp')}</p>
          </div>
        ) : (
          <div className="daya-chat-col daya-msgs-col" style={{ maxWidth: 720, margin: '0 auto', padding: '52px 24px 128px' }}
            onClick={(e) => {
              // Ampliar cualquier imagen del chat al hacer clic (incluidas las del
              // agente, que se renderizan como markdown dentro de .prose-daya).
              const el = e.target as HTMLElement
              if (el.tagName === 'IMG' && el.closest('.prose-daya')) {
                const im = el as HTMLImageElement
                setLightbox({ url: im.currentSrc || im.src, prompt: im.alt })
              }
            }}>
            {messages.map((msg, i) => {
              if (msg.content.startsWith('__DOC__')) {
                const docData = docMessages[msg.content.replace('__DOC__', '')]
                if (docData) return <div key={msg.id} id={'m-' + msg.id}><DocumentMessage {...docData} onOpen={setViewerDoc} /></div>
                return null
              }
              // Tarjeta de documento PERSISTIDA (reaparece al reabrir el chat del historial).
              // El previewHTML no se guarda (es pesado); si está en memoria de la sesión, se usa.
              if (msg.content.startsWith('__DOCJSON__')) {
                try {
                  const parsed = JSON.parse(msg.content.replace('__DOCJSON__', ''))
                  const live = parsed.downloadUrl ? docMessages[parsed.downloadUrl] : null
                  return <div key={msg.id} id={'m-' + msg.id}><DocumentMessage {...parsed} previewHTML={live?.previewHTML || parsed.previewHTML} onOpen={setViewerDoc} /></div>
                } catch { return null }
              }
              if (msg.content.startsWith('__IMGSEARCH__')) {
                const imgId = msg.content.replace('__IMGSEARCH__', '')
                return <ImageSearchMessage key={msg.id} data={imageMessages[imgId]} />
              }
              if (msg.content.startsWith('__IMGGEN__|')) {
                // Formato: __IMGGEN__|prompt|model[|url]. La URL (embebida al persistir
                // en el servidor) hace que la imagen sobreviva a la recarga sin depender
                // del estado genImages. Se parsea desde el final: prompt puede tener "|".
                const segs = msg.content.slice('__IMGGEN__|'.length).split('|')
                const contentUrl = (segs.length >= 3 && /^https?:/i.test(segs[segs.length - 1])) ? segs.pop() : undefined
                const contentModel = segs.pop() || 'flux'
                const contentPrompt = segs.join('|')
                const gdata = genImages[msg.id] ?? { prompt: contentPrompt, model: contentModel, url: contentUrl }
                return <div key={msg.id} id={'m-' + msg.id}><ImageGenMessage data={gdata} onZoom={(url, prompt) => setLightbox({ url, prompt })} onRegenerate={(model) => {
                  setGenImages(prev => ({ ...prev, [msg.id]: { prompt: gdata.prompt, model } }))
                  triggerImageGen(msg.id, gdata.prompt, model)
                }} /></div>
              }
              const isLastAssistant = i === messages.length - 1 && msg.role === 'assistant' && !isLoading && !streamingContent
              return (
                <div key={msg.id} id={'m-' + msg.id} style={{ animation: 'dayaRise 0.34s cubic-bezier(0.16,1,0.3,1) both' }}>
                  <MessageBubble message={msg} onRegenerate={isLastAssistant ? handleRegenerate : undefined} onArtifact={setArtifact} reasoning={msgReasoning[msg.id]}
                    prevUserContent={msg.role === 'assistant' ? [...messages.slice(0, i)].reverse().find(m => m.role === 'user')?.content : undefined} />
                </div>
              )
            })}
            {streamingContent && (
              <MessageBubble message={{ id: 'stream', role: 'assistant', content: streamingContent, createdAt: '' }} streaming onArtifact={setArtifact} reasoning={streamReasoning || undefined} />
            )}
            {isLoading && !streamingContent && <ThinkingIndicator deep={thinkLevel === 'deep'} web={webMode} doc={docPending} model={activeModel} status={researchStatus || undefined} />}

            <div ref={bottomRef} style={{ height: 16 }} />
          </div>
        )}
      </div>

      {/* Input */}
      {/* Botón flotante para volver al final del chat */}
      {!isEmpty && (
        <button onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowScrollBtn(false) }}
          aria-label="Ir al final"
          style={{
            position: 'absolute', bottom: 96, left: '50%',
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', zIndex: 30,
            transition: 'background 0.15s, color 0.15s, transform 0.22s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease',
            opacity: showScrollBtn ? 1 : 0,
            transform: showScrollBtn ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(8px)',
            pointerEvents: showScrollBtn ? 'auto' : 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(-50%) translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(-50%) translateY(0)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
        </button>
      )}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, padding: '20px 24px 18px', background: 'linear-gradient(to top, var(--bg-base) 64%, transparent)' }}>
        <div className="daya-chat-col" style={{ maxWidth: 720, margin: '0 auto', position: 'relative' }}>
          {attachedFiles.length > 0 && (
            <div className="stagger" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10, padding: '2px 2px' }}>
              {attachedFiles.map((file, i) => (
                <AttachmentChip key={i} file={file} onRemove={() => setAttachedFiles(p => p.filter((_, idx) => idx !== i))} />
              ))}
            </div>
          )}

          <div className={`daya-composer${isFocused ? ' daya-composer--focused' : ''}`}>
            <textarea ref={textareaRef} value={input}
              onChange={e => setInput(e.target.value.slice(0, 8000))}
              onPaste={e => {
                // Pega SIEMPRE como texto plano (sin formato/fuentes de origen)
                e.preventDefault()
                const text = e.clipboardData.getData('text/plain')
                const el = e.currentTarget
                const start = el.selectionStart ?? input.length
                const end = el.selectionEnd ?? input.length
                const next = (input.slice(0, start) + text + input.slice(end)).slice(0, 8000)
                setInput(next)
              }}
              onKeyDown={e => {
                // Ctrl+Enter (⌘+Enter en Mac) envía igual que Enter: es lo que
                // espera quien viene de otras apps y escribe con Shift+Enter.
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(); return }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                if (e.key === 'Escape') { e.preventDefault(); setInput(''); try { sessionStorage.removeItem('daya_draft') } catch {} }
              }}
              onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
              placeholder={researchStatus ? researchStatus : isRecording ? 'Escuchando...' : imgMode ? 'Describe la imagen que quieres generar…' : 'Escribe tu mensaje...'}
              rows={1} disabled={isRecording} maxLength={8000}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1.6, maxHeight: 200, fontFamily: 'var(--font-body)', caretColor: 'var(--accent-400)', paddingBottom: 2 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>

              {/* Lado izquierdo: +, Web, Research */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* + menu: Imagen, Audio, Documento */}
              <div style={{ position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); setPlusOpen(o => !o) }}
                  style={{ width: 30, height: 30, borderRadius: 8, background: attachedFiles.length > 0 ? 'rgba(0,0,0,0.04)' : 'transparent', border: 'none', cursor: 'pointer', color: attachedFiles.length > 0 ? 'var(--accent-400)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 300, lineHeight: 1, transition: 'all 0.15s' }}>
                  +
                </button>
                {plusOpen && (
                  <>
                    <div onClick={() => setPlusOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                  <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 6, boxShadow: 'var(--shadow-lg)', minWidth: 208, animation: 'dayaScaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both', transformOrigin: 'bottom left', zIndex: 20 }}>
                    {/* Buscar web */}
                    <button onClick={() => { setWebMode(o => !o) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', transition: 'background 0.1s', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {webMode
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/></svg>
                      }
                      Buscar web
                    </button>
                    {/* Research */}
                    <button onClick={() => { setResearchMode(o => !o) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', transition: 'background 0.1s', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {researchMode
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      }
                      Research
                    </button>
                    <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />
                    {/* Generar imagen */}
                    <button onClick={() => { setImgMode(o => !o); setPlusOpen(false); setTimeout(() => textareaRef.current?.focus(), 50) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', transition: 'background 0.1s', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {imgMode
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      }
                      Generar imagen
                    </button>
                    <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />
                    {[
                      { label: 'Subir imagen', accept: 'image/*', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
                      { label: 'Subir audio', accept: 'audio/*', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> },
                      { label: 'Subir documento', accept: '.pdf,.docx,.doc,.pptx,.xlsx,.csv,.xls,.txt,.md,.epub', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg> },
                    ].map(item => (
                      <button key={item.label} onClick={() => openFilePicker(item.accept)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', transition: 'background 0.1s', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ color: 'var(--text-tertiary)' }}>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  </>
                )}
              </div>

              {/* Píldoras de modo activo — visibilidad de estado; clic para desactivar.
                  Antes solo la imagen mostraba señal; web/research/agente cambiaban el
                  comportamiento en silencio al cerrarse el menú "+". */}
              {[
                { key: 'img', on: imgMode, off: () => setImgMode(false), label: 'Imagen',
                  icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
                { key: 'web', on: webMode, off: () => setWebMode(false), label: 'Web',
                  icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/></svg> },
                { key: 'research', on: researchMode, off: () => setResearchMode(false), label: 'Research',
                  icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> },
              ].filter(m => m.on).map(m => (
                <button key={m.key} onClick={m.off} title={`${m.label} activo — clic para desactivar`}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px 3px 8px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', animation: 'dayaRise 0.2s both' }}>
                  {m.icon}
                  {m.label}
                </button>
              ))}

              </div>


              {/* Task hint: qué tipo de tarea detecta Daya */}
              {input.trim().split(/\s+/).length >= 2 && (() => {
                const m = input.toLowerCase()
                let emoji = '', label = ''
                if (/código|code|programa|función|function|script|html|css|javascript|python|typescript|sql|bug|react|node|api/.test(m)) { emoji = '💻'; label = 'Código' }
                else if (/calcula|matemátic|ecuación|álgebra|porcentaje|\d\s*[+\-*/]\s*\d/.test(m)) { emoji = '🔢'; label = 'Matemáticas' }
                else if (/informe|reporte|documento|pdf|word|contrato|propuesta|presentación/.test(m)) { emoji = '📄'; label = 'Documento' }
                else if (/historia|cuento|poema|narrativa|ficción|creativamente/.test(m)) { emoji = '✍️'; label = 'Creativo' }
                else if (/analiza|compara|estrategia|investiga a|en detalle|paso a paso/.test(m)) { emoji = '🧠'; label = 'Análisis' }
                if (!label) return null
                return (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', whiteSpace: 'nowrap', animation: 'dayaRise 0.18s both' }}>
                    {emoji} {label}
                  </span>
                )
              })()}

              {/* Right — pensamiento + mic + send */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {/* Nivel de pensamiento (junto al micrófono, con flecha) */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setThinkOpen(o => !o)} title={`Pensamiento: ${thinkLevel === 'fast' ? 'Rápido' : thinkLevel === 'deep' ? 'Profundo' : 'Normal'}`} aria-label="Nivel de pensamiento" aria-expanded={thinkOpen}
                    style={{ height: 30, padding: '0 8px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, transition: 'color 0.15s, background 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{thinkLevel === 'fast' ? 'Rápido' : thinkLevel === 'deep' ? 'Profundo' : 'Normal'}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.18s ease', transform: thinkOpen ? 'rotate(180deg)' : 'rotate(0deg)', opacity: 0.7 }}><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {thinkOpen && (
                    <>
                      <div onClick={() => setThinkOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                      <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 6, boxShadow: 'var(--shadow-lg)', minWidth: 200, animation: 'dayaScaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both', transformOrigin: 'bottom right', zIndex: 20 }}>
                        <div style={{ padding: '4px 10px 6px', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Nivel de pensamiento</div>
                        {([['fast', 'Rápido', 'Respuestas directas y ágiles'], ['normal', 'Normal', 'Respuestas equilibradas'], ['deep', 'Profundo', 'La IA razona más para respuestas más elaboradas']] as ['fast'|'normal'|'deep', string, string][]).map(([lvl, label, desc]) => (
                          <button key={lvl} onClick={() => { setThinkLevel(lvl); setThinkOpen(false) }}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span style={{ width: 13, display: 'flex', flexShrink: 0, color: 'var(--text-primary)' }}>
                              {thinkLevel === lvl
                                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                : <span style={{ width: 6, height: 6, borderRadius: '50%', border: '1.5px solid var(--border-strong)', margin: '0 auto' }} />}
                            </span>
                            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              <span>{label}</span>
                              <span style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>{desc}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={toggleRecording} disabled={isTranscribing} title={isTranscribing ? 'Transcribiendo...' : isRecording ? 'Detener' : 'Voz'}
                  style={{ position: 'relative', width: 30, height: 30, borderRadius: 8, background: isRecording ? 'rgba(239,68,68,0.08)' : 'transparent', border: `1px solid ${isRecording ? 'rgba(239,68,68,0.25)' : 'transparent'}`, cursor: isTranscribing ? 'wait' : 'pointer', color: isRecording ? 'var(--red)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                  {isTranscribing
                    ? <div style={{ width: 13, height: 13, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill={isRecording ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>}
                  {isRecording && <span style={{ position: 'absolute', inset: 0, borderRadius: 8, border: '2px solid var(--red)', animation: 'micPulse 1s ease infinite' }} />}
                </button>
                <button onClick={isLoading ? handleStop : handleSend} disabled={!isLoading && !input.trim() && attachedFiles.length === 0}
                  aria-label={isLoading ? 'Detener generación' : 'Enviar mensaje'}
                  title={isLoading ? 'Detener' : `Enviar (Enter)`}
                  style={{ width: 34, height: 34, borderRadius: 999, background: isLoading ? 'var(--text-primary)' : (input.trim() || attachedFiles.length > 0) ? 'var(--text-primary)' : 'var(--bg-elevated)', border: 'none', cursor: isLoading || input.trim() || attachedFiles.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  <span key={isLoading ? 'stop' : 'send'} style={{ display: 'flex', animation: 'sendFlip 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
                    {isLoading
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--bg-base)"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={(input.trim() || attachedFiles.length > 0) ? 'var(--bg-base)' : 'var(--text-tertiary)'} strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    }
                  </span>
                </button>
              </div>
            </div>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 7, opacity: 0.75 }}>
            {input.length > 7000
              ? <span style={{ color: input.length >= 8000 ? 'var(--red)' : 'var(--text-secondary)', fontWeight: 500 }}>{input.length} / 8000</span>
              : 'Daya puede cometer errores. Verifica las respuestas importantes.'}
          </p>
        </div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes micPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.06)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes sendFlip{from{opacity:0;transform:scale(0.5) rotate(-15deg)}to{opacity:1;transform:scale(1) rotate(0)}}
        .daya-proj{display:inline-flex;align-items:center;gap:7px;padding:5px 11px 5px 8px;border-radius:999px;background:var(--bg-base);border:1px solid var(--border-default);color:var(--text-secondary);font-size:0.76rem;font-weight:600;font-family:var(--font-body);cursor:pointer;white-space:nowrap;transition:background 0.15s,border-color 0.15s,color 0.15s,transform 0.15s;animation:dayaRise 0.35s cubic-bezier(0.16,1,0.3,1) both}
        .daya-proj:hover{background:var(--bg-elevated);border-color:var(--border-strong);color:var(--text-primary);transform:translateY(-1px)}
        .daya-proj-ico{display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;flex-shrink:0}
        .daya-proj-row{scrollbar-width:none}
        .daya-proj-row::-webkit-scrollbar{display:none}
        /* Responsive: en móvil el ancho de lectura ocupa el 100% con padding lateral seguro */
        @media (max-width: 768px){
          .daya-chat-col{ max-width: 100% !important; }
          .daya-msgs-col{ padding-left: 16px !important; padding-right: 16px !important; }
        }
        @media (prefers-reduced-motion: reduce){.daya-proj{animation:none}.daya-proj:hover{transform:none}}
      `}</style>
    </div>
    </div>
  )
}

// Tamaño de archivo legible
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Icono + color por tipo de "proyecto" generado (imagen / código / documento)
function projMeta(kind: 'image' | 'code' | 'doc'): { color: string; icon: JSX.Element } {
  if (kind === 'image') return { color: '#6d5cff', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> }
  if (kind === 'code') return { color: '#8b5cf6', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
  return { color: '#ef4444', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> }
}

// Color + etiqueta por extensión de archivo
function fileMeta(name: string): { color: string; label: string } {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['pdf'].includes(ext)) return { color: '#ef4444', label: 'PDF' }
  if (['doc', 'docx'].includes(ext)) return { color: '#2563eb', label: 'DOC' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { color: '#16a34a', label: ext.toUpperCase() }
  if (['ppt', 'pptx'].includes(ext)) return { color: '#d97706', label: 'PPT' }
  if (['txt', 'md'].includes(ext)) return { color: '#52525b', label: 'TXT' }
  return { color: '#71717a', label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE' }
}

// Chip de archivo adjunto: miniatura real para imágenes, tarjeta con ícono para el resto
function AttachmentChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/')
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    if (!isImage) return
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file, isImage])

  const remove = (
    <button onClick={onRemove} aria-label="Quitar"
      style={{ position: 'absolute', top: -7, right: -7, width: 19, height: 19, borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-base)', border: '2px solid var(--bg-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', zIndex: 2 }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  )

  if (isImage) {
    return (
      <div style={{ position: 'relative', width: 56, height: 56, borderRadius: 11, overflow: 'hidden', border: '1px solid var(--border-default)', flexShrink: 0, animation: 'fadeIn 0.2s ease' }}>
        {url && <img src={url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        {remove}
      </div>
    )
  }

  const meta = fileMeta(file.name)
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px 8px 9px', borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', maxWidth: 220, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: meta.color + '18', border: `1px solid ${meta.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.6rem', fontWeight: 800, color: meta.color, letterSpacing: '0.02em' }}>
        {meta.label}
      </div>
      <div style={{ minWidth: 0, lineHeight: 1.3 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{humanSize(file.size)}</div>
      </div>
      {remove}
    </div>
  )
}
