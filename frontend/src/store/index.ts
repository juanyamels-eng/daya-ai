import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User as UserType, Message as MessageType, Conversation as ConversationType, ThemePref } from '../types/api'

export type { ThemePref }

export type User = UserType
export type Message = MessageType
export type Conversation = ConversationType

// Lo que el sistema operativo pide ahora mismo. En servidor no hay ventana: claro.
export function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface AuthStore {
  user: User | null
  token: string | null
  /** Tema YA resuelto: es lo que se pinta. Con themePref='system' lo decide el SO. */
  theme: 'light' | 'dark'
  /** Lo que el usuario eligió en Ajustes. */
  themePref: ThemePref
  hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  setUser: (user: User) => void
  setToken: (token: string) => void
  logout: () => void
  setThemePref: (p: ThemePref) => void
  toggleTheme: () => void
  isAuthenticated: () => boolean
}

function applyThemeClass(t: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', t === 'dark')
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      theme: 'light',
      themePref: 'system',
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      logout: () => {
        set({ user: null, token: null })
        // Limpia el chat activo de la sesión: logout navega con location.href (no cierra
        // la pestaña), así que sin esto el siguiente login en la misma pestaña reabriría
        // el chat viejo. Borrándolo, login → chat nuevo limpio.
        if (typeof window !== 'undefined') {
          try { sessionStorage.removeItem(ACTIVE_CONV_KEY) } catch {}
          // Recarga completa deliberada: garantiza estado limpio de la app tras
          // cerrar sesión (router.push no descartaría módulos ya cargados).
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = '/auth/login'
        }
      },
      // Guarda la preferencia Y el tema resuelto: el script sin-parpadeo del layout
      // lee `theme` directo de localStorage, sin tener que resolver nada.
      setThemePref: (p) => {
        const resolved = p === 'system' ? systemTheme() : p
        set({ themePref: p, theme: resolved })
        applyThemeClass(resolved)
      },
      // El botón de la barra lateral alterna entre claro y oscuro explícitos
      // (deja de seguir al sistema: es una elección deliberada del usuario).
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        set({ themePref: next, theme: next })
        applyThemeClass(next)
      },
      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'daya-auth',
      // v1 añade themePref. A quien ya tenía un tema guardado se le respeta como
      // elección explícita; solo los nuevos arrancan siguiendo al sistema.
      version: 1,
      migrate: (persisted, version) => {
        const p = persisted as Partial<AuthStore>
        if (version < 1 && p && !p.themePref) {
          p.themePref = p.theme === 'dark' ? 'dark' : 'light'
        }
        return p as AuthStore
      },
      // Cuando termina de leer la sesión guardada del navegador, avisa.
      // Sin esto, el dashboard revisaba la sesión ANTES de cargarla y rebotaba al login.
      onRehydrateStorage: () => (state) => { state?.setHasHydrated(true) },
    }
  )
)

interface ChatStore {
  conversations: Conversation[]
  activeConversation: Conversation | null
  messages: Message[]
  isLoading: boolean
  streamingContent: string
  setConversations: (c: Conversation[]) => void
  setActiveConversation: (c: Conversation | null) => void
  setActiveId: (c: Conversation) => void
  setMessages: (m: Message[]) => void
  addMessage: (m: Message) => void
  replaceMessage: (id: string, content: string) => void
  setLoading: (v: boolean) => void
  appendStream: (chunk: string) => void
  setStream: (content: string) => void
  clearStream: () => void
}

// Recuerda QUÉ conversación está abierta para reabrirla tras recargar (F5).
// Usamos sessionStorage (NO localStorage) a propósito: sobrevive a un F5 (misma
// pestaña/sesión) pero se BORRA al cerrar la pestaña o abrir Daya de nuevo. Así, al
// recargar se restaura el chat, pero al ENTRAR de nuevo arrancamos en chat nuevo
// limpio en vez de reabrir uno viejo ya cerrado.
export const ACTIVE_CONV_KEY = 'daya-active-conv'
function persistActiveConvId(id: string | null | undefined) {
  if (typeof window === 'undefined') return
  try {
    if (id) sessionStorage.setItem(ACTIVE_CONV_KEY, id)
    else sessionStorage.removeItem(ACTIVE_CONV_KEY)
  } catch {}
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  isLoading: false,
  streamingContent: '',
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (c) => { persistActiveConvId(c?.id); set({ activeConversation: c, messages: c?.messages || [] }) },
  // Marca la conversación activa SIN tocar los mensajes en pantalla.
  // Se usa al crear un chat nuevo: ya tenemos los mensajes, solo falta el id.
  setActiveId: (c) => { persistActiveConvId(c?.id); set({ activeConversation: c }) },
  setMessages: (messages) => set({ messages }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  replaceMessage: (id, content) => set((s) => ({ messages: s.messages.map(m => m.id === id ? { ...m, content } : m) })),
  setLoading: (isLoading) => set({ isLoading }),
  appendStream: (chunk) => set((s) => ({ streamingContent: s.streamingContent + chunk })),
  // Reemplaza TODO el contenido del stream de una sola vez (1 render por frame
  // en vez de clear()+append() que provocaba 2 escrituras y parpadeo/jank).
  setStream: (content) => set({ streamingContent: content }),
  clearStream: () => set({ streamingContent: '' }),
}))
