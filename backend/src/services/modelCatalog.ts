// ============================================================
// DAYA IA — Auto-actualizador del catálogo de OpenRouter
// Revisa a diario los modelos disponibles y sus PRECIOS, y aplica
// 4 FILTROS para que NUNCA entre un modelo basura:
//   1) Antigüedad mínima (no estrenos sin probar)
//   2) Uso real / disponibilidad del proveedor
//   3) Precio máximo por nivel
//   4) Lista negra manual
// Open-source: cualquier modelo de OpenRouter puede entrar.
// El CÓDIGO controla precio + disponibilidad; TÚ controlas la calidad
// con la blacklist. Si algo falla, no cambia nada.
// ============================================================
import fs from 'fs'
import path from 'path'
import { loadConfigObj, saveConfigObj } from './configStore'
import { logger } from './logger'

// ── Vigilancia de modelos en uso (alerta de IDs muertos) ─────────────────────
// Un ID que desaparece de OpenRouter devuelve 404 y los fallbacks degradan EN
// SILENCIO a un modelo más caro o peor (así se coló que "hola" se facturara a
// precio Opus). Cada módulo registra aquí los IDs que usa; tras cada refresh
// del catálogo se comprueba que sigan vivos y, si alguno murió, se avisa fuerte:
// error en los logs de Railway + alerta persistida visible en el panel admin.

const ALERT_KEY = 'model_health_alert'
const OVERRIDES_KEY = 'model_overrides'
const MODELS_IN_USE = new Map<string, { id: string; sources: Set<string> }>()

// En desarrollo con Ollama (sin key de OpenRouter) todos los alias apuntan al
// modelo local: ahí NO se sanea nada, o el sanador «arreglaría» el modelo local
// sustituyéndolo por uno de OpenRouter.
const LOCAL_MODE = !process.env.OPENROUTER_API_KEY && !!process.env.LOCAL_LLM_MODEL

// Kill switch: MODEL_AUTO_UPDATE=off deja solo los rescates (modelo muerto →
// sustituto) y desactiva las subidas de versión automáticas.
const AUTO_UPGRADE = process.env.MODEL_AUTO_UPDATE !== 'off'

// OpenRouter normaliza variantes del mismo ID (claude-opus-4-8 ≡ claude-opus-4.8):
// comparamos en forma canónica para no dar falsos positivos con esos alias.
function canon(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9/]/g, '')
}

/** Registra IDs de modelo que el código usa, con su origen (para el aviso). */
export function registerModelsInUse(ids: string[], source: string): void {
  for (const id of ids) {
    if (!id) continue
    const c = canon(id)
    const entry = MODELS_IN_USE.get(c) || { id, sources: new Set<string>() }
    entry.sources.add(source)
    MODELS_IN_USE.set(c, entry)
  }
}

export interface ModelHealthAlert {
  deadModels: { id: string; sources: string[] }[]
  totalChecked: number
  checkedAt: string
  /** Sustituciones y subidas de versión que el sanador aplicó solo. */
  changes?: ModelChange[]
  /** Versiones nuevas detectadas que NO se adoptaron (suelen ser más caras). */
  suggestions?: { role: string; from: string; to: string; priceFrom: number; priceTo: number }[]
}

/** Un cambio de modelo aplicado automáticamente. */
export interface ModelChange {
  source: string          // 'openrouter.MODELS'
  role: string            // 'flash'
  from: string
  to: string
  reason: 'muerto' | 'version-nueva'
  priceFrom?: number      // USD por millón de tokens de salida
  priceTo?: number
  at: string
}

/** Última alerta persistida (para el panel admin). null = aún sin chequear. */
export async function getModelHealthAlert(): Promise<ModelHealthAlert | null> {
  return loadConfigObj<ModelHealthAlert>(ALERT_KEY)
}

// Qué modelos hay EN USO ahora mismo: los registrados estáticamente más los
// valores VIVOS de las tablas saneables. Se calcula en el momento, no al
// importar, porque el sanador cambia esas tablas: si no, un modelo ya sustituido
// seguiría saliendo como muerto para siempre.
function inUseNow(): { id: string; sources: string[] }[] {
  const map = new Map<string, { id: string; sources: Set<string> }>()
  const add = (id: string, source: string) => {
    if (!id) return
    const c = canon(id)
    const entry = map.get(c) || { id, sources: new Set<string>() }
    entry.sources.add(source)
    map.set(c, entry)
  }
  for (const e of MODELS_IN_USE.values()) for (const s of e.sources) add(e.id, s)
  for (const h of HEALABLES) for (const id of Object.values(h.table)) add(id, h.source)
  return [...map.values()].map(e => ({ id: e.id, sources: [...e.sources] }))
}

