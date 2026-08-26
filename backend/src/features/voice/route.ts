import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import { VOICE_CONFIG } from './tts'

const router = Router()

/**
 * GET /api/voice/config — Available voices and languages
 */
router.get('/config', (_req, res) => {
  res.json({
    voices: VOICE_CONFIG.voices,
    defaultVoice: VOICE_CONFIG.defaultVoice,
    languages: [
      { code: 'es', label: 'Español' },
      { code: 'en', label: 'English' },
      { code: 'pt', label: 'Português' },
      { code: 'fr', label: 'Français' },
      { code: 'de', label: 'Deutsch' },
    ],
  })
})

/**
 * GET /api/voice/status — Current voice session status (auth required)
 */
router.get('/status', requireAuth, (req, res) => {
  res.json({ available: true, service: 'msedge-tts', realtime: true })
})

export default router
