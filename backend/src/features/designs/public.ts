import { Router } from 'express'
import { prisma } from '../../lib/prisma'

const db = prisma as any
const router = Router()

// GET /api/public/design/:token — diseño compartido por enlace, SOLO LECTURA y
// SIN autenticación. Devuelve únicamente lo necesario para renderizarlo (nada del
// usuario). Solo funciona si el diseño tiene shareToken activo.
router.get('/design/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '')
    if (!token) return res.status(400).json({ error: 'Token requerido' })
    const d = await db.design.findUnique({
      where: { shareToken: token },
      select: { title: true, data: true, w: true, h: true },
    })
    if (!d) return res.status(404).json({ error: 'Diseño no encontrado o no compartido' })
    res.json(d)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Resuelve el id del diseño a partir del token de compartir (o null).
async function designIdByToken(token: string): Promise<string | null> {
  if (!token) return null
  const d = await db.design.findUnique({ where: { shareToken: token }, select: { id: true } })
  return d?.id || null
}

// GET /api/public/design/:token/comments — comentarios del diseño compartido.
router.get('/design/:token/comments', async (req, res) => {
  try {
    const id = await designIdByToken(String(req.params.token || ''))
    if (!id) return res.status(404).json({ error: 'No encontrado' })
    const rows = await db.designComment.findMany({
      where: { designId: id }, orderBy: { createdAt: 'asc' },
      select: { id: true, author: true, body: true, resolved: true, isOwner: true, createdAt: true },
    })
    res.json(rows)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// POST /api/public/design/:token/comments — dejar feedback como invitado.
router.post('/design/:token/comments', async (req, res) => {
  try {
    const id = await designIdByToken(String(req.params.token || ''))
    if (!id) return res.status(404).json({ error: 'No encontrado' })
    const body = String((req.body?.body ?? '')).trim().slice(0, 1000)
    if (!body) return res.status(400).json({ error: 'Comentario vacío' })
    const author = String((req.body?.author ?? 'Invitado')).trim().slice(0, 60) || 'Invitado'
    // Anti-spam simple: máximo 200 comentarios por diseño.
    const count = await db.designComment.count({ where: { designId: id } })
    if (count >= 200) return res.status(429).json({ error: 'Demasiados comentarios' })
    const row = await db.designComment.create({ data: { designId: id, author, body, isOwner: false } })
    res.status(201).json({ id: row.id, author: row.author, body: row.body, resolved: row.resolved, isOwner: row.isOwner, createdAt: row.createdAt })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// GET /api/public/conversation/:slug — conversación publicada por enlace. SOLO
// LECTURA y SIN autenticación. Va SOLO el texto: las tarjetas de documentos
// generados (marcadores __DOC__/__DOCJSON__) llevan enlaces de descarga privados,
// así que se quitan en vez de exponerlos a cualquiera con el enlace.
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
    if (!row?.conversation) return res.status(404).json({ error: 'Conversación no encontrada o no compartida' })
    const messages = (row.conversation.messages || [])
      .filter((m: any) => !String(m.content || '').startsWith('__DOC'))
      .map((m: any) => ({ id: m.id, role: String(m.role).toLowerCase(), content: m.content, createdAt: m.createdAt }))
    res.json({ title: row.conversation.title, sharedAt: row.createdAt, messages })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
