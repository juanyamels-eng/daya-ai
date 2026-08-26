import { Router, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'

// Includes con relaciones ausentes en el schema generado: se mantiene el acceso dinámico histórico.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const router = Router()

// ============================================
// BROWSE & SEARCH
// ============================================

// List published items (public)
router.get('/', async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'rating'
  const pageNum = Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1'))
  const take = Math.min(50, Math.max(1, parseInt(typeof req.query.limit === 'string' ? req.query.limit : '20')))
  const skip = (pageNum - 1) * take

  const where: Prisma.MarketplaceItemWhereInput = { status: 'PUBLISHED' }
  if (category) where.category = category
  if (type) where.type = type as Prisma.MarketplaceItemWhereInput['type']
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { tags: { has: search } },
    ]
  }

  const orderBy: Prisma.MarketplaceItemOrderByWithRelationInput = sort === 'newest' ? { createdAt: 'desc' }
    : sort === 'installs' ? { installCount: 'desc' }
    : sort === 'price' ? { priceCents: 'asc' }
    : { rating: 'desc' }

  const [items, total] = await Promise.all([
    db.marketplaceItem.findMany({
      where, orderBy, skip, take,
      select: {
        id: true, name: true, slug: true, description: true, category: true,
        type: true, priceCents: true, currency: true, rating: true,
        ratingCount: true, installCount: true, icon: true, tags: true,
        sellerId: true, version: true, createdAt: true,
      },
    }),
    db.marketplaceItem.count({ where }),
  ])

  res.json({ items, total, page: pageNum, pages: Math.ceil(total / take) })
})

// Get item detail (public)
router.get('/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params

  const item = await db.marketplaceItem.findUnique({
    where: { slug },
    include: {
      reviews: { take: 10, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } },
      _count: { select: { reviews: true, purchases: true } },
    },
  })

  if (!item || item.status !== 'PUBLISHED') {
    return res.status(404).json({ error: 'Item no encontrado' })
  }

  res.json({ item })
})

// ============================================
// SELLER: CRUD MY ITEMS
// ============================================

// Create item
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { name, slug, description, longDesc, category, type, priceCents, icon, tags, config, code, homepage, repository } = req.body

  if (!name || !slug || !description) {
    return res.status(400).json({ error: 'name, slug y description requeridos' })
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug: solo minúsculas, números y guiones' })
  }

  const existing = await db.marketplaceItem.findUnique({ where: { slug } })
  if (existing) {
    return res.status(409).json({ error: 'Ese slug ya está en uso' })
  }

  const item = await db.marketplaceItem.create({
    data: {
      sellerId: userId,
      name,
      slug,
      description,
      longDesc: longDesc || '',
      category: category || 'general',
      type: type || 'TOOL',
      priceCents: priceCents || 0,
      icon,
      tags: tags || [],
      config,
      code,
      homepage,
      repository,
    },
  })

  res.json({ item })
})

// List my items
router.get('/my/items', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId

  const items = await db.marketplaceItem.findMany({
    where: { sellerId: userId },
    orderBy: { updatedAt: 'desc' },
  })

  res.json({ items })
})

// Update my item
router.put('/:itemId', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { itemId } = req.params

  const item = await db.marketplaceItem.findUnique({ where: { id: itemId } })
  if (!item) return res.status(404).json({ error: 'Item no encontrado' })
  if (item.sellerId !== userId) return res.status(403).json({ error: 'No eres el vendedor' })

  const { name, description, longDesc, category, priceCents, icon, tags, config, code, homepage, repository, status } = req.body

  const updated = await db.marketplaceItem.update({
    where: { id: itemId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(longDesc !== undefined && { longDesc }),
      ...(category !== undefined && { category }),
      ...(priceCents !== undefined && { priceCents }),
      ...(icon !== undefined && { icon }),
      ...(tags !== undefined && { tags }),
      ...(config !== undefined && { config }),
      ...(code !== undefined && { code }),
      ...(homepage !== undefined && { homepage }),
      ...(repository !== undefined && { repository }),
      ...(status !== undefined && { status }),
    },
  })

  res.json({ item: updated })
})

