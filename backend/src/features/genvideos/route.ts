import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'
import { submitVideoGeneration, checkVideoStatus, VideoModel } from '../../services/videoGen'
import { consumeQuota, refundQuota } from '../../services/quota'

const router = Router()
const db = prisma as any

/**
 * POST /api/videos/generate — Generate a video
 */
router.post('/generate', requireAuth, async (req: any, res) => {
  try {
    const userId = req.userId
    const { prompt, model, duration, resolution, imageUrl } = req.body

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt requerido' })
    }

    // Consume video quota
    const quota = await consumeQuota(userId, 'video' as any)
    if (!quota.ok) {
      return res.status(429).json({ error: quota.error })
    }

    // Create DB record
    const video = await db.generatedVideo.create({
      data: {
        userId,
        prompt: prompt.slice(0, 500),
        model: model || 'kling-turbo',
        duration: duration || 5,
        resolution: resolution || '720p',
        status: 'processing',
      },
    })

    try {
      const result = await submitVideoGeneration({
        prompt,
        model: (model as VideoModel) || 'kling-turbo',
        duration: duration || 5,
        resolution: resolution || '720p',
        imageUrl,
      })

      // Store requestId for polling
      await db.generatedVideo.update({
        where: { id: video.id },
        data: { status: 'processing' },
      })

      res.json({ video: { ...video, status: 'processing' }, requestId: result.requestId })
    } catch (err: any) {
      // Refund quota on failure
      await refundQuota(userId, 'video' as any)
      await db.generatedVideo.update({
        where: { id: video.id },
        data: { status: 'failed' },
      })
      res.status(500).json({ error: err?.message || 'Error generando video' })
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error del servidor' })
  }
})

/**
 * GET /api/videos/:id/status — Poll video generation status
 */
router.get('/:id/status', requireAuth, async (req: any, res) => {
  try {
    const video = await db.generatedVideo.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!video) return res.status(404).json({ error: 'Video no encontrado' })

    if (video.status === 'completed') {
      return res.json({ status: 'completed', url: video.url, thumbnailUrl: video.thumbnailUrl })
    }

    if (video.status === 'failed') {
      return res.json({ status: 'failed' })
    }

    // Try polling fal.ai
    try {
      const result = await checkVideoStatus(video.id)
      if (result.status === 'completed' && result.url) {
        await db.generatedVideo.update({
          where: { id: video.id },
          data: { status: 'completed', url: result.url, thumbnailUrl: result.thumbnailUrl || '' },
        })
        return res.json({ status: 'completed', url: result.url, thumbnailUrl: result.thumbnailUrl })
      }
      if (result.status === 'failed') {
        await db.generatedVideo.update({ where: { id: video.id }, data: { status: 'failed' } })
        return res.json({ status: 'failed' })
      }
    } catch {}

    res.json({ status: video.status })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error' })
  }
})

/**
 * GET /api/videos — List user's videos
 */
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const videos = await db.generatedVideo.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json({ videos })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error' })
  }
})

/**
 * DELETE /api/videos/:id — Delete a video
 */
router.delete('/:id', requireAuth, async (req: any, res) => {
  try {
    await db.generatedVideo.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error' })
  }
})

export default router
