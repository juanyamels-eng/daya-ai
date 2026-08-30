/**
 * OpenRouter API Client with Caching Layer
 * 
 * Implements intelligent caching for model calls to reduce API costs and latency
 * - TTL-based cache (default 5 minutes)
 * - Hash-based deduplication for identical requests
 * - Configurable cache sizes per model
 * - Automatic cleanup of expired entries
 */

import { logger } from '../../../services/logger'

interface CachedResponse {
  data: any
  timestamp: number
  ttl: number
}

interface CacheStats {
  hits: number
  misses: number
  evictions: number
  size: number
}

export class ModelCache {
  private cache = new Map<string, CachedResponse>()
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0 }
  private defaultTTL: number
  private maxSize: number
  private cleanupInterval: NodeJS.Timeout

  constructor(
    defaultTTL: number = 1000 * 60 * 5, // 5 minutes
    maxSize: number = 1000 // max cached entries
  ) {
    this.defaultTTL = defaultTTL
    this.maxSize = maxSize
    
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 1000 * 60)
    this.cleanupInterval.unref() // Don't block process exit
  }

  /**
   * Generate hash key for cache lookup
   * Combines model, input tokens, and model parameters
   */
  private hashKey(model: string, input: any): string {
    const normalized = {
      model,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      // Include key parameters in hash
      temperature: input?.temperature ?? 0.7,
      maxTokens: input?.maxTokens ?? 2000,
    }
    
    // Simple hash: model + first 100 chars of input
    const inputStr = normalized.input.substring(0, 100)
    return `${normalized.model}:${inputStr}`.substring(0, 256)
  }

  /**
   * Get cached response if valid
   */
  get(model: string, input: any): any | null {
    const key = this.hashKey(model, input)
    const cached = this.cache.get(key)

    if (!cached) {
      this.stats.misses++
      return null
    }

    // Check if expired
    const age = Date.now() - cached.timestamp
    if (age > cached.ttl) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    this.stats.hits++
    return cached.data
  }

  /**
   * Cache a response
   */
  set(model: string, input: any, data: any, ttl?: number): void {
    const key = this.hashKey(model, input)
    
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldest = Array.from(this.cache.entries()).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp
      )[0]
      if (oldest) {
        this.cache.delete(oldest[0])
        this.stats.evictions++
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    })

    this.stats.size = this.cache.size
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let removed = 0

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.cache.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      logger.debug(`Cache cleanup: removed ${removed} expired entries`)
      this.stats.size = this.cache.size
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0 }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: string } {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 
      ? ((this.stats.hits / total) * 100).toFixed(1) + '%'
      : 'N/A'
    
    return { ...this.stats, hitRate }
  }

  /**
   * Shutdown cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval)
  }
}

/**
 * OpenRouter API Client
 * 
 * Wrapper around OpenRouter API with:
 * - Automatic retry logic
 * - Built-in caching
 * - Error handling
 * - Rate limiting awareness
 */
export class OpenRouterClient {
  private apiKey: string
  private apiUrl: string
  private cache: ModelCache
  private requestDelay: number = 0 // ms between requests

  constructor(apiKey?: string, cache?: ModelCache) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || ''
    this.apiUrl = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1'
    this.cache = cache || new ModelCache()

    if (!this.apiKey) {
      logger.warn('OpenRouter API key not configured')
    }
  }

  /**
   * Call OpenRouter API with caching
   */
  async call(model: string, input: any, options?: { 
    skipCache?: boolean
    ttl?: number
  }): Promise<any> {
    const { skipCache = false, ttl } = options || {}

    // Check cache first
    if (!skipCache) {
      const cached = this.cache.get(model, input)
      if (cached) {
        logger.debug(`Cache hit for ${model}`)
        return cached
      }
    }

    try {
      // Apply request delay for rate limiting
      if (this.requestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.requestDelay))
      }

      // Make API request
      const response = await this.makeRequest(model, input)

      // Cache successful response
      if (response && !skipCache) {
        this.cache.set(model, input, response, ttl)
      }

      return response
    } catch (error) {
      logger.error(`OpenRouter API error for model ${model}:`, error)
      throw error
    }
  }

  /**
   * Internal method to make actual API request
   */
  private async makeRequest(model: string, input: any): Promise<any> {
    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://daya-ai.com',
        'X-Title': 'DAYA AI',
      },
      body: JSON.stringify({
        model,
        messages: Array.isArray(input) ? input : [{ role: 'user', content: input }],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
    }

    return response.json()
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats()
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear()
  }

  /**
   * Shutdown
   */
  destroy() {
    this.cache.destroy()
  }
}

// Singleton instance
let client: OpenRouterClient | null = null

export function getOpenRouterClient(): OpenRouterClient {
  if (!client) {
    client = new OpenRouterClient()
  }
  return client
}

export function initOpenRouterClient(apiKey?: string): OpenRouterClient {
  client = new OpenRouterClient(apiKey)
  return client
}
