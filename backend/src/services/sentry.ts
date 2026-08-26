// ============================================
// DAYA IA — Sentry Error Tracking (Backend)
// Only activates if SENTRY_DSN is set. Zero overhead otherwise.
// ============================================
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

const DSN = process.env.SENTRY_DSN
const ALERT_WEBHOOK = process.env.SENTRY_ALERT_WEBHOOK // Slack/Discord/PagerDuty webhook

export function initSentry() {
  if (!DSN) {
    console.warn('[Sentry] No SENTRY_DSN set — error tracking disabled')
    return
  }

  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
    beforeSend(event) {
      // Never leak JWT secrets or API keys
      if (event.request?.headers) {
        delete event.request.headers.authorization
        delete event.request.headers.cookie
      }
      // Add custom tags for alerting
      event.tags = {
        ...event.tags,
        service: 'daya-ia-backend',
        version: process.env.npm_package_version || 'unknown',
      }
      return event
    },
  })

  // Global unhandled rejection / exception handlers
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    captureError(error, { type: 'unhandledRejection' })
    // Don't exit in production — let the process guard handle it
    if (process.env.NODE_ENV !== 'production') console.error('UNHANDLED REJECTION:', reason)
  })

  process.on('uncaughtException', (error) => {
    captureError(error, { type: 'uncaughtException', fatal: true })
    if (process.env.NODE_ENV !== 'production') console.error('UNCAUGHT EXCEPTION:', error)
  })
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  if (!DSN) return
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context)
    // Add severity for alerting
    scope.setLevel(context?.fatal ? 'fatal' : 'error')
    Sentry.captureException(error)
  })
  
  // Send real-time alert for critical errors
  if (context?.alert && ALERT_WEBHOOK) {
    sendAlert('error', error.message, context)
  }
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, unknown>) {
  if (!DSN) return
  Sentry.captureMessage(message, level)
  if (context?.alert && ALERT_WEBHOOK) {
    sendAlert(level, message, context)
  }
}

async function sendAlert(level: string, message: string, context?: Record<string, unknown>) {
  try {
    await fetch(ALERT_WEBHOOK!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[DAYA ${level.toUpperCase()}] ${message}`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `*DAYA IA Alert* — ${level.toUpperCase()}` } },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: `*Message:*\n${message}` },
            { type: 'mrkdwn', text: `*Environment:*\n${process.env.NODE_ENV}` },
            { type: 'mrkdwn', text: `*Service:*\ndaya-ia-backend` },
            { type: 'mrkdwn', text: `*Time:*\n${new Date().toISOString()}` },
          ]},
          context ? { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`${JSON.stringify(context, null, 2)}\`\`\`` } } : {},
        ].filter(Boolean),
      }),
    })
  } catch {
    // Alert failure should never break the app
  }
}

// Helper for common alert patterns
export const alerts = {
  critical: (message: string, context?: Record<string, unknown>) => 
    captureMessage(message, 'fatal', { ...context, alert: true }),
  error: (message: string, context?: Record<string, unknown>) => 
    captureMessage(message, 'error', { ...context, alert: true }),
  warning: (message: string, context?: Record<string, unknown>) => 
    captureMessage(message, 'warning', { ...context, alert: true }),
  // Specific alert helpers
  dbDown: (error: Error) => alerts.critical('Database connection failed', { error: error.message, category: 'database' }),
  paymentFailed: (userId: string, error: string) => alerts.error('Payment processing failed', { userId, error, category: 'payments' }),
  authFailure: (ip: string, reason: string) => alerts.warning('Authentication anomaly detected', { ip, reason, category: 'security' }),
  rateLimitExceeded: (userId: string, endpoint: string) => alerts.warning('Rate limit exceeded', { userId, endpoint, category: 'rate-limit' }),
  llmProviderDown: (provider: string, error: string) => alerts.error('LLM provider unavailable', { provider, error, category: 'llm' }),
  queueBacklog: (queue: string, size: number) => alerts.warning('Queue backlog growing', { queue, size, category: 'performance' }),
}