// Compara los modelos registrados contra el catálogo CRUDO (sin filtros de
// marca/precio, que excluirían IDs válidos como z-ai o alias con guiones).
async function checkModelsInUse(liveCanonIds: Set<string>, extra?: Partial<ModelHealthAlert>): Promise<void> {
  const watched = inUseNow()
  const dead = watched.filter(e => !liveCanonIds.has(canon(e.id)))

  const alert: ModelHealthAlert = {
    deadModels: dead,
    totalChecked: watched.length,
    checkedAt: new Date().toISOString(),
    ...extra,
  }

  if (dead.length) {
    // Llegar aquí ya es raro: el sanador ha intentado sustituirlos antes. Lo que
    // queda son modelos sin ningún equivalente aceptable, así que sí requieren
    // una decisión humana.
    console.error('🚨🚨🚨 MODELOS MUERTOS SIN SUSTITUTO — el fallback los está degradando EN SILENCIO (posible sobrecoste):')
    for (const d of dead) console.error(`   ✗ ${d.id}  (usado en: ${d.sources.join(', ')})`)
    console.error('   → Reemplázalos en backend/src (openrouter.ts / modelSelector.ts) y verifica el nuevo ID con una petición real.')

    // Correo al admin (ADMIN_ALERT_EMAIL) — solo si la lista de muertos CAMBIÓ
    // respecto al último chequeo, para avisar el día que pasa sin repetir a diario.
    try {
      const prev = await loadConfigObj<ModelHealthAlert>(ALERT_KEY)
      const prevIds = new Set((prev?.deadModels || []).map(d => canon(d.id)))
      const changed = dead.some(d => !prevIds.has(canon(d.id))) || prevIds.size !== dead.length
      if (changed) {
        const { sendModelAlertEmail } = await import('./email')
        const sent = await sendModelAlertEmail(dead)
        if (sent) console.error('   → Alerta enviada por correo al admin.')
        else if (!process.env.ADMIN_ALERT_EMAIL) console.error('   → Configura ADMIN_ALERT_EMAIL en Railway para recibir esta alerta por correo.')
      }
    } catch { /* el correo nunca debe romper el chequeo */ }
  } else {
    logger.info(`✅ Salud de modelos: los ${watched.length} IDs en uso siguen vivos en OpenRouter`)
  }

  try { await saveConfigObj(ALERT_KEY, alert) } catch {}
}

// ---- FILTRO 1: lista negra manual (modelos que probaste y NO sirven) ----
const BLACKLIST: string[] = [
  // 'ejemplo/modelo-malo',
]

// ---- FILTRO 4: precio máximo por nivel (USD por millón de tokens de salida) ----
const MAX_PRICE = { cheap: 1.0, mid: 5.0, premium: 25.0 }

// ---- FILTRO 2: antigüedad mínima en días (nada recién estrenado) ----
const MIN_AGE_DAYS = 14

// Modelos PREFERIDOS por nivel (los que ya sabemos que son buenos).
// El auto-actualizador solo cambia a otro si el preferido DESAPARECE.
const PREFERRED = {
  cheap: 'deepseek/deepseek-v4-flash',  // $0.28 y 1M de contexto: imbatible en su nivel
  premium: 'deepseek/deepseek-v3.2',    // DeepSeek V3.2: mucha capacidad por $0.40
}
registerModelsInUse(Object.values(PREFERRED), 'modelCatalog.PREFERRED')

/** Lo que hay que saber de un modelo para poder sustituirlo sin perder nada. */
export interface ModelMeta {
  in: number       // USD por millón de tokens de ENTRADA
  out: number      // USD por millón de tokens de SALIDA
  ctx: number      // ventana de contexto
  img: boolean     // acepta imágenes (visión)
  vid: boolean     // acepta vídeo
  tools: boolean   // soporta function-calling
  reason: boolean  // acepta el parámetro `reasoning` de OpenRouter
  effort: boolean  // ...y en su variante `reasoning_effort` (si no, se pide por max_tokens)
  created: number  // epoch en ms de su publicación
}

