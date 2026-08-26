import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { logger } from '../../services/logger'

const db = prisma
const router = Router()

// ============================================
// SLACK BOT INTEGRATION
// DAYA responds in Slack channels
// ============================================

// Slack app installation webhook
router.post('/events', async (req: Request, res: Response) => {
  const body = req.body

  // URL verification challenge
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge })
  }

  // Event callback
  if (body.type === 'event_callback') {
    const event = body.event

    // Handle mention
    if (event.type === 'message' && event.text?.includes('<@DAYA_BOT_ID>')) {
      const channelId = event.channel
      const message = event.text.replace(/<@DAYA_BOT_ID>/g, '').trim()

      // Find workspace for this channel
      const integration = await db.slackIntegration.findFirst({
        where: { teamId: body.team_id },
      })

      if (!integration) {
        logger.info('[Slack] No integration found for team', body.team_id)
        return res.json({ ok: true })
      }

      // Process with DAYA
      try {
        const { chatSingle } = await import('../../services/openrouter')

        const reply = await chatSingle(
          [{ role: 'user', content: message }],
          'claude',
          'Eres DAYA, un asistente de IA integrado en Slack. Responde de forma concisa y útil. Usa markdown cuando sea apropiado.'
        )

        // Send reply to Slack
        await sendSlackMessage(integration.botToken, channelId, reply)

        // Log usage
        await db.analyticsEvent.create({
          data: {
            eventType: 'slack_message',
            userId: integration.userId,
            metadata: { channelId, message: message.slice(0, 100) },
          },
        })
      } catch (e) {
        console.error('[Slack] Error processing message:', e)
        await sendSlackMessage(
          integration.botToken,
          channelId,
          'Lo siento, hubo un error procesando tu mensaje. Intenta de nuevo.'
        )
      }
    }

    // Handle app mention
    if (event.type === 'app_mention') {
      logger.info({ event }, '[Slack] App mentioned')
    }

    return res.json({ ok: true })
  }

  res.json({ ok: true })
})

// OAuth callback
router.get('/oauth/callback', async (req: Request, res: Response) => {
  const { code } = req.query

  if (!code) {
    return res.status(400).json({ error: 'Code required' })
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code: code as string,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenData.ok) {
      return res.status(400).json({ error: tokenData.error })
    }

    // Store integration
    await db.slackIntegration.create({
      data: {
        teamId: tokenData.team.id,
        teamName: tokenData.team.name,
        botToken: tokenData.access_token,
        userId: tokenData.authed_user.id,
      },
    })

    // Redirect to success page
    res.redirect(`${process.env.FRONTEND_URL}/settings?slack=connected`)
  } catch (e) {
    console.error('[Slack OAuth] Error:', e)
    res.redirect(`${process.env.FRONTEND_URL}/settings?slack=error`)
  }
})

// Get Slack integrations for user
router.get('/integrations', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId

  const integrations = await db.slackIntegration.findMany({
    where: { userId },
    select: {
      id: true,
      teamId: true,
      teamName: true,
      channelId: true,
      channelName: true,
      isActive: true,
      createdAt: true,
    },
  })

  res.json({ integrations })
})

// Configure channel
router.put('/integrations/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params
  const { channelId, channelName, isActive } = req.body

  const integration = await db.slackIntegration.findFirst({
    where: { id, userId },
  })

  if (!integration) {
    return res.status(404).json({ error: 'Integración no encontrada' })
  }

  const updated = await db.slackIntegration.update({
    where: { id },
    data: {
      ...(channelId !== undefined && { channelId }),
      ...(channelName !== undefined && { channelName }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  res.json({ integration: updated })
})

// Disconnect
router.delete('/integrations/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { id } = req.params

  const integration = await db.slackIntegration.findFirst({
    where: { id, userId },
  })

  if (!integration) {
    return res.status(404).json({ error: 'Integración no encontrada' })
  }

  await db.slackIntegration.delete({ where: { id } })
  res.json({ ok: true })
})

// Get OAuth URL for installation
router.get('/install-url', requireAuth, async (req: Request, res: Response) => {
  const scopes = [
    'chat:write',
    'app_mentions:read',
    'channels:history',
    'channels:read',
    'im:history',
    'im:read',
  ].join(',')

  const url = `https://slack.com/oauth/v2/authorize?` +
    `client_id=${process.env.SLACK_CLIENT_ID}&` +
    `scope=${scopes}&` +
    `redirect_uri=${encodeURIComponent(process.env.SLACK_REDIRECT_URI || '')}`

  res.json({ url })
})

// Helper: Send Slack message
async function sendSlackMessage(token: string, channel: string, text: string): Promise<void> {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  })
}

export default router
