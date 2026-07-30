import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { rateLimiter } from './middleware/rateLimiter'
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import chatRoutes from './routes/chat'
import userRoutes from './routes/user'
import paymentsRoutes from './routes/payments'
import adminRoutes from './routes/admin'
import documentRoutes from './routes/documents'
import readurlRoutes from './features/readurl/route'
import agentRoutes from './features/agent/route'
import codeagentRoutes from './features/codeagent/route'
import openaiApiRoutes from './features/openaiapi/route'
import compareRoutes from './features/compare/route'
import notesRoutes from './features/notes/route'
import notebooksRoutes from './features/notebooks/route'
import calendarRoutes from './features/calendar/route'
import emailRoutes from './features/email/route'
import apiTokenRoutes from './features/apitokens/route'
import promptRoutes from './features/prompts/route'
import editorRoutes from './features/editor/route'
import searchrankRoutes from './features/searchrank/route'
import hybridsearchRoutes from './features/hybridsearch/route'
import research2Routes from './features/research2/route'
import oracleRoutes from './features/oracle/route'
import lifecontextRoutes from './features/lifecontext/route'
import workerRoutes from './features/worker/route'
import aieditorRoutes from './features/aieditor/route'
import studioRoutes from './features/studio/route'
import memoryskillsRoutes from './features/memoryskills/route'
import whatsappRoutes from './features/whatsapp/route'
import githubRoutes from './features/github/route'
import codemapRoutes from './features/codemap/route'
import flowRoutes from './features/flow/route'
import actionsRoutes from './features/actions/route'
import audiointelRoutes from './features/audiointel/route'
import careerRoutes from './features/career/route'
import blocksRoutes from './features/blocks/route'
import projectsRoutes from './features/projects/route'
import automationsRoutes from './features/automations/route'
import smartmemoryRoutes from './features/smartmemory/route'
import insightsRoutes from './features/insights/route'
import factcheckRoutes from './features/factcheck/route'
import canvasRoutes from './features/canvas/route'
import genimagesRoutes from './features/genimages/route'
import designsRoutes from './features/designs/route'
import publicDesignRoutes from './features/designs/public'
import brandkitRoutes from './features/brandkit/route'
import stockRoutes from './features/stock/route'
import { startScheduler } from './services/scheduler'
import { validateEnv } from './config/validateEnv'

dotenv.config()

// Catches unhandled errors to avoid silent crashes in production
import { setupProcessGuards } from './services/monitoring'
setupProcessGuards()

// Verifies that critical environment variables exist before booting
validateEnv()

const app = express()
const PORT = process.env.PORT || 4000

// Railway/Vercel puts a proxy in front of the server. Without this, Express sees
// the proxy's IP instead of the user's, and the rate-limiter would treat ALL
// users as one (unfair mass blocks in production).
app.set('trust proxy', 1)

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

// CORS — supports multiple origins (local + production)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

const isProd = process.env.NODE_ENV === 'production'

// Vercel Previews: by default it keeps the original behavior
// (any *.vercel.app). If you set VERCEL_PROJECT (your project name),
// only domains from THAT project are accepted in production, closing the open
// wildcard without affecting your preview flow. Nothing changes if you don't set it.
const VERCEL_PROJECT = (process.env.VERCEL_PROJECT || '').trim()
function isAllowedVercelPreview(origin: string): boolean {
  if (VERCEL_PROJECT) {
    // Accepts https://<project>.vercel.app and https://<project>-<hash>-<scope>.vercel.app
    const safe = VERCEL_PROJECT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^https://${safe}(-[a-z0-9-]+)?\\.vercel\\.app$`, 'i').test(origin)
  }
  // Without VERCEL_PROJECT → original behavior (any *.vercel.app)
  return /\.vercel\.app$/.test(origin)
}

app.use(cors({
  origin: (origin, callback) => {
    // Allows requests without origin (mobile apps, curl, health checks)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin) || isAllowedVercelPreview(origin)) return callback(null, true)
    // In development any origin is allowed; in production only the allowlist.
    if (!isProd) return callback(null, true)
    callback(new Error('Origen no permitido por CORS'))
  },
  credentials: true,
}))
// Payment webhook needs the raw body to verify the HMAC signature.
// It is mounted BEFORE express.json so it doesn't parse it.
import { paymentsWebhook } from './routes/payments'
app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), paymentsWebhook)
// The WhatsApp webhook also needs the raw body to verify the signature.
import { whatsappWebhook } from './features/whatsapp/route'
app.post('/api/whatsapp/webhook', express.raw({ type: '*/*', limit: '1mb' }), whatsappWebhook)

