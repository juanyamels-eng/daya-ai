import { DayaTool } from './types'
import { prisma } from '../../../lib/prisma'

export const createNote: DayaTool = {
  name: 'crear_nota',
  description: 'Guarda una nota en la cuenta del usuario. Úsalo cuando pida anotar, guardar o recordar INFORMACIÓN (no una tarea por hacer).',
  parameters: {
    type: 'object',
    properties: { titulo: { type: 'string' }, contenido: { type: 'string' } },
    required: ['contenido'],
  },
  async run(userId, args) {
    const content = String(args?.contenido || '').trim()
    if (!content) return 'Falta el contenido de la nota.'
    const title = String(args?.titulo || '').trim() || content.slice(0, 40)
    await prisma.note.create({ data: { userId, title, content } })
    return `✓ Nota guardada: "${title}".`
  },
}
