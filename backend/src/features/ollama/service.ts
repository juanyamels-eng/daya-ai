// Ollama service for local model management
import { logger } from '../../services/logger'

const LOCAL_BASE = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434'

export interface OllamaModel {
  name: string
  size: number
  digest: string
  modified_at: string
  details?: {
    parent_model: string
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaModelsResponse {
  models: OllamaModel[]
}

let cachedModels: OllamaModel[] = []
let cacheExpires = 0
const CACHE_TTL = 30_000 // 30 seconds

export async function fetchOllamaModels(forceRefresh = false): Promise<OllamaModel[]> {
  const now = Date.now()
  if (!forceRefresh && cachedModels.length && now < cacheExpires) {
    return cachedModels
  }

  try {
    const res = await fetch(`${LOCAL_BASE}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Ollama /api/tags failed')
      return cachedModels
    }
    const data = await res.json() as OllamaModelsResponse
    cachedModels = data.models || []
    cacheExpires = now + CACHE_TTL
    logger.info({ count: cachedModels.length }, 'Ollama models fetched')
    return cachedModels
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e }, 'Ollama not reachable')
    return cachedModels
  }
}

export function getCachedOllamaModels(): OllamaModel[] {
  return cachedModels
}

export function formatModelName(model: OllamaModel): string {
  const details = model.details
  const family = details?.family || model.name.split(':')[0]
  const paramSize = details?.parameter_size || 'unknown'
  const quantization = details?.quantization_level || ''
  return `${family}:${paramSize}${quantization ? ` (${quantization})` : ''}`
}

export function getModelCapabilities(model: OllamaModel): {
  vision: boolean
  tools: boolean
  reasoning: boolean
  maxContext: number
} {
  const name = model.name.toLowerCase()
  // Heuristics based on model names
  const vision = /llava|vision|bakllava|moondream|minicpm|pixtral|qwen.*vl/i.test(name)
  const tools = /qwen|llama|mistral|nemotron|command|phi|hermes|coder/i.test(name)
  const reasoning = /r1|reason|thinking|qwen3.*max|qwen3.*thinking/i.test(name)
  
  // Estimate context from model name
  let maxContext = 4096
  if (/32k|128k|1m|1000k/i.test(name)) maxContext = 1_000_000
  else if (/16k/i.test(name)) maxContext = 16_384
  else if (/8k/i.test(name)) maxContext = 8192
  
  return { vision, tools, reasoning, maxContext }
}