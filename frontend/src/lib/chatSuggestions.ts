/* ============================================================================
   Sugerencias del chat vacío.

   Se miran los títulos de las últimas conversaciones (que Daya genera a partir
   del contenido real, así que describen bien de qué se habló) y se proponen
   cuatro cosas acordes: a quien pregunta de código se le ofrece código; a quien
   sube documentos, trabajar con ellos.

   Solo títulos: bajarse los mensajes de diez conversaciones para pintar cuatro
   botones sería diez peticiones al servidor cada vez que se abre un chat nuevo.
   Sin historial —usuario recién llegado— se cae a las sugerencias genéricas.
   ========================================================================== */

export interface Suggestion {
  /** Lo que se lee en la tarjeta. */
  label: string
  /** Lo que se escribe en el redactor al pulsarla. */
  prompt: string
}

type Topic = 'code' | 'docs' | 'research' | 'agenda' | 'image'

const PATTERNS: Record<Topic, RegExp> = {
  code:     /c[oó]digo|python|javascript|typescript|react|node|sql|api\b|funci[oó]n|script|bug|error|programa|css|html|consulta|query|regex/i,
  docs:     /documento|informe|reporte|pdf|contrato|propuesta|curr[ií]culum|\bcv\b|carta|acta|ensayo|presentaci[oó]n|excel|word|resumen/i,
  research: /investiga|investigaci[oó]n|research|an[aá]lisis|estudio|compara|mercado|tendencia|fuentes|art[ií]culo/i,
  agenda:   /tarea|agenda|calendario|reuni[oó]n|pendiente|recordatorio|planifica|horario|semana/i,
  image:    /imagen|logo|dise[ñn]o|foto|banner|cartel|ilustraci[oó]n|miniatura/i,
}

const BY_TOPIC: Record<Topic, (hint: string) => Suggestion> = {
  code: () => ({
    label: 'Escribe una función de Python',
    prompt: 'Escribe una función de Python que ',
  }),
  docs: () => ({
    label: 'Resume mi último documento',
    prompt: 'Resume mi último documento y dame sus puntos clave.',
  }),
  research: (hint) => ({
    label: hint ? `Investiga sobre ${hint}` : 'Investiga un tema a fondo',
    prompt: hint ? `Investiga a fondo sobre ${hint} y dame un informe con fuentes.` : 'Investiga a fondo sobre ',
  }),
  agenda: () => ({
    label: '¿Qué tengo pendiente para hoy?',
    prompt: '¿Qué tengo pendiente para hoy?',
  }),
  image: () => ({
    label: 'Genera una imagen',
    prompt: 'Genera una imagen de ',
  }),
}

const GENERIC: Suggestion[] = [
  { label: 'Explícame algo complejo en simple', prompt: 'Explícame de forma sencilla ' },
  { label: 'Redacta un correo profesional',     prompt: 'Redacta un correo profesional para ' },
  { label: 'Escribe un documento',              prompt: 'Escríbeme un documento sobre ' },
  { label: 'Dame ideas para',                   prompt: 'Dame ideas para ' },
]

/** Recorta un título para usarlo como tema ("Análisis del mercado de café" → "el mercado de café"). */
function asTopic(title: string): string {
  const clean = (title || '')
    .replace(/^(an[aá]lisis|investigaci[oó]n|estudio|informe|resumen)\s+(de|del|sobre)\s+/i, '')
    .trim()
  if (clean.length < 3 || clean.length > 42) return ''
  return clean.charAt(0).toLowerCase() + clean.slice(1)
}

export function buildSuggestions(conversations: { title: string }[] = []): Suggestion[] {
  const recent = conversations.slice(0, 10)
  if (!recent.length) return GENERIC

  const counts: Record<Topic, number> = { code: 0, docs: 0, research: 0, agenda: 0, image: 0 }
  let researchHint = ''
  for (const c of recent) {
    const title = c?.title || ''
    for (const key of Object.keys(PATTERNS) as Topic[]) {
      if (PATTERNS[key].test(title)) {
        counts[key]++
        if (key === 'research' && !researchHint) researchHint = asTopic(title)
      }
    }
  }

  const ranked = (Object.keys(counts) as Topic[])
    .filter(k => counts[k] > 0)
    .sort((a, b) => counts[b] - counts[a])

  if (!ranked.length) return GENERIC

  const out: Suggestion[] = ranked.map(k => BY_TOPIC[k](researchHint))
  // Se completa con genéricas que no repitan lo ya propuesto.
  for (const g of GENERIC) {
    if (out.length >= 4) break
    if (!out.some(s => s.label === g.label)) out.push(g)
  }
  return out.slice(0, 4)
}
