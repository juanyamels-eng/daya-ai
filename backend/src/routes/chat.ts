import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { heavyLimiter, chatBurstLimiter } from '../middleware/rateLimiter'
import {
  sendMessage,
  getConversations,
  getConversation,
  deleteConversation,
  renameConversation,
  saveDocNote,
  shareConversation,
  unshareConversation,
  getShareStatus,
  sendFeedback,
  exportConversationPdf,
  transcribeAudioHandler,
  deepResearchHandler,
} from '../controllers/chatController'

const router = Router()

router.use(requireAuth)

router.post('/send', chatBurstLimiter, sendMessage)
router.get('/conversations', getConversations)
router.get('/conversations/:id', getConversation)
router.delete('/conversations/:id', deleteConversation)
router.patch('/conversations/:id', renameConversation)
router.post('/note', saveDocNote)

// Share conversation
router.post('/conversations/:id/share', shareConversation)
router.delete('/conversations/:id/share', unshareConversation)
router.get('/conversations/:id/share', getShareStatus)

// Feedback
router.post('/feedback', sendFeedback)

// Export PDF
router.get('/conversations/:id/pdf', exportConversationPdf)

// Transcribe audio
router.post('/transcribe', ...transcribeAudioHandler)

// Deep Research
router.post('/deep-research', heavyLimiter, deepResearchHandler)

export default router
