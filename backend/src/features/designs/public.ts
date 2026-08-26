import { Router } from 'express'
import { prisma } from '../../lib/prisma'

const db = prisma
const router = Router()

// GET /api/public/design/:token â€” diseÃ±o compartido por enlace, SOLO LECTURA y
// SIN autenticaciÃ³n. Devuelve Ãºnicamente lo necesario para renderizarlo (nada del
// usuario). Solo funciona si el diseÃ±o tiene shareToken activo.
router.get('/design/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '')
    if (!token) return res.status(400).json({ error: 'Token requerido' })
    const d = await db.design.findUnique({
      where: { shareToken: token },
      select: { title: true, data: true, w: true, h: true },
    })
    if (!d) return res.status(404).json({ error: 'DiseÃ±o no encontrado o no compartido' })
    res.json(d)
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

// Resuelve el id del diseÃ±o a partir del token de compartir (o null).
async function designIdByToken(token: string): Promise<string | null> {
  if (!token) return null
  const d = await db.design.findUnique({ where: { shareToken: token }, select: { id: true } })
  return d?.id || null
}

// GET /api/public/design/:token/comments â€” comentarios del diseÃ±o compartido.
router.get('/design/:token/comments', async (req, res) => {
  try {
    const id = await designIdByToken(String(req.params.token || ''))
    if (!id) return res.status(404).json({ error: 'No encontrado' })
    const rows = await db.designComment.findMany({
      where: { designId: id }, orderBy: { createdAt: 'asc' },
      select: { id: true, author: true, body: true, resolved: true, isOwner: true, createdAt: true },
    })
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

// POST /api/public/design/:token/comments â€” dejar feedback como invitado.
router.post('/design/:token/comments', async (req, res) => {
  try {
    const id = await designIdByToken(String(req.params.token || ''))
    if (!id) return res.status(404).json({ error: 'No encontrado' })
    const body = String((req.body?.body ?? '')).trim().slice(0, 1000)
    if (!body) return res.status(400).json({ error: 'Comentario vacÃ­o' })
    const author = String((req.body?.author ?? 'Invitado')).trim().slice(0, 60) || 'Invitado'
    // Anti-spam simple: mÃ¡ximo 200 comentarios por diseÃ±o.
    const count = await db.designComment.count({ where: { designId: id } })
    if (count >= 200) return res.status(429).json({ error: 'Demasiados comentarios' })
    const row = await db.designComment.create({ data: { designId: id, author, body, isOwner: false } })
    res.status(201).json({ id: row.id, author: row.author, body: row.body, resolved: row.resolved, isOwner: row.isOwner, createdAt: row.createdAt })
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

// GET /api/public/conversation/:slug â€” conversaciÃ³n publicada por enlace. SOLO
// LECTURA y SIN autenticaciÃ³n. Va SOLO el texto: las tarjetas de documentos
// generados (marcadores __DOC__/__DOCJSON__) llevan enlaces de descarga privados,
// asÃ­ que se quitan en vez de exponerlos a cualquiera con el enlace.
router.get('/conversation/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '')
    if (!slug) return res.status(400).json({ error: 'Enlace requerido' })
    const row = await db.sharedConversation.findUnique({
      where: { slug },
      select: {
        createdAt: true,
        conversation: {
          select: {
            title: true,
            createdAt: true,
            messages: {
              orderBy: { createdAt: 'asc' },
              select: { id: true, role: true, content: true, createdAt: true },
            },
          },
        },
      },
    })
    if (!row?.conversation) return res.status(404).json({ error: 'ConversaciÃ³n no encontrada o no compartida' })
    const messages = (row.conversation.messages || [])
      .filter((m) => !String(m.content || '').startsWith('__DOC'))
      .map((m) => ({ id: m.id, role: String(m.role).toLowerCase(), content: m.content, createdAt: m.createdAt }))
    res.json({ title: row.conversation.title, sharedAt: row.createdAt, messages })
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

export default router
