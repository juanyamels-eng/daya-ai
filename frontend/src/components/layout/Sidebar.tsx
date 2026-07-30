'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { useChatStore, useAuthStore } from '../../store'
import { useT } from '../../lib/i18n'
import { chatAPI } from '../../lib/api'
import { toast } from '../../lib/toast'
import { downloadImage } from '../../lib/download'
import SettingsContent from '../SettingsContent'
import CommandPalette from '../CommandPalette'
import ShortcutsHelp from '../ShortcutsHelp'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useTabSync, publish } from '../../hooks/useTabSync'

const API = process.env.NEXT_PUBLIC_API_URL || ''
type ModalType = 'search' | 'library' | 'settings' | null

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const t = useT()
  const { user, logout, token, theme, toggleTheme } = useAuthStore()
  const { conversations, setConversations, setActiveConversation, setMessages, activeConversation } = useChatStore()

  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [modal, setModal] = useState<ModalType>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [library, setLibrary] = useState<any[]>([])
  const [libTab, setLibTab] = useState<'docs' | 'images'>('docs')
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [genImages, setGenImages] = useState<any[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Detecta pantalla móvil para convertir el panel en un cajón deslizable.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Al navegar a otra página, cierra el cajón móvil.
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // La selección de documentos solo vive mientras la Biblioteca (pestaña Documentos)
  // está abierta: al cerrarla o cambiar de pestaña se limpia para no arrastrar estado.
  useEffect(() => {
    if (modal !== 'library' || libTab !== 'docs') setSelectedDocs(new Set())
  }, [modal, libTab])

  // Marca/desmarca un documento de la selección múltiple.
  const toggleDocSelected = useCallback((id: string) => {
    setSelectedDocs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // "Preguntar a los seleccionados": siembra los nombres de archivo y abre el chat.
  // Reutiliza el mismo mecanismo que "Conversar" (sessionStorage → ChatWindow); el RAG
  // ya busca en todos los documentos, así que nombrar el conjunto guía la recuperación.
  const askSelectedDocs = useCallback(() => {
    const names = library.filter(d => selectedDocs.has(d.id)).map(d => d.fileName)
    if (!names.length) return
    try { sessionStorage.setItem('daya_docs_chat', JSON.stringify(names)) } catch {}
    setModal(null)
    router.push('/dashboard')
  }, [library, selectedDocs, router])

  // Cierra el menú de 3 puntos al hacer scroll o redimensionar (el clic-fuera lo
  // maneja un fondo invisible, ver más abajo, que es 100% fiable).
  useEffect(() => {
    if (!menuId) return
    const close = () => { setMenuId(null); setDeleteConfirmId(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuId(null); setDeleteConfirmId(null) } }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuId])

  // Abre el menú como overlay fijo, anclado al botón, sin afectar el layout
  // ni generar barra de desplazamiento horizontal en la lista.
  const openMenu = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation()
    if (menuId === convId) { setMenuId(null); return }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const MENU_W = 180, MENU_H = 250
    let left = r.right + 6
    if (left + MENU_W > window.innerWidth) left = r.left - MENU_W - 6
    let top = r.top
    if (top + MENU_H > window.innerHeight) top = window.innerHeight - MENU_H - 10
    setMenuPos({ top: Math.max(8, top), left: Math.max(8, left) })
    setMenuId(convId)
  }

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await chatAPI.getConversationsPage(nextCursor)
      const data = r.data
      setConversations([...conversations, ...(data.conversations || [])])
      setNextCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } catch { toast('No se pudo cargar más conversaciones.', 'error') } finally { setLoadingMore(false) }
  }, [nextCursor, loadingMore, conversations, setConversations])

  // IntersectionObserver: carga la siguiente página automáticamente al hacer scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore() },
      { threshold: 0.1 }
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  // Debounce de búsqueda: 200ms de pausa antes de filtrar la lista
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 200)
    return () => clearTimeout(t)
  }, [searchQuery])

  const startRename = (id: string, current: string) => {
    setEditingId(id); setEditTitle(current); setMenuId(null)
  }
  const commitRename = async (id: string) => {
    const title = editTitle.trim()
    setEditingId(null)
    if (!title) return
    setConversations(conversations.map(c => c.id === id ? { ...c, title } : c))
    try { await chatAPI.renameConversation(id, title); publish({ type: 'conversations' }) } catch {}
  }
  const removeConv = async (id: string) => {
    setMenuId(null)
    setDeleteConfirmId(null)
    setConversations(conversations.filter(c => c.id !== id))
    if (activeConversation?.id === id) { setActiveConversation(null); setMessages([]) }
    try { await chatAPI.deleteConversation(id); publish({ type: 'conversations' }) } catch {}
  }

  const togglePin = async (id: string, current: boolean) => {
    setMenuId(null)
    const updated = conversations.map(c => c.id === id ? { ...c, pinned: !current } : c)
    // reordenar: fijados primero
    updated.sort((a: any, b: any) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    setConversations(updated)
    try { await chatAPI.pinConversation(id, !current) } catch {}
  }

  // Arma el texto del chat a partir de sus mensajes
  const buildChatText = async (id: string, title: string): Promise<string> => {
    const r = await chatAPI.getConversation(id)
    const msgs = r.data?.messages || []
    const header = `${title}\n${'='.repeat(title.length)}\n\n`
    const body = msgs.map((m: any) => `${m.role === 'user' ? '🧑 Tú' : '🤖 Daya'}:\n${m.content}\n`).join('\n')
    return header + body + `\n\n— Generado con Daya AI`
  }

  const downloadConv = async (id: string, title: string) => {
    setMenuId(null)
    try {
      // Descarga el chat como PDF con el diseño de Daya
      const res = await fetch(`${API}/api/chat/conversations/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('fallo pdf')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title.replace(/[^a-z0-9áéíóúñ ]/gi, '').trim() || 'chat'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Respaldo: descarga como texto si el PDF falla
      try {
        const text = await buildChatText(id, title)
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title.replace(/[^a-z0-9áéíóúñ ]/gi, '').trim() || 'chat'}.txt`
        a.click()
        URL.revokeObjectURL(url)
      } catch {}
    }
  }

  const shareConv = async (id: string, title: string) => {
    setMenuId(null)
    try {
      const text = await buildChatText(id, title)
      if (navigator.share) {
        await navigator.share({ title, text })
      } else {
        await navigator.clipboard.writeText(text)
        // Aviso simple
        toast('Conversación copiada al portapapeles', 'success')
      }
    } catch {}
  }

  // Recarga la primera página de la lista. Se usa al montar y cuando otra pestaña
  // avisa de que hay conversaciones nuevas, borradas o renombradas.
  const refreshConversations = useCallback(() => {
    chatAPI.getConversationsPage(undefined, 30).then(r => {
      const data = r.data
      setConversations(data.conversations || [])
      setNextCursor(data.nextCursor)
      setHasMore(data.hasMore)
    }).catch(() => {})
  }, [setConversations])

  useEffect(() => { refreshConversations() }, [refreshConversations])

  // Otra pestaña tocó la lista (o mandó un mensaje, que cambia el orden y el
  // título automático): la traemos de nuevo del servidor.
  useTabSync((ev) => {
    if (ev.type === 'conversations' || ev.type === 'messages') refreshConversations()
  })

  useEffect(() => {
    if (modal === 'library') {
      fetch(`${API}/api/documents/library`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(data => setLibrary(Array.isArray(data) ? data : [])).catch(() => {})
      fetch(`${API}/api/images`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(data => setGenImages(Array.isArray(data) ? data : [])).catch(() => {})
    }
  }, [modal])

  // Cerrar modal con tecla Escape
  useEffect(() => {
    if (!modal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modal])

  const newChat = () => { setActiveConversation(null); setMessages([]); setModal(null); setMobileOpen(false); router.push('/dashboard') }
  // Studio y Cuadernos abren en PESTAÑA NUEVA: son espacios propios, a pantalla
  // completa y sin barra lateral, así que no llevan botón de volver — se cierra
  // la pestaña y sigues donde estabas, con tu chat intacto. Con router.push en
  // la misma pestaña quedabas encerrado: sin barra, sin salida y con el botón
  // atrás del navegador como único camino.
  const openInNewTab = (path: string) => {
    setModal(null); setMobileOpen(false)
    window.open(path, '_blank', 'noopener')
  }
  const openStudio = () => openInNewTab('/studio')
  const openNotebooks = () => openInNewTab('/cuadernos')
  const loadConv = async (id: string) => {
    try { const r = await chatAPI.getConversation(id); setActiveConversation(r.data); setModal(null); setMobileOpen(false) } catch {}
  }
  const doLogout = () => { logout(); router.push('/auth/login') }
  const openModal = (m: ModalType) => { setModal(m); setSearchQuery('') }

  // Atajos globales. Se apagan con algo abierto encima para no disparar dos
  // acciones a la vez (Escape ya cierra lo que haya, ver efectos de arriba).
  useKeyboardShortcuts([
    { key: '/', run: () => openModal('search') },
    { key: 'n', run: newChat },
    { key: '?', run: () => setShowShortcuts(true) },
  ], !modal && !showShortcuts)

  const filteredConvs = useMemo(() =>
    debouncedQuery
      ? conversations.filter(c => c.title?.toLowerCase().includes(debouncedQuery.toLowerCase()))
      : conversations,
    [conversations, debouncedQuery]
  )
  const typeColors: Record<string, string> = { pdf: '#ef4444', word: '#3b3b3f', excel: '#16a34a', powerpoint: '#d97706' }
  const typeLabels: Record<string, string> = { pdf: 'PDF', word: 'DOC', excel: 'XLS', powerpoint: 'PPT', image: 'IMG', csv: 'CSV' }

  const filteredLibrary = useMemo(() =>
    debouncedQuery
      ? library.filter(d => d.fileName?.toLowerCase().includes(debouncedQuery.toLowerCase()))
      : library,
    [library, debouncedQuery]
  )

  // Menú de 3 puntos reutilizable. Se renderiza con un PORTAL a document.body para
  // que el `position: fixed` sea relativo a la pantalla y NO quede atrapado dentro
  // del cajón lateral (que usa transform) en móvil.
  const renderConvMenu = (conv: any) => {
    if (menuId !== conv.id) return null
    if (typeof document === 'undefined') return null
    return createPortal(
      <>
        <div onClick={() => { setMenuId(null); setDeleteConfirmId(null) }} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
        <div style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 200, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 4, minWidth: 172, animation: 'dayaScaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both', transformOrigin: 'top left' }}>
          <button onClick={() => togglePin(conv.id, !!(conv as any).pinned)} style={menuItemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={(conv as any).pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
            {(conv as any).pinned ? 'Quitar fijado' : 'Fijar'}
          </button>
          <button onClick={() => startRename(conv.id, conv.title)} style={menuItemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Renombrar
          </button>
          <button onClick={() => downloadConv(conv.id, conv.title)} style={menuItemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar
          </button>
          <button onClick={() => shareConv(conv.id, conv.title)} style={menuItemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Compartir
          </button>
          <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 6px' }} />
          {deleteConfirmId === conv.id ? (
            <div style={{ padding: '6px 8px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>¿Eliminar esta conversación? Esta acción no se puede deshacer.</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setDeleteConfirmId(null)} style={{ flex: 1, padding: '5px 0', fontSize: '0.78rem', borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancelar</button>
                <button onClick={() => removeConv(conv.id)} style={{ flex: 1, padding: '5px 0', fontSize: '0.78rem', borderRadius: 6, border: 'none', background: 'var(--red)', cursor: 'pointer', color: '#fff', fontWeight: 600 }}>Eliminar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setDeleteConfirmId(conv.id)} style={{ ...menuItemStyle, color: 'var(--red)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Eliminar
            </button>
          )}
        </div>
      </>,
      document.body
    )
  }

  return (
    <>
      <CommandPalette />
      <ShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Botón hamburguesa flotante (solo móvil, cuando el cajón está cerrado) */}
      {isMobile && !mobileOpen && (
        <button onClick={() => setMobileOpen(true)} aria-label="Abrir menú"
          style={{ position: 'fixed', top: 12, left: 12, zIndex: 60, width: 40, height: 40, borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      )}

      {/* Fondo oscuro al abrir el cajón en móvil */}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.4)', animation: 'fadeIn 0.2s ease' }} />
      )}

      {/* ════════ SIDEBAR PRINCIPAL ════════ */}
      <div
        style={{
          width: isMobile ? 270 : (collapsed ? 64 : 270),
          background: 'var(--bg-surface)',
          // El filo de la landing (--border-strong): con el borde por defecto el
          // panel y el lienzo se fundían y no se veía dónde acababa uno.
          borderRight: '1px solid var(--border-strong)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          height: '100%',
          overflow: 'hidden',
          transition: isMobile ? 'transform 0.28s cubic-bezier(0.22,1,0.36,1)' : 'width 0.26s cubic-bezier(0.22,1,0.36,1)',
          ...(isMobile
            ? { position: 'fixed' as const, top: 0, left: 0, zIndex: 50, transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', boxShadow: mobileOpen ? '0 0 40px rgba(0,0,0,0.2)' : 'none' }
            : { position: 'relative' as const, zIndex: 40 }),
        }}>

        {(collapsed && !isMobile) ? (
          // —— Estado colapsado ——
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', height: '100%' }}>
            <button onClick={() => setCollapsed(false)} style={{ ...iconBtn, width: 42, height: 42, marginBottom: 16 }} title="Expandir panel">
              <img src="/logo.png" alt="Daya" style={{ width: 28, height: 28, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
            </button>
            <div style={{ width: 24, height: 1, background: 'var(--border-strong)', marginBottom: 14 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <IconButton title="Nueva conversación" onClick={newChat}><EditIcon /></IconButton>
              <IconButton title="Buscar" active={modal === 'search'} onClick={() => openModal('search')}><SearchIcon /></IconButton>
              <IconButton title="Biblioteca" active={modal === 'library'} onClick={() => openModal('library')}><LibIcon /></IconButton>
              <IconButton title="Studio" onClick={openStudio}><StudioIcon /></IconButton>
              <IconButton title="Cuadernos" onClick={openNotebooks}><NotebookIcon /></IconButton>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ width: 24, height: 1, background: 'var(--border-strong)', marginBottom: 12 }} />
            {/* Cuenta: avatar que abre el menú (Ajustes / Cerrar sesión). El menú va con
                position:fixed para FLOTAR por encima y no recortarse con el overflow del panel. */}
            <div>
              {accountOpen && (
                <>
                  <div onClick={() => setAccountOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
                  <div style={{ position: 'fixed', left: 12, bottom: 60, minWidth: 200, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', padding: 5, zIndex: 60, animation: 'dayaScaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both', transformOrigin: 'bottom left' }}>
                    <button onClick={() => { setAccountOpen(false); openModal('settings') }} style={menuItemStyle}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <SettingsIcon /> {t('settings')}
                    </button>
                    <button onClick={() => { setAccountOpen(false); doLogout() }} style={{ ...menuItemStyle, color: 'var(--red)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <LogoutIcon /> {t('logout')}
                    </button>
                  </div>
                </>
              )}
              <button onClick={() => setAccountOpen(o => !o)} title={user?.name || 'Cuenta'} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <Avatar user={user} size={32} />
              </button>
              <button onClick={toggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} style={{ marginTop: 4, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8, color: 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
                <ThemeIcon theme={theme} />
              </button>
            </div>
          </div>
        ) : (
          // —— Estado expandido ——
          // Solo scrollea la LISTA de conversaciones; la cabecera, la navegación
          // y tu cuenta se quedan fijas. Antes scrolleaba el panel entero, así
          // que con unas cuantas conversaciones tu perfil se iba por debajo del
          // borde y había que arrastrar hasta el fondo para llegar a Ajustes o
          // Cerrar sesión. Con la barra de desplazamiento oculta, además, ni
          // siquiera se veía que aquello siguiera hacia abajo.
          <div style={{ width: 270, display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                {/* Mismas medidas que la nav de la landing: logo de 26 y peso
                    600. A 32 px y en 800 el wordmark pesaba más aquí que en la
                    portada, y es lo primero que se lee. */}
                <img src="/logo.png" alt="Daya" style={{ width: 26, height: 26, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
                <div style={{ fontWeight: 600, fontSize: '0.98rem', color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>Daya</div>
              </div>
              <button onClick={() => isMobile ? setMobileOpen(false) : setCollapsed(true)} style={{ ...iconBtn, width: 34, height: 34 }} title={isMobile ? 'Cerrar menú' : 'Colapsar panel'}><PanelIcon /></button>
            </div>

            {/* Navegación: acciones y herramientas que funcionan */}
            <div style={{ padding: '6px 12px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={newChat} style={newChatBtn}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.borderColor = 'var(--text-tertiary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}>
                <span style={{ display: 'flex', flexShrink: 0 }}><EditIcon /></span><span>{t('newChat')}</span>
              </button>
              <button onClick={() => openModal('search')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><SearchIcon /></span><span>{t('search')}</span>
              </button>
              <button onClick={() => openModal('library')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><LibIcon /></span><span>{t('library')}</span>
              </button>
              <button onClick={openStudio} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><StudioIcon /></span><span>Studio</span>
              </button>
              <button onClick={openNotebooks} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><NotebookIcon /></span><span>Cuadernos</span>
              </button>
            </div>

            {/* Actividad reciente */}
            <div style={{ padding: '6px 22px 8px' }}>
              <span style={sectionLabel}>{t('recentActivity')}</span>
            </div>
            {/* La ÚNICA parte que se desplaza. flex:1 + minHeight:0 es lo que
                hace que ocupe el hueco libre y no empuje al pie: sin minHeight,
                un hijo flexible se niega a encogerse por debajo de su contenido
                y la lista volvería a echar la cuenta fuera de la pantalla.
                Y SÍ enseña su barra: esconderla dejaba la lista sin ninguna
                forma de saber que seguía hacia abajo. El margen derecho la
                separa del filo del panel, que es lo que antes hacía que se
                vieran dos líneas paralelas. */}
            <div className="stagger" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'clip', padding: '0 6px 10px 10px', marginRight: 4 }}>
              {conversations.length === 0
                ? <Empty text="Sin conversaciones" sub="Inicia una nueva conversación" />
                : conversations.map(conv => (
                  <div key={conv.id}
                    onMouseEnter={() => setHoveredId(conv.id)} onMouseLeave={() => setHoveredId(null)}
                    className={`daya-conv-item${activeConversation?.id === conv.id ? ' daya-conv-active' : ''}`}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center', borderRadius: 9, marginBottom: 2, background: hoveredId === conv.id || activeConversation?.id === conv.id ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.12s' }}>
                    {editingId === conv.id ? (
                      <input autoFocus value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onBlur={() => commitRename(conv.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(conv.id); if (e.key === 'Escape') setEditingId(null) }}
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 9, background: 'var(--bg-surface)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
                    ) : (
                      <>
                        <button onClick={() => loadConv(conv.id)}
                          style={{ flex: 1, textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 0, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 7 }}>
                          {(conv as any).pinned && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent-500)', flexShrink: 0, opacity: 0.7 }}><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
                          )}
                          <span style={{ ...truncate, display: 'block', fontSize: '0.86rem', color: 'var(--text-primary)', fontWeight: 500 }}>{conv.title}</span>
                        </button>
                        <button onClick={(e) => openMenu(e, conv.id)} aria-label="Opciones de la conversación"
                          style={{ opacity: hoveredId === conv.id || menuId === conv.id ? 1 : 0.45, padding: '6px 8px', marginRight: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', borderRadius: 6, transition: 'opacity 0.12s', flexShrink: 0 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
                        </button>
                      </>
                    )}
                    {renderConvMenu(conv)}
                  </div>
                ))}
              {/* Sentinel: el IntersectionObserver lo observa para auto-paginar */}
              <div ref={loadMoreRef} style={{ height: 1 }} />
              {loadingMore && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                  <span style={{ width: 14, height: 14, border: '2px solid var(--border-default)', borderTopColor: 'var(--text-tertiary)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                </div>
              )}
            </div>

            {/* Tu cuenta: SIEMPRE visible, tengas dos conversaciones o doscientas.
                flexShrink:0 para que no la aplaste la lista al crecer. Desde aquí
                se llega a Ajustes y a Cerrar sesión, así que esconderla al final
                de un scroll era dejar la salida al fondo de un cajón.
                Sin línea divisoria: el aire y el propio corte de la lista ya
                separan, y un filo ahí partía el panel en dos cajas. */}
            <div style={{ flexShrink: 0, padding: '12px 12px 10px', position: 'relative', background: 'var(--bg-surface)' }}>
              {accountOpen && (
                <>
                  <div onClick={() => setAccountOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
                  <div style={{ position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', padding: 5, zIndex: 40, animation: 'dayaScaleIn 0.2s cubic-bezier(0.16,1,0.3,1) both', transformOrigin: 'bottom center' }}>
                    <button onClick={() => { setAccountOpen(false); openModal('settings') }} style={menuItemStyle}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <SettingsIcon /> {t('settings')}
                    </button>
                    <button onClick={() => { setAccountOpen(false); doLogout() }} style={{ ...menuItemStyle, color: 'var(--red)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <LogoutIcon /> {t('logout')}
                    </button>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setAccountOpen(o => !o)} title={user?.name || 'Cuenta'} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', flex: 1, minWidth: 0, background: accountOpen ? 'var(--bg-elevated)' : 'transparent', border: 'none', cursor: 'pointer', borderRadius: 10, textAlign: 'left' }}
                  onMouseEnter={e => { if (!accountOpen) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                  onMouseLeave={e => { if (!accountOpen) e.currentTarget.style.background = 'transparent' }}>
                  <Avatar user={user} size={34} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1, flex: 1 }}>
                    <span style={{ ...truncate, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{user?.name || 'Usuario'}</span>
                    {/* El plan es un dato técnico, no una frase: versalita
                        monoespaciada, como las etiquetas de la landing. */}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{planLabel(user?.plan)}</span>
                  </span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: accountOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                {/* Cuadrado de 36 y radio 12, como el resto de botones de icono
                    del panel: a 34×34 con radio 8 quedaba descuadrado con el
                    chevron de al lado y pegado al borde. */}
                <button onClick={toggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 12, color: 'var(--text-tertiary)', transition: 'background 0.15s, color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                  <ThemeIcon theme={theme} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ════════ MODAL GRANDE (Buscar / Biblioteca) ════════ */}
      {modal === 'settings' && (
        <SettingsContent asModal onClose={() => setModal(null)} />
      )}

      {(modal === 'search' || modal === 'library') && (
        <div
          onMouseDown={e => { if (e.target === e.currentTarget) setModal(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '7vh 24px 24px',
            background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(3px)',
            animation: 'fadeIn 0.18s ease',
          }}>
          <div style={{
            width: '100%', maxWidth: 860, maxHeight: '86vh',
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
            borderRadius: 18, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
            animation: 'modalPop 0.22s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {/* Header del modal */}
            <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'flex', color: 'var(--text-secondary)' }}>{modal === 'search' ? <SearchIcon size={22} /> : <LibIcon size={22} />}</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
                  {modal === 'search' ? 'Buscar conversaciones' : 'Biblioteca'}
                </span>
              </div>
              <button onClick={() => setModal(null)} style={{ ...iconBtn, width: 36, height: 36 }} title="Cerrar (Esc)"><CloseIcon /></button>
            </div>

            {/* Barra de búsqueda (en ambos modos) */}
            <div style={{ padding: '18px 24px 12px' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', display: 'flex', pointerEvents: 'none' }}><SearchIcon size={18} /></span>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder={modal === 'search' ? 'Escribe para buscar entre tus conversaciones...' : 'Buscar un documento por nombre...'} autoFocus
                  style={{ width: '100%', padding: '14px 16px 14px 46px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Contenido scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 20px' }}>
              {modal === 'search' && (
                <>
                  <div style={{ padding: '6px 10px 10px' }}>
                    <span style={sectionLabel}>{searchQuery ? `${filteredConvs.length} resultado(s)` : 'Recientes'}</span>
                  </div>
                  {(searchQuery ? filteredConvs : conversations).length === 0
                    ? (searchQuery
                      ? <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Sin conversaciones con “{searchQuery}”</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 16 }}>¿Quieres preguntarle esto a Daya?</div>
                          <button onClick={() => { try { sessionStorage.setItem('daya_prompt_seed', searchQuery) } catch {} ; setModal(null); newChat() }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 999, background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                            Iniciar chat con “{searchQuery.length > 30 ? searchQuery.slice(0, 30) + '…' : searchQuery}”
                          </button>
                        </div>
                      : <Empty text="Aún no tienes conversaciones" sub="Empieza una nueva desde el botón de arriba" />)
                    : <div className="stagger">{(searchQuery ? filteredConvs : conversations).map(conv => (
                      <div key={conv.id} onMouseEnter={() => setHoveredId(conv.id)} onMouseLeave={() => setHoveredId(null)}
                        style={{ position: 'relative', display: 'flex', alignItems: 'center', borderRadius: 11, marginBottom: 4, background: hoveredId === conv.id ? 'var(--bg-surface)' : 'transparent', border: `1px solid ${hoveredId === conv.id ? 'var(--border-default)' : 'transparent'}`, transition: 'all 0.12s' }}>
                        <button onClick={() => loadConv(conv.id)}
                          style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-body)' }}>
                          <span style={{ display: 'flex', color: 'var(--text-tertiary)', flexShrink: 0 }}><ChatIcon /></span>
                          <span style={{ ...truncate, fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>{conv.title}</span>
                        </button>
                        <button onClick={(e) => openMenu(e, conv.id)} aria-label="Opciones de la conversación"
                          style={{ opacity: hoveredId === conv.id || menuId === conv.id ? 1 : 0.4, padding: '8px 10px', marginRight: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', borderRadius: 6, transition: 'opacity 0.12s', flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
                        </button>
                        {renderConvMenu(conv)}
                      </div>
                    ))}</div>}
                </>
              )}

              {modal === 'library' && (
                <>
                  {/* Tabs Documentos / Imágenes */}
                  <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px' }}>
                    {(['docs', 'images'] as const).map(tab => (
                      <button key={tab} onClick={() => setLibTab(tab)}
                        style={{ padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: libTab === tab ? 700 : 400, background: libTab === tab ? 'var(--accent-500)' : 'var(--bg-surface)', color: libTab === tab ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                        {tab === 'docs' ? 'Documentos' : 'Imágenes'}
                        <span style={{ marginLeft: 6, opacity: 0.7, fontSize: '0.72rem' }}>
                          {tab === 'docs' ? library.length : genImages.length}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Tab Documentos */}
                  {libTab === 'docs' && (
                    <>
                      <div style={{ padding: '0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <span style={sectionLabel}>
                          {selectedDocs.size > 0
                            ? `${selectedDocs.size} seleccionado(s)`
                            : (debouncedQuery ? `${filteredLibrary.length} resultado(s)` : `${library.length} documento(s)`)}
                        </span>
                        {selectedDocs.size > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => setSelectedDocs(new Set())}
                              style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600 }}>
                              Limpiar
                            </button>
                            <button onClick={askSelectedDocs}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 999, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-base)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600 }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              {isMobile ? `Preguntar (${selectedDocs.size})` : `Preguntar a los ${selectedDocs.size} seleccionados`}
                            </button>
                          </div>
                        )}
                      </div>
                      {filteredLibrary.length === 0
                        ? <Empty text="Sin documentos" sub="Pide un documento en el chat y aparecerá aquí" />
                        : (
                          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, padding: '4px 10px' }}>
                            {filteredLibrary.map(doc => { const isSel = selectedDocs.has(doc.id); return (
                              <div key={doc.id} className="daya-lift" onClick={() => toggleDocSelected(doc.id)}
                                title={isSel ? 'Quitar de la selección' : 'Tocar para seleccionar'}
                                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderRadius: 14, border: `1px solid ${isSel ? 'var(--text-tertiary)' : 'var(--border-default)'}`, background: isSel ? 'var(--bg-elevated)' : 'var(--bg-surface)', cursor: 'pointer', transition: 'all 0.14s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = isSel ? 'var(--text-tertiary)' : 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.06)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = isSel ? 'var(--text-tertiary)' : 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}>
                                <button onClick={e => { e.stopPropagation(); toggleDocSelected(doc.id) }}
                                  title={isSel ? 'Quitar de la selección' : 'Seleccionar para preguntar a varios'} aria-pressed={isSel}
                                  style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: `1.5px solid ${isSel ? 'var(--accent-500)' : 'var(--border-strong)'}`, background: isSel ? 'var(--accent-500)' : 'transparent', color: '#fff' }}>
                                  {isSel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </button>
                                <div style={{ width: 44, height: 44, borderRadius: 12, background: (typeColors[doc.fileType] || '#52525b') + '14', border: `1px solid ${(typeColors[doc.fileType] || '#52525b')}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.03em', color: typeColors[doc.fileType] || '#52525b' }}>
                                  {typeLabels[doc.fileType] || 'DOC'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ ...truncate, fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{doc.fileName}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{doc.fileType}</div>
                                </div>
                                <button onClick={e => { e.stopPropagation(); try { sessionStorage.setItem('daya_doc_chat', doc.fileName) } catch { }; setModal(null); router.push('/dashboard') }}
                                  title="Conversar sobre este documento"
                                  style={{ color: 'var(--text-tertiary)', background: 'transparent', border: 'none', display: 'flex', flexShrink: 0, padding: 8, borderRadius: 9, cursor: 'pointer', transition: 'all 0.12s' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                </button>
                                <a href={`${API}/api/documents/download/${doc.id}`} download onClick={e => e.stopPropagation()}
                                  style={{ color: 'var(--text-tertiary)', display: 'flex', flexShrink: 0, padding: 8, borderRadius: 9, transition: 'all 0.12s' }} title="Descargar"
                                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}><DownloadIcon /></a>
                              </div>
                            ) })}
                          </div>
                        )}
                    </>
                  )}

                  {/* Tab Imágenes generadas */}
                  {libTab === 'images' && (
                    <>
                      <div style={{ padding: '0 10px 10px' }}>
                        <span style={sectionLabel}>{genImages.length} imagen(es) generada(s)</span>
                      </div>
                      {genImages.length === 0
                        ? <Empty text="Sin imágenes" sub="Genera una imagen en el chat y aparecerá aquí" />
                        : (
                          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: '4px 10px' }}>
                            {genImages.map(img => (
                              <div key={img.id} style={{ borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', overflow: 'hidden', position: 'relative', transition: 'all 0.14s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}>
                                <img src={img.url} alt={img.prompt} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none' }} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                <div style={{ padding: '10px 12px 8px' }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{img.prompt}</div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: 4 }}>{new Date(img.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 4, padding: '0 8px 10px', justifyContent: 'flex-end' }}>

                                  <button onClick={() => {
                                    const safe = (img.prompt || 'imagen').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `imagen-${img.id}`
                                    downloadImage(img.url, `${safe}.jpg`)
                                  }}
                                    style={{ padding: '5px 8px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', cursor: 'pointer', transition: 'all 0.12s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                                    title="Descargar imagen">
                                    <DownloadIcon />
                                  </button>
                                  <button onClick={async () => {
                                    if (!confirm('¿Eliminar esta imagen?')) return
                                    await fetch(`${API}/api/images/${img.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
                                    setGenImages(prev => prev.filter(i => i.id !== img.id))
                                  }} style={{ padding: '5px 8px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--red)', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: 'all 0.12s' }} title="Eliminar imagen"
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)'; e.currentTarget.style.borderColor = 'var(--red)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalPop{from{opacity:0;transform:scale(0.97) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes themeFlip{0%{opacity:0;transform:rotate(-90deg) scale(0.6)}100%{opacity:1;transform:rotate(0deg) scale(1)}}
      `}</style>
    </>
  )
}

// ═══════ COMPONENTES Y ESTILOS ═══════
function planLabel(plan?: string): string {
  return plan === 'PRO' ? 'Plan Pro' : 'Plan Gratis'
}

/* Redondo y con filo, no un bloque negro. El cuadrado macizo era la segunda
   mancha sólida del panel y competía con la píldora; además el círculo es la
   forma con la que la app dibuja todo lo que representa a una persona. */
function Avatar({ user, size = 32 }: { user: any; size?: number }) {
  const url = user?.avatarUrl
  if (url) {
    return <img src={url} alt={user?.name || 'avatar'} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '1px solid var(--border-strong)' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: size * 0.4, color: 'var(--text-primary)', flexShrink: 0 }}>
      {user?.name?.charAt(0).toUpperCase() || 'U'}
    </div>
  )
}

function IconButton({ children, title, onClick, active }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      style={{ ...iconBtn, position: 'relative', background: active ? 'var(--bg-elevated)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: active ? 'inset 0 0 0 1px var(--border-default)' : 'none' }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' } }}>
      {active && <span style={{ position: 'absolute', left: -10, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, borderRadius: 3, background: 'var(--accent-500)' }} />}
      {children}
    </button>
  )
}

function ThemeIcon({ theme }: { theme: string }) {
  return (
    <span key={theme} style={{ display: 'flex', animation: 'themeFlip 0.28s cubic-bezier(0.16,1,0.3,1) both' }}>
      {theme === 'dark'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </span>
  )
}

function Empty({ text, sub }: { text: string; sub: string }) {
  return (
    <div style={{ padding: '48px 18px', textAlign: 'center' }}>
      <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 4 }}>{text}</p>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{sub}</p>
    </div>
  )
}

/* ── El marco, en el lenguaje de la landing ──────────────────────────────────
   Radios de 12 en lo que es superficie y píldora en lo que es acción; las
   etiquetas técnicas en monoespaciada con versalita y tracking abierto, igual
   que las tarjetas de la portada. El texto corrido se queda en Inter a
   propósito: en la landing la mono es carácter, pero en una lista de títulos
   que se lee a diario, cansa. */
const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, background: 'transparent', border: 'none',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-tertiary)', transition: 'all 0.15s', flexShrink: 0,
}
/* Píldora FANTASMA, no llena. Llena era un rectángulo sólido de 245×44 a todo
   el ancho: el elemento más pesado de la app entera compitiendo con el
   contenido. En la landing esa píldora funciona porque es la única llamada de
   una página casi vacía; aquí no. Con filo se lee igual de bien como acción y
   deja de gritar. */
const newChatBtn: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
  borderRadius: 999, background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)',
  cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, fontFamily: 'var(--font-body)',
  letterSpacing: '-0.015em', transition: 'background 0.15s, border-color 0.15s', textAlign: 'left',
}
const newChatIconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 999, background: 'transparent',
  border: '1px solid var(--border-strong)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-primary)', transition: 'background 0.15s', flexShrink: 0,
}
const rowBtn = (active: boolean): React.CSSProperties => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px',
  borderRadius: 12, background: active ? 'var(--bg-elevated)' : 'transparent', border: 'none',
  cursor: 'pointer', color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  fontSize: '0.87rem', fontWeight: active ? 600 : 500, fontFamily: 'var(--font-body)',
  transition: 'background 0.15s, color 0.15s, transform 0.15s', textAlign: 'left',
})
const rowIcon = (active = false): React.CSSProperties => ({
  display: 'flex', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', flexShrink: 0,
  transition: 'color 0.13s',
})
const navLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 500, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '16px 12px 6px',
}
const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
  borderRadius: 10, background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)', fontSize: '0.83rem', fontWeight: 500,
  fontFamily: 'var(--font-body)', textAlign: 'left', transition: 'background 0.12s',
}
const truncate: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }
const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 500, color: 'var(--text-tertiary)',
  letterSpacing: '0.12em', textTransform: 'uppercase',
}
const avatarBox: React.CSSProperties = {
  width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.8rem',
  color: 'var(--text-primary)', flexShrink: 0,
}

function EditIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function SearchIcon({ size = 18 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> }
function LibIcon({ size = 18 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function ChatIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> }
function StudioIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> }
function NotebookIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9.5" y1="7" x2="16" y2="7"/><line x1="9.5" y1="11" x2="16" y2="11"/></svg> }
function SettingsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
function LogoutIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg> }
function PanelIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg> }
function CloseIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function DownloadIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
