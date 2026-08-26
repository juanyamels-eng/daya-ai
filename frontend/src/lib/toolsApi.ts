// ============================================
// Daya IA — Cliente API para las herramientas nuevas
// --------------------------------------------------------------------------
// Se importa junto a `lib/api.ts` (no lo modifica). Reusa el mismo `api` de
// axios (token automático) y el mismo patrón de streaming SSE del chat.
//
// Uso:
//   import { searchRankAPI, research2API, memorySkillsAPI, aiEditorAPI,
//            streamResearch, streamEditor } from '@/lib/toolsApi'
// ============================================
import { api } from './api'
import { useAuthStore } from '../store'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// ── REST simples ────────────────────────────────────────────────────────────

export const searchRankAPI = {
  search: (query: string, maxResults = 6, withBreakdown = false) =>
    api.post('/searchrank', { query, maxResults, withBreakdown }),
}

export const research2API = {
  list: () => api.get('/research2'),
  get: (id: string) => api.get(`/research2/${id}`),
  cancel: (id: string) => api.post(`/research2/${id}/cancel`),
  run: (topic: string, rounds = 3) => api.post('/research2/run', { topic, rounds }),
}

export const memorySkillsAPI = {
  audit: () => api.post('/memoryskills/audit'),
  listSkills: () => api.get('/memoryskills/skills'),
  deleteSkill: (id: string) => api.delete(`/memoryskills/skills/${id}`),
  setSkillEnabled: (id: string, enabled: boolean) => api.patch(`/memoryskills/skills/${id}`, { enabled }),
}

export const aiEditorAPI = {
  commands: () => api.get('/aieditor/commands'),
}

export const whatsappAPI = {
  status: () => api.get('/whatsapp/link'),
  connect: () => api.post('/whatsapp/link'),
  disconnect: () => api.delete('/whatsapp/link'),
}

// ── Catálogo público de la comunidad ─────────────────────────────────────────
export interface ToolCatalogEntry {
  name: string
  description: string
  safeForAct: boolean
  quotaKey?: string
  meta: {
    author: 'daya' | 'daya-auto' | 'comunidad'
    tag?: string
    emoji?: string
    pro?: boolean
  }
}

export const toolsCatalogAPI = {
  get: () => api.get<{ total: number; byAuthor: Record<string, number>; tools: ToolCatalogEntry[] }>('/tools/catalog'),
}

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface ResearchProgress {
  phase: 'queued' | 'planning' | 'searching' | 'reading' | 'writing' | 'done' | 'error' | 'cancelled'
  message: string
  round?: number
  totalRounds?: number
  sourcesFound?: number
}

export interface ResearchReport {
  title: string
  markdown: string
  sources: { title: string; url: string; score?: number }[]
}

// ── Streaming SSE genérico (mismo patrón que sendMessageStream del chat) ──────

interface SSEEvent {
  id?: string
  progress?: ResearchProgress
  done?: boolean
  report?: ResearchReport
  cancelled?: boolean
  delta?: string
  full?: string
  error?: string
}

async function streamSSE(
  path: string,
  body: Record<string, unknown>,
  handlers: {
    onEvent: (data: SSEEvent) => void
    onError: (msg: string) => void
    onClose?: () => void
  },
  signal?: AbortSignal
): Promise<void> {
  const token = useAuthStore.getState().token
  let res: Response
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    handlers.onError('No se pudo conectar con el servidor')
    return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error del servidor' }))
    handlers.onError(err.error || 'Error del servidor')
    return
  }
  const reader = res.body?.getReader()
  if (!reader) { handlers.onError('No stream'); return }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6)
        if (raw === '[DONE]') continue
        try {
          const parsed = JSON.parse(raw) as SSEEvent
          if (parsed.error) { handlers.onError(parsed.error); return }
          handlers.onEvent(parsed)
        } catch { /* línea parcial, se completará en la siguiente lectura */ }
      }
    }
  } catch (e: unknown) {
    if ((e as { name?: string } | null)?.name !== 'AbortError') handlers.onError('Conexión interrumpida')
  } finally {
    handlers.onClose?.()
  }
}

// Deep Research con progreso en vivo. Devuelve un AbortController para cancelar.
export function streamResearch(
  topic: string,
  rounds: number,
  on: {
    onId?: (id: string) => void
    onProgress: (p: ResearchProgress) => void
    onDone: (report: ResearchReport) => void
    onError: (msg: string) => void
    onCancelled?: () => void
  }
): AbortController {
  const ctrl = new AbortController()
  streamSSE('/research2/start', { topic, rounds }, {
    onEvent: (d) => {
      if (d.id && on.onId) on.onId(d.id)
      if (d.progress) on.onProgress(d.progress)
      if (d.done && d.report) on.onDone(d.report)
      if (d.cancelled && on.onCancelled) on.onCancelled()
    },
    onError: on.onError,
  }, ctrl.signal)
  return ctrl
}

// Autocompletado o comando del editor en streaming. Devuelve AbortController.
export function streamEditor(
  kind: 'autocomplete' | 'command',
  payload: { before?: string; after?: string; command?: string; text?: string; param?: string },
  on: { onDelta: (s: string) => void; onDone: (full?: string) => void; onError: (m: string) => void }
): AbortController {
  const ctrl = new AbortController()
  streamSSE(`/aieditor/${kind}`, payload, {
    onEvent: (d) => {
      if (d.delta) on.onDelta(d.delta)
      if (d.done) on.onDone(d.full)
    },
    onError: on.onError,
  }, ctrl.signal)
  return ctrl
}