type Catalog = {
  cheap: string[]; mid: string[]; premium: string[]; all: string[]
  // Ficha de TODOS los modelos de marca confiable, incluidos los que no pasan
  // los filtros de edad o precio: un modelo puede estar EN USO siendo carísimo
  // o recién salido (Kimi K3 tenía 10 días), y el sanador necesita conocerlo.
  meta: Record<string, ModelMeta>
  updatedAt: string
}
const CACHE_FILE = path.join(process.cwd(), 'model-catalog.json')
let catalog: Catalog | null = null

// Carga del disco al iniciar (si existe de una corrida anterior)
try {
  if (fs.existsSync(CACHE_FILE)) catalog = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
} catch {}

// Modelo crudo tal como llega del endpoint /models de OpenRouter (campos que usamos)
interface RawCatalogModel {
  id?: string
  created?: number
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  architecture?: { input_modalities?: string[] }
  supported_parameters?: string[]
  top_provider?: { is_deprecated?: boolean }
}

// Aplica los filtros a la lista cruda de modelos de OpenRouter.
export function applyFilters(models: RawCatalogModel[]): Catalog {
  const now = Date.now()
  const cheap: string[] = [], mid: string[] = [], premium: string[] = [], all: string[] = []
  const meta: Record<string, ModelMeta> = {}

  for (const m of models) {
    const id: string = m?.id || ''
    if (!id) continue
    if (BLACKLIST.includes(id)) continue                   // Filtro 1

    const created = (m?.created || 0) * 1000
    // Precio de salida por millón de tokens
    const outPrice = parseFloat(m?.pricing?.completion || '0') * 1_000_000  // Filtro 4
    if (!outPrice || outPrice < 0) continue

    // La FICHA se guarda antes de los filtros de edad y de precio: el sanador
    // tiene que poder razonar sobre modelos que están en uso aunque el catálogo
    // no los recomendaría (recién salidos o por encima del tope de precio).
    const sp: string[] = Array.isArray(m?.supported_parameters) ? m.supported_parameters : []
    meta[id] = {
      in: parseFloat(m?.pricing?.prompt || '0') * 1_000_000,
      out: outPrice,
      ctx: Number(m?.context_length) || 0,
      img: Array.isArray(m?.architecture?.input_modalities) && m.architecture.input_modalities.includes('image'),
      vid: Array.isArray(m?.architecture?.input_modalities) && m.architecture.input_modalities.includes('video'),
      tools: sp.includes('tools'),
      // El propio catálogo dice quién sabe pensar y cómo se le pide. Antes esto
      // se descargaba y se tiraba, y la respuesta vivía en una tabla escrita a
      // mano en openrouter.ts — indexada por id, con los ids cambiando solos.
      reason: sp.includes('reasoning') || sp.includes('include_reasoning'),
      effort: sp.includes('reasoning_effort'),
      created,
    }

    if (created && (now - created) < MIN_AGE_DAYS * 86400000) continue   // Filtro 2

    // Filtro 3: disponibilidad real (que tenga proveedor activo)
    if (m?.top_provider && m.top_provider.is_deprecated) continue

    // Solo entra si cae dentro de algún nivel de precio (si supera el premium, FUERA)
    if (outPrice <= MAX_PRICE.cheap) { cheap.push(id); all.push(id) }
    else if (outPrice <= MAX_PRICE.mid) { mid.push(id); all.push(id) }
    else if (outPrice <= MAX_PRICE.premium) { premium.push(id); all.push(id) }
  }
  return { cheap, mid, premium, all, meta, updatedAt: new Date().toISOString() }
}

