import { DayaTool } from './types'
import { searchAndRank } from '../../searchrank/ranking'

export const webSearch: DayaTool = {
  name: 'buscar_web',
  description: 'Busca en la web y devuelve resultados (título, URL, extracto). Úsalo para información actual, noticias, precios o cualquier cosa que no sepas con certeza.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'La consulta de búsqueda' } },
    required: ['query'],
  },
  safeForAct: true,
  async run(_userId, args) {
    const r = await searchAndRank(String(args?.query || ''), 5)
    if (!r.length) return 'Sin resultados.'
    return r.map((x: any, i: number) => `${i + 1}. ${x.title}\n${x.url}\n${x.snippet || ''}`).join('\n\n').slice(0, 4000)
  },
}
