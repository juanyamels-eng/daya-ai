import { DayaTool } from './types'
import { retrieveRelevant } from '../../docrag/service'

export const docRag: DayaTool = {
  name: 'buscar_en_documentos',
  description: 'Busca por significado en los documentos que el usuario subió a su biblioteca. Úsalo cuando pregunte sobre sus propios archivos o cuando la respuesta pueda estar en ellos.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Qué buscar en los documentos del usuario' } },
    required: ['query'],
  },
  async run(userId, args) {
    const r = await retrieveRelevant(userId, String(args?.query || ''), 5)
    return r || 'No encontré nada relevante en los documentos del usuario.'
  },
}