// Revisa el catálogo en vivo de OpenRouter (se llama a diario desde el scheduler).
export async function refreshModelCatalog(): Promise<void> {
  try {
    const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    const res = await fetch(`${baseURL}/models`)
    if (!res.ok) { console.warn('Catálogo OpenRouter no disponible:', res.status); return }
    const data = await res.json() as { data?: RawCatalogModel[] }
    const models: RawCatalogModel[] = Array.isArray(data?.data) ? data.data : []
    if (!models.length) return

    // La ficha ANTERIOR se guarda antes de pisarla: es lo único que nos dice qué
    // era un modelo que acaba de desaparecer (precio, contexto, si veía imágenes)
    // y por tanto qué puede sustituirlo.
    const prevMeta = catalog?.meta || {}

    catalog = applyFilters(models)
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(catalog)) } catch {}
    logger.info(`📚 Catálogo DAYA actualizado: ${catalog.cheap.length} baratos · ${catalog.mid.length} medios · ${catalog.premium.length} premium`)

    // Aviso si un modelo PREFERIDO desapareció (para que lo sepas)
    if (!catalog.all.includes(PREFERRED.cheap)) console.warn(`⚠️ El modelo barato preferido (${PREFERRED.cheap}) ya no está disponible`)
    if (!catalog.all.includes(PREFERRED.premium)) console.warn(`⚠️ El modelo premium preferido (${PREFERRED.premium}) ya no está disponible`)

    // Catálogo crudo, sin filtros, para no marcar como muertos alias válidos o
    // marcas no listadas.
    const liveCanonIds = new Set<string>(models.map((m: RawCatalogModel) => canon(String(m?.id || ''))))

    // 1º SANEAR (sustituir los muertos, adoptar versiones nuevas) y 2º vigilar:
    // así la alerta solo se queda con lo que no se ha podido arreglar solo.
    const { changes, suggestions } = await healModels(liveCanonIds, prevMeta)
    await checkModelsInUse(liveCanonIds, { changes, suggestions })
  } catch (e) {
    console.error('No se pudo actualizar el catálogo de modelos:', e instanceof Error ? e.message : e)
  }
}

// ¿El modelo sigue vivo y dentro de presupuesto? (sin datos, asumimos que sí: no rompe)
export function isModelHealthy(id: string): boolean {
  if (!catalog) return true
  return catalog.all.includes(id)
}

// Rango de la variante DENTRO de una misma familia. Estos laboratorios llaman
// max/pro/plus/ultra al modelo grande y flash/air/mini/lite al pequeño, y marcan
// lo inestable como preview/exp/beta.
//
// Antes se ordenaba por LONGITUD del nombre ("el más largo es el mayor"), y eso
// era justo al revés: entre 'glm-5.3-flash' (13) y 'glm-5.3-max' (11) ganaba
// flash, así que el escalón FUERTE habría acabado usando el modelo pequeño el
// día que saliera la familia — degradando en silencio, que es exactamente lo que
// todo este módulo existe para evitar.
function variantRank(id: string): number {
  const s = id.toLowerCase()
  if (/(preview|exp|beta)/.test(s)) return 0                    // no estable
  if (/(flash|air|mini|lite|nano|small|tiny)/.test(s)) return 1  // variante pequeña
  if (/(max|pro|plus|ultra)/.test(s)) return 3                   // variante mayor
  return 2                                                       // el modelo "a secas"
}

// Versión que lleva el id (glm-5.3-max → 5.3, kimi-k2.7-code → 2.7).
//
// Es el PRIMER número del nombre, no el mayor: muchos ids arrastran una fecha o
// un tamaño detrás (kimi-k2-0905, r1-0528, qwen3.5-plus-20260420) y coger el
// máximo convertía '0905' en la versión 905, que ganaba a todo.
function versionOf(id: string): number {
  const name = id.slice(id.indexOf('/') + 1)
  for (const tok of name.match(/\d+(?:\.\d+)?/g) || []) {
    const v = parseFloat(tok)
    // Un número de 4+ cifras solo puede ser una fecha (20260420, 2025-07-28), y
    // a partir de ahí lo que queda son sus trozos: parar. Si no, el '07' de
    // 'qwen-plus-2025-07-28' se leería como la versión 7 y ese modelo ganaría a
    // qwen3.7-plus por un mes del calendario.
    if (v >= 1000) return 0
    return v
  }
  return 0
}

/**
 * Elige el MEJOR modelo cuyo id empiece por alguno de los prefijos dados; si
 * ninguno está en el catálogo, devuelve `fallback`.
 *
 * Sirve para apuntar a una versión que AÚN NO EXISTE sin arriesgar un 404: se
 * escribe el prefijo ('z-ai/glm-5.3') y, el día que el laboratorio la publique,
 * Daya la usa sola en el siguiente refresco diario del catálogo. Hasta entonces
 * trabaja con el fallback, que es un id verificado.
 *
 * "Mejor" = variante mayor primero (max/pro sobre flash/mini, y nada marcado
 * preview), luego versión más alta y, a igualdad, el nombre más corto (el
 * modelo base antes que una variante rara).
 *
 * Al contrario que isModelHealthy, sin catálogo cargado devuelve el fallback:
 * aquí NO se puede asumir que existe algo que precisamente esperamos que no exista.
 */
