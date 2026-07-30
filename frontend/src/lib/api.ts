import axios from 'axios'
import { useAuthStore } from '../store'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' }
})

// Interceptor: agrega token automáticamente.
// CLAVE: la sesión persistida (zustand/persist) se hidrata ASÍNCRONA tras cargar la
// página. Sin esta espera, los fetch de montaje (sidebar, notas, biblioteca…) salían
// SIN token al recargar → 401 → listas vacías hasta interactuar. Aquí, si aún no
// hidrató, esperamos (con tope de 1.5 s) antes de mandar la petición.
api.interceptors.request.use(async (config) => {
  let token = useAuthStore.getState().token
  if (!token && typeof window !== 'undefined' && !useAuthStore.getState().hasHydrated) {
    await new Promise<void>((resolve) => {
      const unsub = useAuthStore.subscribe((s) => { if (s.hasHydrated) { unsub(); resolve() } })
      if (useAuthStore.getState().hasHydrated) { unsub(); resolve() }   // por si hidrató justo ahora
      setTimeout(() => { unsub(); resolve() }, 1500)                    // salvavidas: nunca colgar la petición
    })
    token = useAuthStore.getState().token
  }
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Interceptor de respuesta.
// REGLA ESTRICTA: la sesión es infinita. NO deslogueamos automáticamente al usuario
// por un 401 (podría ser un hipo de red o un reinicio del backend). El usuario solo
// sale de su sesión si hace clic en "Cerrar sesión". Dejamos pasar el error para que
// cada pantalla lo maneje localmente si lo necesita.
api.interceptors.response.use(
  (res) => res,
  (error) => Promise.reject(error)
)

// ---- Auth ----
export const authAPI = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  forgot: (email: string) => api.post('/auth/forgot', { email }),
  reset: (token: string, password: string) => api.post('/auth/reset', { token, password }),
}

// ---- Chat ----
export const chatAPI = {
  getConversations: () => api.get('/chat/conversations'),
  getConversationsPage: (cursor?: string, limit = 30) =>
    api.get('/chat/conversations', { params: { limit, ...(cursor ? { cursor } : {}) } }),
  getConversation: (id: string) => api.get(`/chat/conversations/${id}`),
  deleteConversation: (id: string) => api.delete(`/chat/conversations/${id}`),
  renameConversation: (id: string, title: string) => api.patch(`/chat/conversations/${id}`, { title }),
  pinConversation: (id: string, pinned: boolean) => api.patch(`/chat/conversations/${id}`, { pinned }),
  saveDocNote: (data: { conversationId?: string; prompt?: string; marker: string }) =>
    api.post('/chat/note', data),
  sendFeedback: (userMessage: string, aiResponse: string, rating: 1 | -1) =>
    api.post('/chat/feedback', { userMessage, aiResponse, rating }),
}

// ---- User ----
export const userAPI = {
  getMemories: () => api.get('/user/memories'),
  deleteMemory: (id: string) => api.delete(`/user/memories/${id}`),
  updateProfile: (data: object) => api.patch('/user/profile', data),
  sendSupport: (message: string) => api.post('/user/support', { message }),
  uploadAvatar: (avatar: string) => api.post('/user/avatar', { avatar }),
  exportData: () => api.get('/user/export-data'),
  deleteAccount: () => api.delete('/user/account'),
  resendVerification: () => api.post('/auth/resend-verification'),
}

// ---- Notas y Tareas ----
export const notesAPI = {
  listNotes: () => api.get('/notes/notes'),
  createNote: (data: { title?: string; content?: string; color?: string }) => api.post('/notes/notes', data),
  updateNote: (id: string, data: any) => api.patch(`/notes/notes/${id}`, data),
  deleteNote: (id: string) => api.delete(`/notes/notes/${id}`),
  listTasks: () => api.get('/notes/tasks'),
  createTask: (data: { title: string; priority?: string; dueDate?: string | null }) => api.post('/notes/tasks', data),
  updateTask: (id: string, data: any) => api.patch(`/notes/tasks/${id}`, data),
  deleteTask: (id: string) => api.delete(`/notes/tasks/${id}`),
}

// ---- Cuadernos (investigación anclada a fuentes) ----
export const notebooksAPI = {
  list: () => api.get('/notebooks'),
  create: (title?: string) => api.post('/notebooks', { title }),
  get: (id: string) => api.get(`/notebooks/${id}`),
  rename: (id: string, title: string) => api.patch(`/notebooks/${id}`, { title }),
  remove: (id: string) => api.delete(`/notebooks/${id}`),
  addSource: (id: string, data: { type: 'document' | 'url' | 'text'; docId?: string; url?: string; title?: string; content?: string }) =>
    api.post(`/notebooks/${id}/sources`, data),
  removeSource: (id: string, sid: string) => api.delete(`/notebooks/${id}/sources/${sid}`),
  chat: (id: string, question: string, history: { role: string; content: string }[]) =>
    api.post(`/notebooks/${id}/chat`, { question, history }),
  transform: (id: string, kind: 'resumen' | 'ideas' | 'guia' | 'faq') => api.post(`/notebooks/${id}/transform`, { kind }),
  addAudioSource: (id: string, file: File) => {
    const fd = new FormData(); fd.append('audio', file)
    return api.post(`/notebooks/${id}/sources/audio`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  report: (id: string) => api.post(`/notebooks/${id}/report`),
  library: () => api.get('/documents/library'),
}

// ---- Plantillas de prompt ----
export const promptsAPI = {
  list: () => api.get('/prompts'),
  create: (data: { title: string; content: string }) => api.post('/prompts', data),
  update: (id: string, data: any) => api.patch(`/prompts/${id}`, data),
  remove: (id: string) => api.delete(`/prompts/${id}`),
}

// ---- Editor con IA ----
// Enlace público de una conversación (solo lectura, sin cuenta).
export const shareAPI = {
  status: (id: string) => api.get(`/chat/conversations/${id}/share`),
  share: (id: string) => api.post(`/chat/conversations/${id}/share`),
  unshare: (id: string) => api.delete(`/chat/conversations/${id}/share`),
}

export const editorAPI = {
  assist: (data: { text: string; action?: string; instruction?: string }) => api.post('/editor/assist', data),
  generate: (data: { template: string; topic: string }) => api.post('/editor/generate', data),
  diagram: (data: { type: string; topic: string }) => api.post('/editor/diagram', data),
  save: (data: { title: string; content: string }) => api.post('/editor/save', data),
  export: (data: { title: string; content: string; format: 'pdf' | 'docx' | 'pptx' }) =>
    api.post('/editor/export', data, { responseType: 'blob' }),
  searchImages: (q: string) => api.get('/editor/images', { params: { q } }),
}

// ---- Tokens de API ----
export const tokensAPI = {
  list: () => api.get('/tokens'),
  create: (name: string) => api.post('/tokens', { name }),
  revoke: (id: string) => api.delete(`/tokens/${id}`),
}

// ---- Email (bandeja IMAP + envío SMTP) ----
export const emailAPI = {
  account: () => api.get('/email/account'),
  connect: (data: { imapHost: string; imapPort?: number; imapSecure?: boolean; smtpHost?: string; smtpPort?: number; smtpSecure?: boolean; username: string; password: string; fromName?: string }) => api.post('/email/connect', data),
  disconnect: () => api.delete('/email/account'),
  inbox: () => api.get('/email/inbox'),
  summarize: (uid: number | string) => api.post('/email/summarize', { uid }),
  send: (data: { to: string; subject: string; body: string }) => api.post('/email/send', data),
}

// ---- Calendario ----
export const calendarAPI = {
  listEvents: (from?: string, to?: string) => api.get('/calendar/events', { params: { from, to } }),
  createEvent: (data: { title: string; notes?: string; start: string; end?: string | null; allDay?: boolean; color?: string }) => api.post('/calendar/events', data),
  updateEvent: (id: string, data: any) => api.patch(`/calendar/events/${id}`, data),
  deleteEvent: (id: string) => api.delete(`/calendar/events/${id}`),
}

// ---- Documents ----
export const documentsAPI = {
  extract: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return api.post('/documents/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// ---- Studio: diseños guardados ----
export interface DesignPayload { title: string; w: number; h: number; data: any; thumbnail?: string | null; isTemplate?: boolean }
export const designsAPI = {
  list: () => api.get('/designs'),
  templates: () => api.get('/designs/templates'),
  get: (id: string) => api.get(`/designs/${id}`),
  create: (d: DesignPayload) => api.post('/designs', d),
  update: (id: string, d: Partial<DesignPayload>) => api.put(`/designs/${id}`, d),
  remove: (id: string) => api.delete(`/designs/${id}`),
  share: (id: string) => api.post(`/designs/${id}/share`),
  unshare: (id: string) => api.delete(`/designs/${id}/share`),
  versions: (id: string) => api.get(`/designs/${id}/versions`),
  restoreVersion: (id: string, vid: string) => api.post(`/designs/${id}/versions/${vid}/restore`),
  comments: (id: string) => api.get(`/designs/${id}/comments`),
  addComment: (id: string, body: string) => api.post(`/designs/${id}/comments`, { body }),
  resolveComment: (id: string, cid: string, resolved: boolean) => api.patch(`/designs/${id}/comments/${cid}`, { resolved }),
  deleteComment: (id: string, cid: string) => api.delete(`/designs/${id}/comments/${cid}`),
}

// ---- Studio: banco de fotos (Openverse vía backend, sin API key) ----
export const stockAPI = {
  search: (q: string) => api.get('/stock', { params: { q } }),
}

// ---- Studio: kit de marca ----
export interface BrandKitPayload { colors: string[]; fonts: string[]; logoUrl?: string | null }
export const brandKitAPI = {
  get: () => api.get('/brandkit'),
  save: (k: BrandKitPayload) => api.put('/brandkit', k),
}

// ---- Subscription ----
export const paymentsAPI = {
  getPlans: () => api.get('/payments/plans'),
  getConfig: () => api.get('/payments/config'),
  createPayPalOrder: (planId: string) => api.post('/payments/paypal/create-order', { planId }),
  capturePayPal: (orderId: string, planId: string) => api.post('/payments/paypal/capture', { orderId, planId }),
  status: () => api.get('/payments/status'),
}

// Función para enviar mensaje con streaming
export async function sendMessageStream(
  data: {
    message: string
    model: string
    mode: string
    conversationId?: string
    imageData?: string
    regenerate?: boolean
    webMode?: boolean
    thinkLevel?: 'fast' | 'normal' | 'deep'
  },
  onChunk: (chunk: string) => void,
  onDone: (conversationId: string, failed?: boolean, title?: string) => void,
  onError: (error: string) => void,
  signal?: AbortSignal,
  // Red de seguridad de imagen (Capa 2): el backend detectó que el mensaje pide
  // una imagen y nos pide generarla con Pollinations en vez de responder con texto.
  onImageRequest?: (prompt: string) => void,
  // Razonamiento en vivo (modo Profundo): tokens de razonamiento para el bloque plegable.
  onReasoning?: (reasoning: string) => void,
  // Qué modelo eligió el enrutador para esta respuesta (llega antes del 1er token).
  onModel?: (model: string) => void,
  // Herramienta que Daya acaba de lanzar (buscar_web, crear_tarea…). Llega antes
  // de la primera palabra, para no dejar al usuario mirando un cursor parado.
  onTool?: (tool: string) => void
) {
  const token = useAuthStore.getState().token

  let res: Response
  try {
    res = await fetch(`${API_URL}/api/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
      signal,
    })
  } catch (err: any) {
    onError('No se pudo conectar con el servidor')
    return
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
    onError(err.error || 'Error del servidor')
    return
  }

  const reader = res.body?.getReader()
  if (!reader) { onError('No stream'); return }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  // `settled` evita disparar onDone/onError más de una vez.
  // `lastConvId` recuerda la conversación por si el server cierra el stream
  // sin mandar el evento {done:true} (así conservamos la continuidad del chat).
  let settled = false
  let lastConvId = data.conversationId || ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Decodificar preservando caracteres multi-byte (UTF-8)
      buffer += decoder.decode(value, { stream: true })

      // Procesar todas las líneas SSE completas
      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim()
        buffer = buffer.slice(newlineIdx + 1)

        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6)
        if (raw === '[DONE]') continue

        try {
          const parsed = JSON.parse(raw)

          if (parsed.conversationId) lastConvId = parsed.conversationId

          // Petición de imagen detectada en el servidor: delegar al flujo Pollinations
          if (parsed.imageRequest) {
            settled = true
            onImageRequest?.(parsed.prompt || data.message)
            return
          }

          // Modelo elegido por el enrutador — para el indicador de escritura
          if (parsed.model) {
            onModel?.(parsed.model)
          }

          // Herramienta en marcha — antes del primer token
          if (parsed.tool) {
            onTool?.(parsed.tool)
          }

          // Chunk de texto — enviar INMEDIATAMENTE al UI
          if (parsed.chunk !== undefined) {
            onChunk(parsed.chunk)
          }

          // Razonamiento (modo Profundo) — para el bloque plegable
          if (parsed.reasoning !== undefined) {
            onReasoning?.(parsed.reasoning)
          }

          // Stream terminado
          if (parsed.done && parsed.conversationId) {
            settled = true
            onDone(parsed.conversationId, parsed.failed === true, parsed.title)
          }

          // Error del servidor
          if (parsed.error) {
            settled = true
            onError(parsed.error)
            return
          }
        } catch {
          // JSON parcial, esperar más datos
        }
      }
    }

    // CRÍTICO: el stream se cerró. Si el backend nunca mandó {done:true}
    // (Railway corta la conexión, timeout, fin abrupto...), igual cerramos
    // el ciclo para que isLoading vuelva a false y el input NO se congele.
    if (!settled) onDone(lastConvId, false)
  } catch (err: any) {
    // Si el usuario detuvo la generación a propósito, no es un error
    if (err?.name === 'AbortError') {
      if (!settled) onDone(lastConvId, false)
      return
    }
    if (!settled) onError(err.message || 'Error de conexión')
  } finally {
    reader.releaseLock()
  }
}

