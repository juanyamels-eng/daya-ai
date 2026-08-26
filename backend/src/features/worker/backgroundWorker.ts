// ============================================
// DAYA IA — Background Worker (proactive execution)
// --------------------------------------------------------------------------
// NEW capability: DAYA stops being purely reactive. This service runs tasks
// in the background periodically, WITHOUT the user having to ask for anything,
// and leaves "notifications" for the user to see when they return.
//
// Included job types:
//   • inbox-scan   → checks new emails and summarizes important ones
//   • task-due     → notifies about tasks whose due date is approaching/passed
//   • watcher      → watches a URL or value and notifies if it changes / crosses a threshold
//
// Design:
//   • Each user has a job list (interval, last run, config).
//   • The worker tick (every minute) checks which jobs are due and runs them
//     safely and in isolation (one failing job does not bring down others).
//   • Notifications accumulate per user and are queried/deleted via API.
//
// Persistence WITHOUT migrations: jobs and notifs are stored in DayaSystemConfig
// (existing model) as JSON. At the end of the file there's a commented-out
// dedicated Prisma model if you prefer formal tables in the future.
//
// Integration (1 line, optional): in services/scheduler.ts, inside the
// setInterval running every minute, call `await runWorkerTick()`.
// ============================================

import { prisma } from '../../lib/prisma'
import { loadConfig, saveConfig } from '../../services/configStore'

const db = prisma

// ── Types ─────────────────────────────────────────────────────────────────

export type JobKind = 'inbox-scan' | 'task-due' | 'watcher'

export interface Job {
  id: string
  kind: JobKind
  enabled: boolean
  intervalMin: number          // how often it runs (minutes)
  lastRun: number              // epoch ms (0 = nunca)
  config: Record<string, any>  // type-specific (e.g. url, threshold)
  label?: string
}

export interface Notification {
  id: string
  kind: JobKind | 'system'
  title: string
  body: string
  createdAt: number
  read: boolean
  link?: string                // ruta interna o URL relacionada
}

const JOBS_KEY = (u: string) => `jobs:${u}`
const NOTIFS_KEY = (u: string) => `notifs:${u}`
const MAX_NOTIFS = 50


function genId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── Notifications ───────────────────────────────────────────────────────────

async function pushNotification(userId: string, n: Omit<Notification, 'id' | 'createdAt' | 'read'>): Promise<void> {
  const list = await loadConfig<Notification>(NOTIFS_KEY(userId))
  list.unshift({ id: genId('ntf'), createdAt: Date.now(), read: false, ...n })
  await saveConfig(NOTIFS_KEY(userId), list.slice(0, MAX_NOTIFS))
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  return loadConfig<Notification>(NOTIFS_KEY(userId))
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  const list = await loadConfig<Notification>(NOTIFS_KEY(userId))
  const n = list.find(x => x.id === id)
  if (n) { n.read = true; await saveConfig(NOTIFS_KEY(userId), list) }
}

export async function clearNotifications(userId: string): Promise<void> {
  await saveConfig(NOTIFS_KEY(userId), [])
}

// ── Job CRUD ──────────────────────────────────────────────────────────────

export async function getJobs(userId: string): Promise<Job[]> {
  return loadConfig<Job>(JOBS_KEY(userId))
}

export async function addJob(
  userId: string,
  kind: JobKind,
  intervalMin: number,
  config: Record<string, any> = {},
  label?: string
): Promise<Job> {
  const jobs = await getJobs(userId)
  const job: Job = {
    id: genId('job'),
    kind,
    enabled: true,
    intervalMin: Math.max(5, Math.min(intervalMin || 60, 1440)), // 5 min .. 24 h
    lastRun: 0,
    config,
    label,
  }
  jobs.push(job)
  await saveConfig(JOBS_KEY(userId), jobs)
  return job
}

export async function toggleJob(userId: string, id: string, enabled: boolean): Promise<void> {
  const jobs = await getJobs(userId)
  const j = jobs.find(x => x.id === id)
  if (j) { j.enabled = enabled; await saveConfig(JOBS_KEY(userId), jobs) }
}

export async function deleteJob(userId: string, id: string): Promise<void> {
  const jobs = (await getJobs(userId)).filter(x => x.id !== id)
  await saveConfig(JOBS_KEY(userId), jobs)
}