export function pickByPrefix(prefixes: string[], fallback: string): string {
  if (!catalog) return fallback
  for (const p of prefixes) {
    const hit = catalog.all
      .filter(id => id.startsWith(p))
      .sort((a, b) => variantRank(b) - variantRank(a) || versionOf(b) - versionOf(a) || a.length - b.length)[0]
    if (hit) return hit
  }
  return fallback
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-SANADO — los modelos se reemplazan y se actualizan SOLOS
//
// Hasta ahora, cuando un ID moría el sistema solo AVISABA: el arreglo era
// manual, y mientras tanto cada llamada caía al fallback. Ahora, en el mismo
// refresco diario, DAYA cambia el modelo ella sola:
//
//   · MUERTO      → busca el mejor sustituto vivo y lo pone.
//   · VERSIÓN NUEVA → si sale una versión superior de la MISMA línea de modelo
//                     (glm-5.2 → glm-5.4), la adopta.
//
// Las reglas que NUNCA se saltan (el miedo real es una degradación silenciosa):
//   1. Nada con menos de MIN_AGE_DAYS de vida: los estrenos no se prueban en
//      producción.
//   2. Nada que pierda capacidades: si el modelo actual ve imágenes o usa
//      herramientas, el sustituto también, y con al menos el 60% del contexto.
//   3. Nada que dispare el coste: un ascenso admite hasta +15% de precio de
//      salida, y un rescate hasta +30%. Lo que se pase se REPORTA como
//      sugerencia, pero no se aplica solo.
//   4. Todo cambio se registra en el log, queda en el panel de admin y se
//      manda por correo. Nada ocurre a oscuras.
//   5. MODEL_AUTO_UPDATE=off desactiva los ascensos (los rescates siguen: un
//      modelo muerto ya está roto, dejarlo no es la opción conservadora).
// ═══════════════════════════════════════════════════════════════════════════

const UPGRADE_TOLERANCE = 1.15   // un ascenso puede costar hasta un 15% más
const RESCUE_TOLERANCE  = 1.30   // un rescate, hasta un 30% más

/** Tabla mutable de modelos que el sanador puede actualizar. */
interface Healable { source: string; table: Record<string, string> }
const HEALABLES: Healable[] = []

/**
 * Registra una tabla `rol → id de modelo` para que el sanador la mantenga viva.
 * La tabla se MUTA en sitio, así que cualquiera que lea `TABLA.rol` en tiempo de
 * llamada recibe el modelo ya corregido, sin tocar una sola línea del código que
 * la consume.
 */
export function registerHealable(source: string, table: Record<string, string>): void {
  if (LOCAL_MODE) return          // en modo Ollama no se sanea ni se vigila nada
  HEALABLES.push({ source, table })
}

// "Línea" de modelo: el id sin números, para saber qué es sucesor de qué.
//   z-ai/glm-5.2            → z-ai/glm
//   z-ai/glm-4.7-flash      → z-ai/glm-flash        (línea distinta, a propósito)
//   moonshotai/kimi-k2.7-code → moonshotai/kimi-k-code
// Así un modelo de código nunca "asciende" a uno generalista por tener número
// más alto, que es el error que arruinaría el enrutado.
function shapeOf(id: string): string {
  return id.toLowerCase()
    .replace(/:.*$/, '')            // fuera sufijos tipo :free
    .replace(/\d+(\.\d+)?/g, '')    // fuera versiones, fechas y tamaños
    .replace(/-{2,}/g, '-')
    .replace(/-+$/, '')
}

/** ¿Puede `cand` ocupar el puesto de un modelo con ficha `ref` sin perder nada? */
function canReplace(cand: ModelMeta, ref: ModelMeta, priceFactor: number): boolean {
  if (cand.created && Date.now() - cand.created < MIN_AGE_DAYS * 86400000) return false
  if (ref.img && !cand.img) return false          // no perder visión
  if (ref.vid && !cand.vid) return false          // no perder vídeo
  if (ref.tools && !cand.tools) return false      // no perder function-calling
  if (ref.ctx && cand.ctx < ref.ctx * 0.6) return false
  if (ref.out && cand.out > ref.out * priceFactor) return false
  return true
}

/** Versión superior de la MISMA línea, o null si no hay o no compensa. */
function findUpgrade(id: string): { to: string; blocked?: ModelMeta } | null {
  if (!catalog) return null
  const cur = catalog.meta[id]
  if (!cur) return null
  const shape = shapeOf(id), ver = versionOf(id), rank = variantRank(id)
  let best: string | null = null
  let blocked: { id: string; m: ModelMeta } | null = null

  for (const [cand, m] of Object.entries(catalog.meta)) {
    if (cand === id || shapeOf(cand) !== shape) continue
    if (variantRank(cand) !== rank) continue        // max sigue siendo max; flash, flash
    if (versionOf(cand) <= ver) continue
    if (!canReplace(m, cur, UPGRADE_TOLERANCE)) {
      // Existe una versión nueva pero se pasa de precio (o pierde algo): se
      // reporta como sugerencia para que la decida una persona.
      if (!blocked || versionOf(cand) > versionOf(blocked.id)) blocked = { id: cand, m }
      continue
    }
    if (!best || versionOf(cand) > versionOf(best)) best = cand
  }
  if (best) return { to: best }
  if (blocked) return { to: blocked.id, blocked: blocked.m }
  return null
}

/** Mejor sustituto vivo para un modelo que ha desaparecido. */
function findReplacement(id: string, ref?: ModelMeta): string | null {
  if (!catalog) return null
  const pool = Object.entries(catalog.meta)
  const shape = shapeOf(id)

  // 1) La misma línea de modelo: la versión viva más alta (glm-5.2 → glm-5.4).
  const line = pool
    .filter(([c, m]) => shapeOf(c) === shape && (!ref || canReplace(m, ref, RESCUE_TOLERANCE)))
    .sort((a, b) => versionOf(b[0]) - versionOf(a[0]))
  if (line.length) return line[0][0]

  // Sin ficha del difunto no se puede comparar nada más: mejor no inventar.
  if (!ref) return null

  // 2) Misma marca y capacidades equivalentes, lo más parecido en precio.
  const closest = (list: [string, ModelMeta][]) =>
    list.sort((a, b) => Math.abs(a[1].out - ref.out) - Math.abs(b[1].out - ref.out) || b[1].ctx - a[1].ctx)[0][0]

  const brand = id.split('/')[0]
  const sameBrand = pool.filter(([c, m]) => c.split('/')[0] === brand && canReplace(m, ref, RESCUE_TOLERANCE))
  if (sameBrand.length) return closest(sameBrand)

    // 3) Cualquier modelo del catálogo que cumpla las mismas condiciones (open-source).
  const any = pool.filter(([, m]) => canReplace(m, ref, RESCUE_TOLERANCE))
  return any.length ? closest(any) : null
}

/**
 * Pasa por todas las tablas registradas y las deja al día. Devuelve lo que
 * cambió (para el log, el panel y el correo).
 */
async function healModels(liveCanonIds: Set<string>, prevMeta: Record<string, ModelMeta>): Promise<{
  changes: ModelChange[]
  suggestions: NonNullable<ModelHealthAlert['suggestions']>
}> {
  const changes: ModelChange[] = []
  const suggestions: NonNullable<ModelHealthAlert['suggestions']> = []
  if (!catalog || LOCAL_MODE) return { changes, suggestions }

  for (const h of HEALABLES) {
    for (const role of Object.keys(h.table)) {
      const from = h.table[role]
      if (!from) continue
      const alive = liveCanonIds.has(canon(from))

      if (!alive) {
        // La ficha del difunto sale del catálogo ANTERIOR: sabemos qué era y
        // podemos buscar algo equivalente en vez de un sustituto a ciegas.
        const ref = prevMeta[from]
        const to = findReplacement(from, ref)
        if (to && to !== from) {
          h.table[role] = to
          changes.push({ source: h.source, role, from, to, reason: 'muerto', priceFrom: ref?.out, priceTo: catalog.meta[to]?.out, at: new Date().toISOString() })
        }
        continue
      }

      if (!AUTO_UPGRADE) continue
      const up = findUpgrade(from)
      if (!up) continue
      const cur = catalog.meta[from]
      if (up.blocked) {
        suggestions.push({ role: `${h.source}.${role}`, from, to: up.to, priceFrom: cur?.out ?? 0, priceTo: up.blocked.out })
        continue
      }
      h.table[role] = up.to
      changes.push({ source: h.source, role, from, to: up.to, reason: 'version-nueva', priceFrom: cur?.out, priceTo: catalog.meta[up.to]?.out, at: new Date().toISOString() })
    }
  }

  if (changes.length) {
    logger.info(`🔄 Modelos actualizados solos (${changes.length}):`)
    for (const c of changes) {
      const precio = c.priceFrom && c.priceTo ? ` — $${c.priceFrom.toFixed(2)} → $${c.priceTo.toFixed(2)} por millón` : ''
      logger.info(`   ${c.reason === 'muerto' ? '🚑' : '⬆️'} ${c.source}.${c.role}: ${c.from} → ${c.to}${precio}`)
    }
    // Se guardan para que sobrevivan a un reinicio: al arrancar se aplican de
    // nuevo sin esperar al primer refresco (ver applyStoredOverrides).
    try {
      const saved = (await loadConfigObj<Record<string, ModelChange>>(OVERRIDES_KEY)) || {}
      for (const c of changes) saved[`${c.source}.${c.role}`] = c
      await saveConfigObj(OVERRIDES_KEY, saved)
    } catch {}
    try {
      const { sendModelChangeEmail } = await import('./email')
      await sendModelChangeEmail(changes)
    } catch { /* el correo nunca debe romper el refresco */ }
  }

  if (suggestions.length) {
    logger.info('💡 Versiones nuevas disponibles que NO se adoptaron solas (precio o capacidades):')
    for (const s of suggestions) logger.info(`   ${s.role}: ${s.from} → ${s.to} ($${s.priceFrom.toFixed(2)} → $${s.priceTo.toFixed(2)})`)
  }
  return { changes, suggestions }
}

/**
 * Reaplica los cambios que el sanador ya había decidido, para que un reinicio no
 * vuelva a los IDs escritos en el código (que pueden llevar días muertos)
 * mientras llega el primer refresco del catálogo.
 *
 * Solo se aplica si el valor actual coincide con el `from` guardado: así, en
 * cuanto alguien cambia el modelo a mano en el código, el override viejo se
 * ignora en vez de pisar la decisión humana.
 */
export async function applyStoredOverrides(): Promise<number> {
  if (LOCAL_MODE) return 0
  try {
    const saved = await loadConfigObj<Record<string, ModelChange>>(OVERRIDES_KEY)
    if (!saved) return 0
    let n = 0
    for (const h of HEALABLES) {
      for (const role of Object.keys(h.table)) {
        const rec = saved[`${h.source}.${role}`]
        if (!rec?.to || rec.from !== h.table[role]) continue
        h.table[role] = rec.to
        registerModelsInUse([rec.to], h.source)
        n++
      }
    }
    if (n) logger.info(`🔁 ${n} modelo(s) restaurados desde el último saneo (a la espera del refresco del catálogo)`)
    return n
  } catch { return 0 }
}

// Devuelve el modelo BARATO a usar: el preferido si sigue vivo; si no, el más
// barato confiable disponible. Así DAYA se auto-cura si Llama desaparece.
export function getCheapModel(): string {
  if (!catalog) return PREFERRED.cheap
  if (catalog.all.includes(PREFERRED.cheap)) return PREFERRED.cheap
  return catalog.cheap[0] || PREFERRED.cheap
}

// Igual para el premium (planes de pago)
export function getPremiumModel(): string {
  if (!catalog) return PREFERRED.premium
  if (catalog.all.includes(PREFERRED.premium)) return PREFERRED.premium
  return catalog.premium[0] || catalog.mid[0] || PREFERRED.premium
}

/* ¿Cómo se le pide a este modelo que piense?
     'effort' → reasoning: { effort: 'high' | 'low' }
     'tokens' → reasoning: { max_tokens: N }
     null     → no sabe pensar, o el catálogo todavía no sabe de él
   Lo dice el catálogo vivo, así que cuando el sanador sustituya un modelo la
   respuesta se actualiza sola. Devuelve null —y no una suposición— si la ficha
   es de una versión anterior del catálogo (sin estos campos): quien pregunta
   tiene su propia tabla de respaldo y es mejor que la use a que asumamos. */
export function reasoningFieldFor(id: string): 'effort' | 'tokens' | null {
  const meta = catalog?.meta?.[id]
  if (!meta || typeof meta.reason !== 'boolean') return null
  if (!meta.reason) return null
  return meta.effort ? 'effort' : 'tokens'
}
