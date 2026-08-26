import { DayaTool } from './types'
import { prisma } from '../../../lib/prisma'

export const createTask: DayaTool = {
  name: 'crear_tarea',
  description: 'Crea una tarea pendiente en la cuenta del usuario. Úsalo cuando pida agendar, recordar o apuntar algo POR HACER.',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string' },
      prioridad: { type: 'string', enum: ['low', 'normal', 'high'] },
      fecha: { type: 'string', description: 'Fecha límite en formato ISO (YYYY-MM-DD), opcional' },
    },
    required: ['titulo'],
  },
  async run(userId, args) {
    const title = String(args?.titulo || '').trim()
    if (!title) return 'Falta el título de la tarea.'
    const priority = ['low', 'normal', 'high'].includes(args?.prioridad) ? args.prioridad : 'normal'
    let dueDate: Date | undefined
    if (args?.fecha) { const d = new Date(String(args.fecha)); if (!isNaN(d.getTime())) dueDate = d }
    await prisma.task.create({ data: { userId, title, priority, dueDate } })
    return `✓ Tarea creada: "${title}"${dueDate ? ` (para ${dueDate.toISOString().slice(0, 10)})` : ''}.`
  },
}