// ── Executors for each job type ─────────────────────────────────────────────
// Each one is independent and catches its own errors. Returns true if
// any notification was generated (only for metrics/log).

// 1) Inbox scan: uses the email feature if configured.
async function runInboxScan(userId: string, _job: Job): Promise<boolean> {
  try {
    const acc = await db.emailAccount.findUnique({ where: { userId } })
    if (!acc) return false // no IMAP account configured → nothing to do

    // Reuses imapflow same as features/email. We only COUNT unread and grab
    // recent subjects; the detailed AI summary is done on demand in the UI
    // to avoid spending tokens in the background without permission.
    const { ImapFlow } = await import('imapflow')
    const { decryptSecret } = await import('../email/crypto')
    const client = new ImapFlow({
      host: acc.imapHost, port: acc.imapPort, secure: acc.imapSecure,
      auth: { user: acc.username, pass: decryptSecret(acc.passwordEnc) },
      logger: false,
    })
    await client.connect()
    let unseen = 0
    const subjects: string[] = []
    try {
      const lock = await client.getMailboxLock('INBOX')
      try {
        const status = await client.status('INBOX', { unseen: true })
        unseen = status.unseen || 0
        if (unseen > 0) {
          // Fetches subjects of up to 5 recent unread emails.
          for await (const msg of client.fetch({ seen: false }, { envelope: true }, { uid: true })) {
            if (msg.envelope?.subject) subjects.push(msg.envelope.subject)
            if (subjects.length >= 5) break
          }
        }
      } finally { lock.release() }
    } finally { await client.logout().catch(() => {}) }

    if (unseen > 0) {
      const preview = subjects.slice(0, 3).map(s => `• ${s}`).join('\n')
      await pushNotification(userId, {
        kind: 'inbox-scan',
        title: `Tienes ${unseen} correo${unseen === 1 ? '' : 's'} sin leer`,
        body: preview || 'Revisa tu bandeja de entrada.',
        link: '/email',
      })
      return true
    }
    return false
  } catch {
    return false // IMAP down / credentials → silent, retry later
  }
}

// 2) Tasks due soon: checks Task with dueDate near or past.
async function runTaskDue(userId: string, _job: Job): Promise<boolean> {
  try {
    const now = Date.now()
    const soon = now + 24 * 60 * 60 * 1000 // next 24 h
    const tasks = await db.task.findMany({
      where: { userId, done: false, dueDate: { not: null } },
      orderBy: { dueDate: 'asc' },
      take: 20,
    })
    const due = tasks.filter((t: any) => {
      const d = new Date(t.dueDate).getTime()
      return d <= soon
    })
    if (!due.length) return false

    const overdue = due.filter((t: any) => new Date(t.dueDate).getTime() < now)
    const title = overdue.length
      ? `${overdue.length} tarea${overdue.length === 1 ? '' : 's'} vencida${overdue.length === 1 ? '' : 's'}`
      : `${due.length} tarea${due.length === 1 ? '' : 's'} para hoy`
    const body = due.slice(0, 4).map((t: any) => `• ${t.title}`).join('\n')

    await pushNotification(userId, { kind: 'task-due', title, body, link: '/notes' })
    return true
  } catch {
    return false
  }
}

