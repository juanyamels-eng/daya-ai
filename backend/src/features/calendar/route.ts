// ============================================
// DAYA IA — Feature: Calendario (local-first)
// Eventos en la base de datos + exportación a .ics estándar (compatible con
// Google/Apple/Outlook/Nextcloud). CalDAV de sincronización queda como mejora
// opcional futura; esto ya funciona 100% solo.
//
// NOTA: requiere `npx prisma generate && npx prisma db push` en tu entorno para
// crear la tabla CalendarEvent. Mientras tanto accedemos vía `db` (cast).
// ============================================
import { Router, Request } from 'express'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const db = prisma as any
const router = Router()
router.use(requireAuth)

const uid = (req: Request) => (req as any).userId

// Lista eventos en un rango opcional (?from=ISO&to=ISO)
router.get('/events', async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string }
  try {
    const where: any = { userId: uid(req) }
    if (from || to) {
      where.start = {}
      if (from) where.start.gte = new Date(from)
      if (to) where.start.lte = new Date(to)
    }
    const events = await db.calendarEvent.findMany({ where, orderBy: { start: 'asc' } })
    res.json(events)
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

router.post('/events', async (req, res) => {
  const { title, notes, start, end, allDay, color } = req.body
  if (!title || !start) return res.status(400).json({ error: 'Faltan título y fecha de inicio.' })
  try {
    const ev = await db.calendarEvent.create({
      data: {
        userId: uid(req),
        title: String(title).trim(),
        notes: notes || '',
        start: new Date(start),
        end: end ? new Date(end) : null,
        allDay: !!allDay,
        color: color || 'default',
      },
    })
    res.status(201).json(ev)
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

router.patch('/events/:id', async (req, res) => {
  const { title, notes, start, end, allDay, color } = req.body
  try {
    const r = await db.calendarEvent.updateMany({
      where: { id: req.params.id, userId: uid(req) },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(start !== undefined ? { start: new Date(start) } : {}),
        ...(end !== undefined ? { end: end ? new Date(end) : null } : {}),
        ...(allDay !== undefined ? { allDay: !!allDay } : {}),
        ...(color !== undefined ? { color } : {}),
      },
    })
    res.json({ success: r.count > 0 })
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

router.delete('/events/:id', async (req, res) => {
  try {
    await db.calendarEvent.deleteMany({ where: { id: req.params.id, userId: uid(req) } })
    res.json({ success: true })
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

// ── Exportación a .ics estándar (descargable, abre en cualquier calendario) ──
function toICSDate(d: Date, allDay: boolean): string {
  if (allDay) return d.toISOString().slice(0, 10).replace(/-/g, '')
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}
function escapeICS(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

router.get('/export.ics', async (req, res) => {
  try {
    const events = await db.calendarEvent.findMany({ where: { userId: uid(req) }, orderBy: { start: 'asc' } })
    const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DAYA AI//Calendario//ES', 'CALSCALE:GREGORIAN']
    for (const ev of events) {
      const start = new Date(ev.start)
      const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 3600000)
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${ev.id}@daya-ia`)
      lines.push(`DTSTAMP:${toICSDate(new Date(), false)}`)
      lines.push(`${ev.allDay ? 'DTSTART;VALUE=DATE' : 'DTSTART'}:${toICSDate(start, ev.allDay)}`)
      lines.push(`${ev.allDay ? 'DTEND;VALUE=DATE' : 'DTEND'}:${toICSDate(end, ev.allDay)}`)
      lines.push(`SUMMARY:${escapeICS(ev.title)}`)
      if (ev.notes) lines.push(`DESCRIPTION:${escapeICS(ev.notes)}`)
      lines.push('END:VEVENT')
    }
    lines.push('END:VCALENDAR')
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="daya-calendario.ics"')
    res.send(lines.join('\r\n'))
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

export default router
