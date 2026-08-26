// ============================================
// DAYA IA — Feature: API Tokens
// Allows users to create tokens to use the DAYA API from their apps/scripts.
// Only the HASH is stored; the full token is shown ONCE when created.
//
// NOTE: requires `npx prisma generate && npx prisma db push` (creates ApiToken).
// ============================================
import { Router, Request } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const db = prisma as any
const router = Router()
router.use(requireAuth)
const uid = (req: Request) => (req as any).userId

// Lists tokens (without the real value, only prefix and metadata)
router.get('/', async (req, res) => {
  try {
    const tokens = await db.apiToken.findMany({
      where: { userId: uid(req) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    })
    res.json(tokens)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Creates a new token and returns it ONCE
router.post('/', async (req, res) => {
  const { name } = req.body
  try {
    const raw = 'dy_' + crypto.randomBytes(24).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    const prefix = raw.slice(0, 10)
    await db.apiToken.create({ data: { userId: uid(req), name: (name || 'Token').slice(0, 40), prefix, tokenHash } })
    // The full token is only shown now; it cannot be recovered later.
    res.status(201).json({ token: raw, prefix, name: name || 'Token' })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Revokes (deletes) a token
router.delete('/:id', async (req, res) => {
  try {
    await db.apiToken.deleteMany({ where: { id: req.params.id, userId: uid(req) } })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
