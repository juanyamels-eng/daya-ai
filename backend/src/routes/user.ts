import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { clearUserCache } from '../services/memory'

const router = Router()
router.use(requireAuth)

router.get('/memories', async (req, res) => {
  const userId = (req as any).userId
  try {
    const memories = await prisma.memory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
    res.json(memories)
  } catch (e: any) {
    res.status(500).json({ error: 'Could not load memories.' })
  }
})

router.delete('/memories/:id', async (req, res) => {
  const userId = (req as any).userId
  try {
    await prisma.memory.deleteMany({ where: { id: req.params.id, userId } })
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: 'Could not delete memory.' })
  }
})

router.patch('/profile', async (req, res) => {
  const userId = (req as any).userId
  const { name, profession, interests, language, tone, length, responseLength } = req.body
  try {
    if (typeof name === 'string' && name.trim()) {
      await prisma.user.update({ where: { id: userId }, data: { name: name.trim().slice(0, 50) } })
    }

    const profileData: any = {}
    if (profession !== undefined) profileData.profession = profession
    if (Array.isArray(interests)) profileData.interests = interests
    if (language !== undefined) profileData.language = language
    if (tone !== undefined) profileData.tone = tone
    const len = responseLength ?? length
    if (len !== undefined) profileData.responseLength = len

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: profileData,
      create: { userId, ...profileData },
    })
    clearUserCache(userId)
    res.json({ success: true, profile })
  } catch (e: any) {
    res.status(500).json({ error: 'Could not save profile.' })
  }
})

// Export all user data (access right — Law 29733)
router.get('/export-data', async (req, res) => {
  const userId = (req as any).userId
  try {
    const [user, profile, conversations, memories] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, plan: true, createdAt: true, emailVerified: true },
      }),
      prisma.userProfile.findUnique({ where: { userId } }),
      // Limit to 500 most recent conversations to avoid OOM on large accounts
      prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 500,
        include: { messages: { select: { role: true, content: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
      }),
      prisma.memory.findMany({
        where: { userId }, select: { content: true, category: true, createdAt: true },
      }),
    ])
    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-daya.json"')
    res.json({ exportedAt: new Date().toISOString(), user, profile, conversations, memories })
  } catch (e: any) {
    res.status(500).json({ error: 'Could not export data.' })
  }
})

// Delete the account and ALL associated data (right to erasure — Law 29733)
router.delete('/account', async (req, res) => {
  const userId = (req as any).userId
  try {
    // Delete first the tables that store userId without formal relation (no cascade)
    await prisma.libraryDocument.deleteMany({ where: { userId } }).catch(() => {})
    await prisma.trainingData.deleteMany({ where: { userId } }).catch(() => {})
    // The rest (conversations, messages, profile, memories) is handled by onDelete: Cascade
    await prisma.user.delete({ where: { id: userId } })
    res.json({ success: true, message: 'Tu cuenta y todos tus datos han sido eliminados permanentemente.' })
  } catch (error: any) {
    res.status(500).json({ error: 'Could not delete account: ' + error.message })
  }
})

// Upload/update avatar (data URI base64). Saved in the profile.
router.post('/avatar', async (req, res) => {
  const userId = (req as any).userId
  const { avatar } = req.body
  if (!avatar || typeof avatar !== 'string' || !avatar.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image' })
  }
  // Size limit (~1.5MB in base64) to avoid saturating the DB
  if (avatar.length > 2_000_000) {
    return res.status(413).json({ error: 'The image is too large (max 1.5MB)' })
  }
  try {
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: avatar } })
    await prisma.userProfile.upsert({
      where: { userId }, update: { avatarUrl: avatar }, create: { userId, avatarUrl: avatar },
    })
    res.json({ success: true, avatarUrl: avatar })
  } catch (e: any) {
    res.status(500).json({ error: 'Could not save avatar.' })
  }
})

// Support / issue report
router.post('/support', async (req, res) => {
  const userId = (req as any).userId
  const { message } = req.body
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' })
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })

  // Log the report
  console.log('📨 [SOPORTE] Nuevo reporte de', user?.email || userId)
  console.log('   Usuario:', user?.name)
  console.log('   Mensaje:', message.trim())

  res.json({ success: true, message: 'Reporte recibido. Gracias por tu retroalimentación.' })
})

export default router
