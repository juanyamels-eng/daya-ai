import { DayaTool } from './types'
import { readPageText } from '../../readurl/route'

export const readUrl: DayaTool = {
  name: 'leer_url',
  description: 'Lee el contenido completo de una página web (funciona incluso con sitios que cargan por JavaScript). Úsalo para profundizar en un resultado de búsqueda o en un enlace que dé el usuario.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'La URL a leer' } },
    required: ['url'],
  },
  safeForAct: true,
  async run(_userId, args) {
    const r = await readPageText(String(args?.url || ''))
    return ('error' in r) ? `No pude leer la página: ${r.error}` : r.text.slice(0, 6000)
  },
}