app.use(express.json({ limit: '25mb' }))
app.use(rateLimiter)

// Public routes
app.use('/api/auth', authRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/user', userRoutes)
app.use('/api/payments', paymentsRoutes)

// Secret admin route (without obvious prefix)
app.use('/api/system', adminRoutes)
app.use('/api/documents', documentRoutes)
// Reading URLs from chat (without agent)
app.use('/api/read-url', readurlRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/codeagent', codeagentRoutes)
// OpenAI-compatible API: lets you use DAYA from OpenCode, Cline, Continue,
// Zed, Aider… The /v1 prefix is what all these clients expect.
app.use('/v1', openaiApiRoutes)
// Compare models blindly (feature module)
app.use('/api/compare', compareRoutes)
// Notes and tasks (feature module)
app.use('/api/notes', notesRoutes)
app.use('/api/notebooks', notebooksRoutes)
// Local calendar (feature module)
app.use('/api/calendar', calendarRoutes)
// IMAP inbox email (feature module)
app.use('/api/email', emailRoutes)
// API tokens (feature module)
app.use('/api/tokens', apiTokenRoutes)
// AI Editor (feature module)
app.use('/api/editor', editorRoutes)
// Prompt templates (feature module)
app.use('/api/prompts', promptRoutes)
// Extended tools (feature modules)
app.use('/api/searchrank', searchrankRoutes)
app.use('/api/hybridsearch', hybridsearchRoutes)
app.use('/api/research2', research2Routes)
app.use('/api/oracle', oracleRoutes)
app.use('/api/lifecontext', lifecontextRoutes)
app.use('/api/worker', workerRoutes)
app.use('/api/aieditor', aieditorRoutes)
app.use('/api/studio', studioRoutes)
app.use('/api/memoryskills', memoryskillsRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/github', githubRoutes)
app.use('/api/codemap', codemapRoutes)
app.use('/api/flow', flowRoutes)
app.use('/api/actions', actionsRoutes)
app.use('/api/audiointel', audiointelRoutes)
app.use('/api/career', careerRoutes)
app.use('/api/blocks', blocksRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/automations', automationsRoutes)
app.use('/api/smartmemory', smartmemoryRoutes)
app.use('/api/insights', insightsRoutes)
app.use('/api/factcheck', factcheckRoutes)
app.use('/api/canvas', canvasRoutes)
app.use('/api/images', genimagesRoutes)
app.use('/api/designs', designsRoutes)
app.use('/api/public', publicDesignRoutes)
app.use('/api/brandkit', brandkitRoutes)
app.use('/api/stock', stockRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'DAYA AI', version: '1.0.0' })
})

// Direct database test. Opening this URL in the browser tells you whether
// the Supabase connection works or not — no guessing.
app.get('/health/db', async (_req, res) => {
  try {
    const { prisma } = await import('./lib/prisma')
    await prisma.$queryRaw`SELECT 1`
    const users = await prisma.user.count()
    res.json({ database: 'OK', conectada: true, usuarios_registrados: users })
  } catch (e: any) {
    res.status(500).json({ database: 'FALLA', conectada: false, error: e?.message || 'error desconocido' })
  }
})

app.use(errorHandler)

const server = app.listen(PORT, () => {
  console.log(`🌟 DAYA IA Backend corriendo en puerto ${PORT}`)
  // Start secret scheduler
  startScheduler()
  console.log('🤫 Sistema de auto-mejora activado silenciosamente')
})

// Clean shutdown (Railway deploys): stops accepting NEW connections,
// finishes in-flight responses, shuts down Puppeteer and disconnects the database.
// If something hangs, force exit after 10s.
async function shutdown() {
  server.close(async () => {
    try {
      const { closePdfBrowser } = await import('./services/documents/pdfRenderer')
      await closePdfBrowser()
    } catch {}
    try {
      const { prisma } = await import('./lib/prisma')
      await prisma.$disconnect()
    } catch {}
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export default app
