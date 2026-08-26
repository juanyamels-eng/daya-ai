// ============================================
// DAYA IA — Retry with Exponential Backoff
// Retries failed operations with configurable delay and jitter.
// ============================================

export interface RetryableError {
  message?: string
  status?: number
  response?: { status?: number }
}

export interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  jitterFactor: number       // 0-1, amount of randomness
  retryOn?: (err: RetryableError) => boolean  // custom retry condition
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3,
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  label = 'operation',
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const e = err as RetryableError

      // Check if we should retry
      if (attempt >= opts.maxRetries) break
      if (opts.retryOn && !opts.retryOn(e)) break

      // Don't retry client errors (4xx)
      if (e.status !== undefined && e.status >= 400 && e.status < 500) break
      if (e.response?.status !== undefined && e.response.status >= 400 && e.response.status < 500) break

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs)
      const jitter = exponentialDelay * opts.jitterFactor * (Math.random() * 2 - 1)
      const delay = Math.max(0, exponentialDelay + jitter)

      console.warn(`[retry:${label}] Attempt ${attempt + 1} failed: ${e.message}. Retrying in ${Math.round(delay)}ms...`)
      await sleep(delay)
    }
  }

  throw lastError
}

// Convenience wrappers for common external calls
export async function retryFetch(url: string, init?: RequestInit, retries = 3): Promise<Response> {
  return withRetry(
    () => fetch(url, init),
    { maxRetries: retries, baseDelayMs: 500, retryOn: (e) => !e?.message?.includes('aborted') },
    `fetch:${url.slice(0, 60)}`,
  )
}

export async function retryLlmCall<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
    retryOn: (e) => {
      const msg = e?.message?.toLowerCase() || ''
      return msg.includes('rate') || msg.includes('timeout') || msg.includes('503') || msg.includes('overloaded')
    },
  }, 'llm')
}
