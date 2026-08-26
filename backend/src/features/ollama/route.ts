import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import { logger } from '../../services/logger'
import { fetchOllamaModels, formatModelName, getModelCapabilities } from './service'

const router = Router()

router.get('/models', requireAuth, async (_req, res) => {
  try {
    const models = await fetchOllamaModels()
    const formatted = models.map(m => ({
      id: m.name,
      name: formatModelName(m),
      size: m.size,
      modified_at: m.modified_at,
      capabilities: getModelCapabilities(m),
      details: m.details,
    }))
    res.json({ models: formatted, source: 'ollama', baseUrl: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434' })
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : e }, 'Ollama models endpoint error')
    res.status(503).json({ error: 'No se pudo conectar a Ollama', models: [] })
  }
})

router.post('/models/refresh', requireAuth, async (_req, res) => {
  try {
    const models = await fetchOllamaModels(true)
    const formatted = models.map(m => ({
      id: m.name,
      name: formatModelName(m),
      size: m.size,
      modified_at: m.modified_at,
      capabilities: getModelCapabilities(m),
    }))
    res.json({ models: formatted, refreshed: true })
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : e }, 'Ollama refresh error')
    res.status(503).json({ error: 'No se pudo conectar a Ollama', models: [] })
  }
})

// Pull a model
router.post('/models/pull', requireAuth, async (req, res) => {
  const { name } = req.body as { name?: string }
  if (!name) return res.status(400).json({ error: 'Model name required' })

  const LOCAL_BASE = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434'

  try {
    // Use streaming to report progress
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const pullRes = await fetch(`${LOCAL_BASE}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true }),
    })

    if (!pullRes.ok) {
      const err = await pullRes.text()
      res.write(`data: ${JSON.stringify({ error: `Pull failed: ${err}` })}\n\n`)
      res.end()
      return
    }

    const reader = pullRes.body?.getReader()
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'No stream' })}\n\n`)
      res.end()
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIdx
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim()
          buffer = buffer.slice(newlineIdx + 1)
          if (!line) continue
          try {
            const parsed = JSON.parse(line)
            // Forward progress to client
            const progress = parsed.status
            const completed = parsed.completed
            const total = parsed.total
            res.write(`data: ${JSON.stringify({ status: progress, completed, total, name })}\n\n`)
          } catch {
            // Ignore partial JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    res.write(`data: ${JSON.stringify({ done: true, name })}\n\n`)
    res.end()

    // Invalidate cache
    await fetchOllamaModels(true)
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : e, name }, 'Ollama pull error')
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : 'Pull failed' })}\n\n`)
      res.end()
    }
  }
})

// Delete a model
router.delete('/models/:name', requireAuth, async (req, res) => {
  const { name } = req.params
  const LOCAL_BASE = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434'

  try {
    const response = await fetch(`${LOCAL_BASE}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(500).json({ error: `Delete failed: ${err}` })
    }

    await fetchOllamaModels(true)
    res.json({ success: true, deleted: name })
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : e, name }, 'Ollama delete error')
    res.status(503).json({ error: 'No se pudo conectar a Ollama' })
  }
})

// Get recommended models for download
router.get('/recommended', requireAuth, async (_req, res) => {
  const recommended = [
    { name: 'qwen2.5-coder:7b', description: 'Best for coding, 7B params', size: '4.7GB' },
    { name: 'qwen2.5:7b', description: 'General purpose, 7B params', size: '4.7GB' },
    { name: 'qwen2.5:14b', description: 'General purpose, 14B params', size: '9GB' },
    { name: 'llama3.2:3b', description: 'Fast & small, 3B params', size: '2.0GB' },
    { name: 'llama3.2:8b', description: 'Meta Llama 3.2, 8B params', size: '4.7GB' },
    { name: 'mistral:7b', description: 'Mistral 7B, good reasoning', size: '4.1GB' },
    { name: 'phi3:3.8b', description: 'Microsoft Phi-3, small & capable', size: '2.3GB' },
    { name: 'gemma2:9b', description: 'Google Gemma 2, 9B params', size: '5.4GB' },
    { name: 'deepseek-coder:6.7b', description: 'DeepSeek coder specialized', size: '3.8GB' },
    { name: 'qwen2.5:32b', description: 'Large 32B model (needs 20GB+ RAM)', size: '19GB' },
  ]

  const installed = (await fetchOllamaModels()).map(m => m.name)
  res.json({
    recommended: recommended.map(r => ({ ...r, installed: installed.includes(r.name) })),
  })
})

export default router