// Delete my item
router.delete('/:itemId', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { itemId } = req.params

  const item = await db.marketplaceItem.findUnique({ where: { id: itemId } })
  if (!item) return res.status(404).json({ error: 'Item no encontrado' })
  if (item.sellerId !== userId) return res.status(403).json({ error: 'No eres el vendedor' })

  await db.marketplaceItem.delete({ where: { id: itemId } })
  res.json({ ok: true })
})

// Submit for review
router.post('/:itemId/submit', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { itemId } = req.params

  const item = await db.marketplaceItem.findUnique({ where: { id: itemId } })
  if (!item) return res.status(404).json({ error: 'Item no encontrado' })
  if (item.sellerId !== userId) return res.status(403).json({ error: 'No eres el vendedor' })
  if (item.status !== 'DRAFT') return res.status(400).json({ error: 'Solo items en borrador se pueden enviar' })

  const updated = await db.marketplaceItem.update({
    where: { id: itemId },
    data: { status: 'REVIEW' },
  })

  res.json({ item: updated })
})

// ============================================
// PURCHASES
// ============================================

// Purchase item (free or paid)
router.post('/:itemId/purchase', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { itemId } = req.params

  const item = await db.marketplaceItem.findUnique({ where: { id: itemId } })
  if (!item) return res.status(404).json({ error: 'Item no encontrado' })
  if (item.status !== 'PUBLISHED') return res.status(400).json({ error: 'Item no disponible' })

  // Check if already purchased
  const existing = await db.marketplacePurchase.findUnique({
    where: { itemId_userId: { itemId, userId } },
  })
  if (existing) return res.status(409).json({ error: 'Ya compraste este item' })

  const purchase = await db.marketplacePurchase.create({
    data: {
      itemId,
      userId,
      amountCents: item.priceCents,
      currency: item.currency,
      status: item.priceCents === 0 ? 'COMPLETED' : 'PENDING',
    },
  })

  // Increment install count
  await db.marketplaceItem.update({
    where: { id: itemId },
    data: { installCount: { increment: 1 } },
  })

  res.json({ purchase })
})

// Check if I own an item
router.get('/:itemId/ownership', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { itemId } = req.params

  const purchase = await db.marketplacePurchase.findUnique({
    where: { itemId_userId: { itemId, userId } },
  })

  const item = await db.marketplaceItem.findUnique({ where: { id: itemId } })
  const isOwner = item?.sellerId === userId

  res.json({ owned: isOwner || !!purchase })
})

// ============================================
// REVIEWS
// ============================================

// Add review
router.post('/:itemId/reviews', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { itemId } = req.params
  const { rating, title, content } = req.body

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating debe ser 1-5' })
  }

  // Must have purchased or be the seller
  const item = await db.marketplaceItem.findUnique({ where: { id: itemId } })
  if (!item) return res.status(404).json({ error: 'Item no encontrado' })

  const purchase = await db.marketplacePurchase.findUnique({
    where: { itemId_userId: { itemId, userId } },
  })
  if (!purchase && item.sellerId !== userId) {
    return res.status(403).json({ error: 'Debes comprar el item para reseñarlo' })
  }

  const review = await db.marketplaceReview.create({
    data: { itemId, userId, rating, title: title || '', content: content || '' },
  })

  // Update item rating
  const stats = await db.marketplaceReview.aggregate({
    where: { itemId },
    _avg: { rating: true },
    _count: { rating: true },
  })

  await db.marketplaceItem.update({
    where: { id: itemId },
    data: {
      rating: stats._avg.rating || 0,
      ratingCount: stats._count.rating,
    },
  })

  res.json({ review })
})

// ============================================
// CATEGORIES (helper)
// ============================================

router.get('/meta/categories', async (_req: Request, res: Response) => {
  const categories = [
    { value: 'general', label: 'General', icon: '🔧' },
    { value: 'automation', label: 'Automatización', icon: '⚡' },
    { value: 'data', label: 'Datos', icon: '📊' },
    { value: 'ai', label: 'IA / ML', icon: '🤖' },
    { value: 'dev', label: 'Desarrollo', icon: '💻' },
    { value: 'productivity', label: 'Productividad', icon: '📋' },
    { value: 'communication', label: 'Comunicación', icon: '💬' },
    { value: 'finance', label: 'Finanzas', icon: '💰' },
    { value: 'design', label: 'Diseño', icon: '🎨' },
  ]
  res.json({ categories })
})

export default router