// 3) Watcher: watches a URL and notifies if its content (or a number inside) changes
//    compared to last time. config: { url, mode: 'content'|'number', selectorHint?, threshold? }
async function runWatcher(userId: string, job: Job): Promise<boolean> {
  try {
    const url: string = job.config?.url
    if (!url || !/^https?:\/\//i.test(url)) return false

    const res = await fetch(url, {
      headers: { 'User-Agent': 'DAYA-Watcher/1.0 (+https://daya.ia)' },
    })
    if (!res.ok) return false
    const text = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    if (job.config.mode === 'number') {
      // Extracts the first number from the content and compares with the threshold.
      const m = text.match(/-?\d[\d.,]*/)
      if (!m) return false
      const value = parseFloat(m[0].replace(/\./g, '').replace(',', '.'))
      const prev = job.config._lastValue
      const threshold = job.config.threshold
      let fire = false
      let reason = ''
      if (typeof threshold === 'number') {
        if (job.config.direction === 'below' && value < threshold) { fire = true; reason = `dropped below ${threshold}` }
        if (job.config.direction === 'above' && value > threshold) { fire = true; reason = `exceeded ${threshold}` }
      } else if (typeof prev === 'number' && prev !== value) {
        fire = true; reason = `changed from ${prev} to ${value}`
      }
      // Remembers the last value in the job config.
      await updateJobConfig(userId, job.id, { _lastValue: value })
      if (fire) {
        await pushNotification(userId, {
          kind: 'watcher',
          title: job.label || 'Change detected',
          body: `The watched value ${reason} (now: ${value}).`,
          link: url,
        })
        return true
      }
      return false
    }

    // mode 'content': simple hash of the content; notifies if it changed.
    const hash = simpleHash(text.slice(0, 20000))
    const prevHash = job.config._lastHash
    await updateJobConfig(userId, job.id, { _lastHash: hash })
    if (prevHash && prevHash !== hash) {
      await pushNotification(userId, {
        kind: 'watcher',
        title: job.label || 'Page changed',
        body: `Changes detected on ${url}.`,
        link: url,
      })
      return true
    }
    return false
  } catch {
    return false
  }
}

// Deterministic and cheap hash (not cryptographic) to detect changes.
function simpleHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return String(h >>> 0)
}

// Updates only the config of a job (to save internal watcher state).
async function updateJobConfig(userId: string, jobId: string, patch: Record<string, any>): Promise<void> {
  const jobs = await getJobs(userId)
  const j = jobs.find(x => x.id === jobId)
  if (!j) return
  j.config = { ...j.config, ...patch }
  await saveConfig(JOBS_KEY(userId), jobs)
}

// ── Main Tick ───────────────────────────────────────────────────────────────

const RUNNERS: Record<JobKind, (userId: string, job: Job) => Promise<boolean>> = {
  'inbox-scan': runInboxScan,
  'task-due': runTaskDue,
  'watcher': runWatcher,
}

// List of users who have jobs configured. To avoid scanning the whole DB,
// we keep an index of "active worker users" in DayaSystemConfig.
const ACTIVE_USERS_KEY = 'worker:active_users'

export async function registerActiveUser(userId: string): Promise<void> {
  const set = await loadConfig<string>(ACTIVE_USERS_KEY)
  if (!set.includes(userId)) { set.push(userId); await saveConfig(ACTIVE_USERS_KEY, set) }
}

/**
 * Runs a worker pass: checks all active users and runs jobs whose
 * interval has expired. Intended to be called once/minute from the
 * scheduler. It is safe: isolates errors per user and per job.
 */
export async function runWorkerTick(): Promise<{ ran: number; fired: number }> {
  const users = await loadConfig<string>(ACTIVE_USERS_KEY)
  let ran = 0, fired = 0
  const now = Date.now()

  for (const userId of users) {
    let jobs: Job[]
    try { jobs = await getJobs(userId) } catch { continue }
    let mutated = false

    for (const job of jobs) {
      if (!job.enabled) continue
      const dueAt = job.lastRun + job.intervalMin * 60 * 1000
      if (now < dueAt) continue

      const runner = RUNNERS[job.kind]
      if (!runner) continue
      try {
        const didFire = await runner(userId, job)
        if (didFire) fired++
        ran++
      } catch { /* isolated job: never brings down the tick */ }
      job.lastRun = Date.now()
      mutated = true
    }

    if (mutated) await saveConfig(JOBS_KEY(userId), jobs).catch(() => {})
  }

  return { ran, fired }
}

// ──────────────────────────────────────────────────────────────────────────
// (OPTIONAL, future) Dedicated Prisma model, if you prefer tables instead of JSON:
//
// model WorkerJob {
//   id          String   @id @default(uuid())
//   userId      String
//   kind        String   // inbox-scan | task-due | watcher
//   enabled     Boolean  @default(true)
//   intervalMin Int      @default(60)
//   lastRun     DateTime?
//   config      Json     @default("{}")
//   label       String   @default("")
//   createdAt   DateTime @default(now())
//   @@index([userId])
// }
//
// model UserNotification {
//   id        String   @id @default(uuid())
//   userId    String
//   kind      String
//   title     String
//   body      String
//   link      String   @default("")
//   read      Boolean  @default(false)
//   createdAt DateTime @default(now())
//   @@index([userId])
// }
// ──────────────────────────────────────────────────────────────────────────
