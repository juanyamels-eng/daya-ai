// ============================================
// DAYA IA — Life Context Agent
// --------------------------------------------------------------------------
// Capacidad NUEVA y propia de DAYA. Consolida en UN solo "contexto vivo" todo
// lo que hace que una respuesta sea hiperpersonalizada:
//
//   • Perfil y preferencias (UserProfile)            ← ya en tu BD
//   • Recuerdos relevantes (Memory, híbrido)         ← services/memory.ts
//   • Skills aprendidas (features/memoryskills)      ← módulo previo (si existe)
//   • Ubicación + clima actual                       ← señales del entorno
//   • Hora/fecha/franja del día                      ← temporalidad
//   • Proyectos e hilos activos                      ← de conversaciones recientes
//
// Todo se guarda como un "archivo de contexto" por usuario (clave-valor en
// DayaSystemConfig, modelo que YA existe → cero migraciones). Se refresca de
// forma perezosa (TTL) para no recalcular en cada mensaje.
//
// Punto de integración recomendado (NO obligatorio, NO toca tu código):
//   En services/memory.ts → buildSystemPrompt, al final, concatenar:
//       + await buildLifeContextBlock(userId)
//   Eso añade el bloque de contexto vivo al prompt sin reemplazar nada.
// ============================================

import { prisma } from '../../lib/prisma'
import { loadConfigObj, saveConfigObj } from '../../services/configStore'

const db = prisma as any

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface UserLocation {
  city?: string
  region?: string
  country?: string
  lat?: number
  lon?: number
  timezone?: string
}

export interface WeatherSnapshot {
  tempC?: number
  description?: string
  isDay?: boolean
  fetchedAt?: number
}

export interface ActiveProject {
  title: string
  lastTouched: number       // epoch ms
  summary?: string
}

export interface LifeContext {
  userId: string
  // Señales de entorno
  location?: UserLocation
  weather?: WeatherSnapshot
  // Temporalidad (se recalcula siempre, es barata)
  localTime?: string
  dayPart?: 'madrugada' | 'mañana' | 'tarde' | 'noche'
  // Trabajo en curso
  activeProjects?: ActiveProject[]
  // Datos arbitrarios que el usuario quiera fijar ("soy celíaco", "uso métrico")
  facts?: Record<string, string>
  updatedAt: number
}

// TTL del contexto cacheado (clima/proyectos no cambian cada segundo).
const CTX_TTL_MS = 30 * 60 * 1000 // 30 min

function ctxKey(userId: string): string {
  return `lifectx:${userId}`
}

// ── Persistencia (en DayaSystemConfig, sin migraciones) ─────────────────────

const loadStored = (userId: string): Promise<LifeContext | null> => loadConfigObj<LifeContext>(ctxKey(userId))
const saveStored = (ctx: LifeContext): Promise<void> => saveConfigObj(ctxKey(ctx.userId), ctx)

// ── Señales de entorno ──────────────────────────────────────────────────────

// Franja del día a partir de la hora local (en la zona del usuario si la hay).
function computeDayPart(date: Date): LifeContext['dayPart'] {
  const h = date.getHours()
  if (h < 6) return 'madrugada'
  if (h < 12) return 'mañana'
  if (h < 20) return 'tarde'
  return 'noche'
}

