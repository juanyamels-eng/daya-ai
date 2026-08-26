// ============================================
// DAYA IA — Memory Hub Routes
// Central routes for all memory/intelligence features:
//   GET  /api/memory/profile — user profile + facts
//   GET  /api/memory/suggestions — proactive suggestions
//   POST /api/memory/feedback — record user feedback
//   GET  /api/memory/insights — cross-feature insights
//   GET  /api/memory/calendar — calendar intelligence
//   GET  /api/memory/email — email intelligence
//   POST /api/memory/scheduled — create scheduled action
//   GET  /api/memory/scheduled — list scheduled actions
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { heavyLimiter } from '../../middleware/rateLimiter'
import { getUserFacts, generateProfileSummary, getUserContext, addFact } from './userGraph'
import { generateProactiveSuggestions, dismissSuggestion } from './proactive'
import { getAdaptedPersonality } from './personality'
import { recordFeedback, analyzeLearningPatterns, getLearningContext } from './learning'
import { getCrossFeatureContext, generateCrossInsights } from './crossIntelligence'
import { getCalendarInsights } from './calendarIntelligence'
import { getInboxSummary } from './emailIntelligence'
import { createScheduledAction, listScheduledActions, removeScheduledAction } from './scheduledActions'
import { summarizeConversation, getRelevantMemories } from './conversationMemory'

const router = Router()
router.use(requireAuth)

// ── Profile ──

router.get('/profile', async (req: Request, res: Response) => {
  const userId = req.userId
  const facts = await getUserFacts(userId)
  const summary = await generateProfileSummary(userId)
  res.json({ facts, summary, factCount: facts.length })
})

router.post('/profile', async (req: Request, res: Response) => {
  const userId = req.userId
  const { key, value, category, source } = req.body || {}
  if (!key || !value) return res.status(400).json({ error: 'key and value required' })
  await addFact(userId, { category: category || 'context', key, value, confidence: 0.9, source: source || 'explicit' })
  res.json({ success: true })
})

router.get('/context', async (req: Request, res: Response) => {
  const userId = req.userId
  const userCtx = await getUserContext(userId)
  const learnCtx = await getLearningContext(userId)
  const crossCtx = await getCrossFeatureContext(userId, (req.query.query as string) || '')
  res.json({ userContext: userCtx, learningContext: learnCtx, crossFeatureContext: crossCtx })
})

// ── Suggestions ──

router.get('/suggestions', async (req: Request, res: Response) => {
  const userId = req.userId
  const suggestions = await generateProactiveSuggestions(userId)
  res.json({ suggestions })
})

router.post('/suggestions/dismiss', async (req: Request, res: Response) => {
  const userId = req.userId
  const { suggestionId } = req.body || {}
  if (suggestionId) await dismissSuggestion(userId, suggestionId)
  res.json({ success: true })
})

// ── Personality ──

router.post('/personality', async (req: Request, res: Response) => {
  const userId = req.userId
  const { message } = req.body || {}
  const personality = await getAdaptedPersonality(userId, message || '')
  res.json(personality)
})

// ── Feedback / Learning ──

router.post('/feedback', async (req: Request, res: Response) => {
  const userId = req.userId
  const { type, conversationId, messageId, content } = req.body || {}
  await recordFeedback(userId, { type, conversationId, messageId, content, timestamp: Date.now() })
  res.json({ success: true })
})

router.get('/learning', async (req: Request, res: Response) => {
  const userId = req.userId
  const patterns = await analyzeLearningPatterns(userId)
  res.json({ patterns })
})

// ── Calendar Intelligence ──

router.get('/calendar', async (req: Request, res: Response) => {
  const userId = req.userId
  const insights = await getCalendarInsights(userId)
  res.json({ insights })
})

// ── Email Intelligence ──

router.get('/email', async (req: Request, res: Response) => {
  const userId = req.userId
  const summary = await getInboxSummary(userId)
  res.json({ summary })
})

// ── Cross-Feature Insights ──

router.get('/cross', async (req: Request, res: Response) => {
  const userId = req.userId
  const insights = await generateCrossInsights(userId)
  res.json({ insights })
})

// ── Scheduled Actions ──

router.get('/scheduled', async (req: Request, res: Response) => {
  const userId = req.userId
  const actions = await listScheduledActions(userId)
  res.json({ actions })
})

router.post('/scheduled', heavyLimiter, async (req: Request, res: Response) => {
  const userId = req.userId
  const { name, description, cronExpression, action } = req.body || {}
  if (!name || !cronExpression || !action) {
    return res.status(400).json({ error: 'name, cronExpression, and action required' })
  }
  const scheduled = await createScheduledAction(userId, { name, description: description || '', cronExpression, action, enabled: true })
  res.json({ scheduled })
})

router.delete('/scheduled/:id', async (req: Request, res: Response) => {
  const userId = req.userId
  await removeScheduledAction(userId, req.params.id)
  res.json({ success: true })
})

// ── Conversation Memory ──

router.post('/summarize', heavyLimiter, async (req: Request, res: Response) => {
  const userId = req.userId
  const { conversationId, messages } = req.body || {}
  if (!conversationId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'conversationId and messages[] required' })
  }
  const memory = await summarizeConversation(userId, conversationId, messages)
  res.json({ memory })
})

router.get('/memories', async (req: Request, res: Response) => {
  const userId = req.userId
  const query = (req.query.q as string) || ''
  const memories = query ? await getRelevantMemories(userId, query) : []
  res.json({ memories })
})

export default router
