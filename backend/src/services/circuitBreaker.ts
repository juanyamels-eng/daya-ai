// ============================================
// DAYA IA — Circuit Breaker Pattern
// Prevents cascading failures by stopping requests to failing services.
// States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing)
// ============================================
import { logger } from './logger'

export interface CircuitBreakerOptions {
  failureThreshold?: number
  recoveryTimeoutMs?: number
  halfOpenMaxAttempts?: number
}

export type CircuitState = 'closed' | 'open' | 'half_open'

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private successCount = 0
  private lastFailureTime = 0
  private halfOpenAttempts = 0
  private options: Required<CircuitBreakerOptions>

  constructor(
    private name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.options = {
      failureThreshold: 5,
      recoveryTimeoutMs: 30000,
      halfOpenMaxAttempts: 3,
      ...options,
    }
  }

  getState(): CircuitState { return this.state }
  getFailureCount(): number { return this.failureCount }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.recoveryTimeoutMs) {
        this.state = 'half_open'
        this.halfOpenAttempts = 0
        logger.info(`[circuit:${this.name}] → half_open`)
      } else {
        throw new Error(`Circuit "${this.name}" is OPEN. Retry after ${this.options.recoveryTimeoutMs}ms`)
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  private onSuccess() {
    if (this.state === 'half_open') {
      this.halfOpenAttempts++
      if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
        this.state = 'closed'
        this.failureCount = 0
        logger.info(`[circuit:${this.name}] → closed (recovered)`)
      }
    } else {
      this.failureCount = 0
    }
  }

  private onFailure() {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === 'half_open') {
      this.state = 'open'
      logger.info(`[circuit:${this.name}] → open (failed during recovery)`)
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'open'
      console.warn(`[circuit:${this.name}] → open (${this.failureCount} failures)`)
    }
  }

  reset() {
    this.state = 'closed'
    this.failureCount = 0
    this.halfOpenAttempts = 0
  }
}

// Global circuit breakers for external services
export const llmCircuit = new CircuitBreaker('llm', { failureThreshold: 3, recoveryTimeoutMs: 60000 })
export const dbCircuit = new CircuitBreaker('database', { failureThreshold: 5, recoveryTimeoutMs: 30000 })
export const mcpCircuit = new CircuitBreaker('mcp', { failureThreshold: 3, recoveryTimeoutMs: 45000 })
export const browserCircuit = new CircuitBreaker('browser', { failureThreshold: 2, recoveryTimeoutMs: 60000 })