// Clima actual SIN clave de API (Open-Meteo es gratuito y abierto).
// Devuelve undefined si no hay coordenadas o si la red falla (degrada con gracia).
async function fetchWeather(loc?: UserLocation): Promise<WeatherSnapshot | undefined> {
  if (!loc?.lat || !loc?.lon) return undefined
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,is_day,weather_code`
    const res = await fetch(url)
    if (!res.ok) return undefined
    const data: any = await res.json()
    const cur = data?.current
    if (!cur) return undefined
    return {
      tempC: typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : undefined,
      description: weatherCodeToText(cur.weather_code),
      isDay: cur.is_day === 1,
      fetchedAt: Date.now(),
    }
  } catch {
    return undefined
  }
}

// Traduce el código WMO de Open-Meteo a texto en español (lo esencial).
function weatherCodeToText(code: number): string {
  const map: Record<number, string> = {
    0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
    45: 'niebla', 48: 'niebla con escarcha',
    51: 'llovizna ligera', 53: 'llovizna', 55: 'llovizna intensa',
    61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia fuerte',
    71: 'nieve ligera', 73: 'nieve', 75: 'nieve intensa',
    80: 'chubascos', 81: 'chubascos', 82: 'chubascos fuertes',
    95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta fuerte con granizo',
  }
  return map[code] || 'condiciones variables'
}

// Detecta proyectos/hilos activos a partir de las conversaciones recientes.
async function detectActiveProjects(userId: string): Promise<ActiveProject[]> {
  try {
    const convs = await db.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { title: true, updatedAt: true },
    })
    return convs
      .filter((c: any) => c.title && c.title !== 'Nueva conversación')
      .map((c: any) => ({
        title: c.title,
        lastTouched: new Date(c.updatedAt).getTime(),
      }))
  } catch {
    return []
  }
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Devuelve el contexto vivo del usuario, refrescándolo si está vencido.
 * `loc` permite que la capa HTTP pase la ubicación detectada en el cliente.
 */
export async function getLifeContext(
  userId: string,
  loc?: UserLocation,
  opts: { force?: boolean } = {}
): Promise<LifeContext> {
  const now = new Date()
  const stored = await loadStored(userId)

  // La temporalidad se recalcula SIEMPRE (es gratis y cambia minuto a minuto).
  const fresh = stored && !opts.force && (Date.now() - stored.updatedAt < CTX_TTL_MS)

  if (fresh) {
    // Solo refrescamos la hora/franja sobre lo cacheado.
    return { ...stored!, localTime: now.toLocaleString('es-ES'), dayPart: computeDayPart(now) }
  }

  // Reconstrucción completa (señales que sí cuestan: clima, proyectos).
  const location = loc || stored?.location
  const [weather, activeProjects] = await Promise.all([
    fetchWeather(location),
    detectActiveProjects(userId),
  ])

  const ctx: LifeContext = {
    userId,
    location,
    weather: weather || stored?.weather,
    localTime: now.toLocaleString('es-ES'),
    dayPart: computeDayPart(now),
    activeProjects,
    facts: stored?.facts || {},
    updatedAt: Date.now(),
  }
  await saveStored(ctx).catch(() => {})
  return ctx
}

/** Fija o actualiza la ubicación del usuario (desde el cliente o ajustes). */
export async function setUserLocation(userId: string, loc: UserLocation): Promise<LifeContext> {
  const stored = (await loadStored(userId)) || { userId, updatedAt: 0, facts: {} }
  stored.location = loc
  stored.updatedAt = 0 // fuerza refresco del clima en la próxima lectura
  await saveStored(stored as LifeContext)
  return getLifeContext(userId, loc, { force: true })
}

/** Guarda un "hecho" duradero que el usuario quiere que DAYA tenga presente. */
export async function setUserFact(userId: string, key: string, value: string): Promise<void> {
  const stored = (await loadStored(userId)) || { userId, updatedAt: Date.now(), facts: {} }
  stored.facts = { ...(stored.facts || {}), [key]: value }
  await saveStored(stored as LifeContext)
}

/** Borra un hecho. */
export async function deleteUserFact(userId: string, key: string): Promise<void> {
  const stored = await loadStored(userId)
  if (!stored?.facts) return
  delete stored.facts[key]
  await saveStored(stored)
}

/**
 * Construye un bloque de texto compacto, listo para CONCATENAR al system prompt.
 * Pensado para sumarse a lo que ya produce services/memory.ts → buildSystemPrompt,
 * sin reemplazarlo. Si no hay datos útiles, devuelve cadena vacía.
 */
export async function buildLifeContextBlock(userId: string, loc?: UserLocation): Promise<string> {
  try {
    const ctx = await getLifeContext(userId, loc)
    const lines: string[] = []

    if (ctx.localTime) lines.push(`Ahora mismo es ${ctx.localTime} (${ctx.dayPart}).`)

    if (ctx.location?.city || ctx.location?.country) {
      const place = [ctx.location.city, ctx.location.region, ctx.location.country].filter(Boolean).join(', ')
      lines.push(`El usuario está en ${place}.`)
    }

    if (ctx.weather?.tempC != null) {
      lines.push(`El clima local es ${ctx.weather.tempC}°C, ${ctx.weather.description}.`)
    }

    if (ctx.activeProjects && ctx.activeProjects.length) {
      const top = ctx.activeProjects.slice(0, 3).map(p => `"${p.title}"`).join(', ')
      lines.push(`Tiene trabajo en curso relacionado con: ${top}.`)
    }

    if (ctx.facts && Object.keys(ctx.facts).length) {
      const f = Object.entries(ctx.facts).map(([k, v]) => `${k}: ${v}`).join('; ')
      lines.push(`Datos a tener en cuenta del usuario: ${f}.`)
    }

    if (!lines.length) return ''
    return `\n\nContexto en tiempo real (úsalo solo si aporta; no lo menciones salvo que sea relevante):\n${lines.join('\n')}`
  } catch {
    return ''
  }
}
