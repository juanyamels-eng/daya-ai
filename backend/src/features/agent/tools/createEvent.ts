import { DayaTool } from './types'
import { prisma } from '../../../lib/prisma'

export const createEvent: DayaTool = {
  name: 'crear_evento',
  description: 'Crea un evento en el calendario del usuario (citas, reuniones, recordatorios con fecha y hora). Calcula la fecha ISO usando la fecha actual que conoces.',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string' },
      inicio: { type: 'string', description: 'Inicio en ISO 8601, p.ej. 2026-07-10T15:00:00' },
      fin: { type: 'string', description: 'Fin en ISO 8601 (opcional)' },
      notas: { type: 'string' },
    },
    required: ['titulo', 'inicio'],
  },
  async run(userId, args) {
    const title = String(args?.titulo || '').trim()
    if (!title) return 'Falta el título del evento.'
    const start = new Date(String(args?.inicio || ''))
    if (isNaN(start.getTime())) return 'Falta una fecha/hora de inicio válida (ISO).'
    let end: Date | undefined
    if (args?.fin) { const e = new Date(String(args.fin)); if (!isNaN(e.getTime())) end = e }
    const notes = String(args?.notas || '').slice(0, 500)
    await prisma.calendarEvent.create({ data: { userId, title, start, end, notes } })
    return `✓ Evento creado: "${title}" el ${start.toLocaleString('es-ES')}.`
  },
}
