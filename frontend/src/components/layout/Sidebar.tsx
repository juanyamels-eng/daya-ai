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
import type { Conversation } from '../../types/api'

const API = process.env.NEXT_PUBLIC_API_URL || ''
type ModalType = 'search' | 'library' | 'settings' | null

interface LibraryDoc { id: string; fileName?: string; fileType?: string }

interface GenImage { id: string; url: string; prompt?: string; createdAt?: string }

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
  const [library, setLibrary] = useState<LibraryDoc[]>([])
  const [libTab, setLibTab] = useState<'docs' | 'images'>('docs')
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [genImages, setGenImages] = useState<GenImage[]>([])
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

  // Detecta pantalla mÃ³vil para convertir el panel en un cajÃ³n deslizable.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Al navegar a otra pÃ¡gina, cierra el cajÃ³n mÃ³vil.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // La selecciÃ³n de documentos solo vive mientras la Biblioteca (pestaÃ±a Documentos)
  // estÃ¡ abierta: al cerrarla o cambiar de pestaÃ±a se limpia para no arrastrar estado.
  useEffect(() => {
    if (modal !== 'library' || libTab !== 'docs') {
      setSelectedDocs(new Set())
    }
  }, [modal, libTab])

  // Marca/desmarca un documento de la selecciÃ³n mÃºltiple.
  const toggleDocSelected = useCallback((id: string) => {
    setSelectedDocs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // "Preguntar a los seleccionados": siembra los nombres de archivo y abre el chat.
  // Reutiliza el mismo mecanismo que "Conversar" (sessionStorage â†’ ChatWindow); el RAG
  // ya busca en todos los documentos, asÃ­ que nombrar el conjunto guÃ­a la recuperaciÃ³n.
  const askSelectedDocs = useCallback(() => {
    const names = library.filter(d => selectedDocs.has(d.id)).map(d => d.fileName)
    if (!names.length) return
    try { sessionStorage.setItem('daya_docs_chat', JSON.stringify(names)) } catch {}
    setModal(null)
    router.push('/dashboard')
  }, [library, selectedDocs, router])

  // Cierra el menÃº de 3 puntos al hacer scroll o redimensionar (el clic-fuera lo
  // maneja un fondo invisible, ver mÃ¡s abajo, que es 100% fiable).
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

  // Abre el menÃº como overlay fijo, anclado al botÃ³n, sin afectar el layout
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
    } catch { toast('No se pudo cargar mÃ¡s conversaciones.', 'error') } finally { setLoadingMore(false) }
  }, [nextCursor, loadingMore, conversations, setConversations])

  // IntersectionObserver: carga la siguiente pÃ¡gina automÃ¡ticamente al hacer scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore() },
      { threshold: 0.1 }
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  // Debounce de bÃºsqueda: 200ms de pausa antes de filtrar la lista
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
    updated.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    setConversations(updated)
    try { await chatAPI.pinConversation(id, !current) } catch {}
  }

  // Arma el texto del chat a partir de sus mensajes
  const buildChatText = async (id: string, title: string): Promise<string> => {
    const r = await chatAPI.getConversation(id)
    const msgs = r.data?.messages || []
    const header = `${title}\n${'='.repeat(title.length)}\n\n`
    const body = msgs.map((m: { role: string; content: string }) => `${m.role === 'user' ? 'ðŸ§‘ TÃº' : 'ðŸ¤– Daya'}:\n${m.content}\n`).join('\n')
    return header + body + `\n\nâ€” Generado con Daya AI`
  }

  const downloadConv = async (id: string, title: string) => {
    setMenuId(null)
    try {
      // Descarga el chat como PDF con el diseÃ±o de Daya
      const res = await fetch(`${API}/api/chat/conversations/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('fallo pdf')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title.replace(/[^a-z0-9Ã¡Ã©Ã­Ã³ÃºÃ± ]/gi, '').trim() || 'chat'}.pdf`
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
        a.download = `${title.replace(/[^a-z0-9Ã¡Ã©Ã­Ã³ÃºÃ± ]/gi, '').trim() || 'chat'}.txt`
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
        toast('ConversaciÃ³n copiada al portapapeles', 'success')
      }
    } catch {}
  }

  // Recarga la primera pÃ¡gina de la lista. Se usa al montar y cuando otra pestaÃ±a
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

  // Otra pestaÃ±a tocÃ³ la lista (o mandÃ³ un mensaje, que cambia el orden y el
  // tÃ­tulo automÃ¡tico): la traemos de nuevo del servidor.
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
  // Studio y Cuadernos abren en PESTAÃ‘A NUEVA: son espacios propios, a pantalla
  // completa y sin barra lateral, asÃ­ que no llevan botÃ³n de volver â€” se cierra
  // la pestaÃ±a y sigues donde estabas, con tu chat intacto. Con router.push en
  // la misma pestaÃ±a quedabas encerrado: sin barra, sin salida y con el botÃ³n
  // atrÃ¡s del navegador como Ãºnico camino.
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
    { key: 'b', ctrl: true, run: () => setCollapsed(c => !c) },
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

  // MenÃº de 3 puntos reutilizable. Se renderiza con un PORTAL a document.body para
  // que el `position: fixed` sea relativo a la pantalla y NO quede atrapado dentro
  // del cajÃ³n lateral (que usa transform) en mÃ³vil.
  const renderConvMenu = (conv: Conversation) => {
    if (menuId !== conv.id) return null
    if (typeof document === 'undefined') return null
    return createPortal(
      <>
        <div onClick={() => { setMenuId(null); setDeleteConfirmId(null) }} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
        <div style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 200, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 4, minWidth: 172, animation: 'dayaScaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both', transformOrigin: 'top left' }}>
          <button onClick={() => togglePin(conv.id, !!conv.pinned)} style={menuItemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={conv.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
            {conv.pinned ? 'Quitar fijado' : 'Fijar'}
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
              <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Â¿Eliminar esta conversaciÃ³n? Esta acciÃ³n no se puede deshacer.</p>
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

      {/* BotÃ³n hamburguesa flotante (solo mÃ³vil, cuando el cajÃ³n estÃ¡ cerrado) */}
      {isMobile && !mobileOpen && (
        <button onClick={() => setMobileOpen(true)} aria-label="Abrir menÃº"
          style={{ position: 'fixed', top: 12, left: 12, zIndex: 60, width: 40, height: 40, borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      )}

      {/* Fondo oscuro al abrir el cajÃ³n en mÃ³vil */}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.4)', animation: 'fadeIn 0.2s ease' }} />
      )}

      {/* â•â•â•â•â•â•â•â• SIDEBAR PRINCIPAL â•â•â•â•â•â•â•â• */}
      <div
        style={{
          width: isMobile ? 270 : (collapsed ? 64 : 270),
          background: 'var(--bg-surface)',
          // El filo de la landing (--border-strong): con el borde por defecto el
          // panel y el lienzo se fundÃ­an y no se veÃ­a dÃ³nde acababa uno.
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
          // â€”â€” Estado colapsado â€”â€”
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', height: '100%' }}>
            <button onClick={() => setCollapsed(false)} style={{ ...iconBtn, width: 42, height: 42, marginBottom: 16 }} title="Expandir panel">
              <img src="/logo.png" alt="Daya" style={{ width: 28, height: 28, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
            </button>
            <div style={{ width: 24, height: 1, background: 'var(--border-strong)', marginBottom: 14 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <IconButton title="Nueva conversaciÃ³n" onClick={newChat}><EditIcon /></IconButton>
              <IconButton title="Buscar" active={modal === 'search'} onClick={() => openModal('search')}><SearchIcon /></IconButton>
              <IconButton title="Biblioteca" active={modal === 'library'} onClick={() => openModal('library')}><LibIcon /></IconButton>
              <IconButton title="Studio" onClick={openStudio}><StudioIcon /></IconButton>
              <IconButton title="Cuadernos" onClick={openNotebooks}><NotebookIcon /></IconButton>
              <IconButton title="Dashboard" onClick={() => router.push('/dashboard')}><DashboardIcon /></IconButton>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ width: 24, height: 1, background: 'var(--border-strong)', marginBottom: 12 }} />
            {/* Cuenta: avatar que abre el menÃº (Ajustes / Cerrar sesiÃ³n). El menÃº va con
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
          // â€”â€” Estado expandido â€”â€”
          // Solo scrollea la LISTA de conversaciones; la cabecera, la navegaciÃ³n
          // y tu cuenta se quedan fijas. Antes scrolleaba el panel entero, asÃ­
          // que con unas cuantas conversaciones tu perfil se iba por debajo del
          // borde y habÃ­a que arrastrar hasta el fondo para llegar a Ajustes o
          // Cerrar sesiÃ³n. Con la barra de desplazamiento oculta, ademÃ¡s, ni
          // siquiera se veÃ­a que aquello siguiera hacia abajo.
          <div style={{ width: 270, display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                {/* Mismas medidas que la nav de la landing: logo de 26 y peso
                    600. A 32 px y en 800 el wordmark pesaba mÃ¡s aquÃ­ que en la
                    portada, y es lo primero que se lee. */}
                <img src="/logo.png" alt="Daya" style={{ width: 26, height: 26, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
                <div style={{ fontWeight: 600, fontSize: '0.98rem', color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>Daya</div>
              </div>
              <button onClick={() => isMobile ? setMobileOpen(false) : setCollapsed(c => !c)} style={{ ...iconBtn, width: 34, height: 34 }} title={isMobile ? 'Cerrar menÃº' : 'Colapsar panel (Ctrl+B)'}><PanelIcon /></button>
            </div>

            {/* NavegaciÃ³n: acciones y herramientas que funcionan */}
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
              <button onClick={() => router.push('/dashboard')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><DashboardIcon /></span><span>Dashboard</span>
              </button>
              <button onClick={() => router.push('/insights')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><InsightsIcon /></span><span>Insights</span>
              </button>
              <button onClick={() => router.push('/workspaces')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><WorkspacesIcon /></span><span>Workspaces</span>
              </button>
              <button onClick={() => router.push('/marketplace')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><MarketplaceIcon /></span><span>Marketplace</span>
              </button>
              <button onClick={() => router.push('/flows')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><FlowsIcon /></span><span>Flows</span>
              </button>
               <button onClick={() => router.push('/playground')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}><PlaygroundIcon /></span><span>Playground</span>
              </button>
              <button onClick={() => router.push('/agents')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}>ðŸ¤–</span><span>Agent Builder</span>
              </button>
              <button onClick={() => router.push('/meetings')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}>ðŸ“</span><span>Meetings</span>
              </button>
              <button onClick={() => router.push('/settings/integrations')} style={rowBtn(false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                <span style={rowIcon()}>ðŸ’¬</span><span>Slack Bot</span>
              </button>
            </div>

            {/* Actividad reciente */}
            <div style={{ padding: '6px 22px 8px' }}>
              <span style={sectionLabel}>{t('recentActivity')}</span>
            </div>
            {/* La ÃšNICA parte que se desplaza. flex:1 + minHeight:0 es lo que
                hace que ocupe el hueco libre y no empuje al pie: sin minHeight,
                un hijo flexible se niega a encogerse por debajo de su contenido
                y la lista volverÃ­a a echar la cuenta fuera de la pantalla.
                Y SÃ enseÃ±a su barra: esconderla dejaba la lista sin ninguna
                forma de saber que seguÃ­a hacia abajo. El margen derecho la
                separa del filo del panel, que es lo que antes hacÃ­a que se
                vieran dos lÃ­neas paralelas. */}
            <div className="stagger" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'clip', padding: '0 6px 10px 10px', marginRight: 4 }}>
              {conversations.length === 0
                ? <Empty text="Sin conversaciones" sub="Inicia una nueva conversaciÃ³n" />
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
                          {conv.pinned && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent-500)', flexShrink: 0, opacity: 0.7 }}><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
                          )}
                          <span style={{ ...truncate, display: 'block', fontSize: '0.86rem', color: 'var(--text-primary)', fontWeight: 500 }}>{conv.title}</span>
                        </button>
                        <button onClick={(e) => openMenu(e, conv.id)} aria-label="Opciones de la conversaciÃ³n"
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
                flexShrink:0 para que no la aplaste la lista al crecer. Desde aquÃ­
                se llega a Ajustes y a Cerrar sesiÃ³n, asÃ­ que esconderla al final
                de un scroll era dejar la salida al fondo de un cajÃ³n.
                Sin lÃ­nea divisoria: el aire y el propio corte de la lista ya
                separan, y un filo ahÃ­ partÃ­a el panel en dos cajas. */}
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
                    {/* El plan es un dato tÃ©cnico, no una frase: versalita
                        monoespaciada, como las etiquetas de la landing. */}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{planLabel(user?.plan)}</span>
                  </span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: accountOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                {/* Cuadrado de 36 y radio 12, como el resto de botones de icono
                    del panel: a 34Ã—34 con radio 8 quedaba descuadrado con el
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

      {/* â•â•â•â•â•â•â•â• MODAL GRANDE (Buscar / Biblioteca) â•â•â•â•â•â•â•â• */}
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

            {/* Barra de bÃºsqueda (en ambos modos) */}
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
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Sin conversaciones con â€œ{searchQuery}â€</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 16 }}>Â¿Quieres preguntarle esto a Daya?</div>
                          <button onClick={() => { try { sessionStorage.setItem('daya_prompt_seed', searchQuery) } catch {} ; setModal(null); newChat() }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 999, background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                            Iniciar chat con â€œ{searchQuery.length > 30 ? searchQuery.slice(0, 30) + 'â€¦' : searchQuery}â€
                          </button>
                        </div>
                      : <Empty text="AÃºn no tienes conversaciones" sub="Empieza una nueva desde el botÃ³n de arriba" />)
                    : <div className="stagger">{(searchQuery ? filteredConvs : conversations).map(conv => (
                      <div key={conv.id} onMouseEnter={() => setHoveredId(conv.id)} onMouseLeave={() => setHoveredId(null)}
                        style={{ position: 'relative', display: 'flex', alignItems: 'center', borderRadius: 11, marginBottom: 4, background: hoveredId === conv.id ? 'var(--bg-surface)' : 'transparent', border: `1px solid ${hoveredId === conv.id ? 'var(--border-default)' : 'transparent'}`, transition: 'all 0.12s' }}>
                        <button onClick={() => loadConv(conv.id)}
                          style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-body)' }}>
                          <span style={{ display: 'flex', color: 'var(--text-tertiary)', flexShrink: 0 }}><ChatIcon /></span>
                          <span style={{ ...truncate, fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>{conv.title}</span>
                        </button>
                        <button onClick={(e) => openMenu(e, conv.id)} aria-label="Opciones de la conversaciÃ³n"
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
                  {/* Tabs Documentos / ImÃ¡genes */}
                  <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px' }}>
                    {(['docs', 'images'] as const).map(tab => (
                      <button key={tab} onClick={() => setLibTab(tab)}
                        style={{ padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: libTab === tab ? 700 : 400, background: libTab === tab ? 'var(--accent-500)' : 'var(--bg-surface)', color: libTab === tab ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                        {tab === 'docs' ? 'Documentos' : 'ImÃ¡genes'}
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
                        ? <Empty text="Sin documentos" sub="Pide un documento en el chat y aparecerÃ¡ aquÃ­" />
                        : (
                          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, padding: '4px 10px' }}>
                            {filteredLibrary.map(doc => { const isSel = selectedDocs.has(doc.id); return (
                              <div key={doc.id} className="daya-lift" onClick={() => toggleDocSelected(doc.id)}
                                title={isSel ? 'Quitar de la selecciÃ³n' : 'Tocar para seleccionar'}
                                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderRadius: 14, border: `1px solid ${isSel ? 'var(--text-tertiary)' : 'var(--border-default)'}`, background: isSel ? 'var(--bg-elevated)' : 'var(--bg-surface)', cursor: 'pointer', transition: 'all 0.14s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = isSel ? 'var(--text-tertiary)' : 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.06)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = isSel ? 'var(--text-tertiary)' : 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}>
                                <button onClick={e => { e.stopPropagation(); toggleDocSelected(doc.id) }}
                                  title={isSel ? 'Quitar de la selecciÃ³n' : 'Seleccionar para preguntar a varios'} aria-pressed={isSel}
                                  style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: `1.5px solid ${isSel ? 'var(--accent-500)' : 'var(--border-strong)'}`, background: isSel ? 'var(--accent-500)' : 'transparent', color: '#fff' }}>
                                  {isSel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </button>
                                <div style={{ width: 44, height: 44, borderRadius: 12, background: (typeColors[doc.fileType || ''] || '#52525b') + '14', border: `1px solid ${(typeColors[doc.fileType || ''] || '#52525b')}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.03em', color: typeColors[doc.fileType || ''] || '#52525b' }}>
                                  {typeLabels[doc.fileType || ''] || 'DOC'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ ...truncate, fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{doc.fileName}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{doc.fileType}</div>
                                </div>
                                <button onClick={e => { e.stopPropagation(); try { sessionStorage.setItem('daya_doc_chat', doc.fileName || '') } catch { }; setModal(null); router.push('/dashboard') }}
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

                  {/* Tab ImÃ¡genes generadas */}
                  {libTab === 'images' && (
                    <>
                      <div style={{ padding: '0 10px 10px' }}>
                        <span style={sectionLabel}>{genImages.length} imagen(es) generada(s)</span>
                      </div>
                      {genImages.length === 0
                        ? <Empty text="Sin imÃ¡genes" sub="Genera una imagen en el chat y aparecerÃ¡ aquÃ­" />
                        : (
                          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: '4px 10px' }}>
                            {genImages.map(img => (
                              <div key={img.id} style={{ borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', overflow: 'hidden', position: 'relative', transition: 'all 0.14s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}>
                                <img src={img.url} alt={img.prompt} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none' }} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                <div style={{ padding: '10px 12px 8px' }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{img.prompt}</div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: 4 }}>{new Date(img.createdAt || Date.now()).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
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
                                    if (!confirm('Â¿Eliminar esta imagen?')) return
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

// â•â•â•â•â•â•â• COMPONENTES Y ESTILOS â•â•â•â•â•â•â•
function planLabel(plan?: string): string {
  return plan === 'PRO' ? 'Plan Pro' : 'Plan Gratis'
}

/* Redondo y con filo, no un bloque negro. El cuadrado macizo era la segunda
   mancha sÃ³lida del panel y competÃ­a con la pÃ­ldora; ademÃ¡s el cÃ­rculo es la
   forma con la que la app dibuja todo lo que representa a una persona. */
function Avatar({ user, size = 32 }: { user: { avatarUrl?: string | null; name?: string } | null | undefined; size?: number }) {
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

/* â”€â”€ El marco, en el lenguaje de la landing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Radios de 12 en lo que es superficie y pÃ­ldora en lo que es acciÃ³n; las
   etiquetas tÃ©cnicas en monoespaciada con versalita y tracking abierto, igual
   que las tarjetas de la portada. El texto corrido se queda en Inter a
   propÃ³sito: en la landing la mono es carÃ¡cter, pero en una lista de tÃ­tulos
   que se lee a diario, cansa. */
const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, background: 'transparent', border: 'none',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-tertiary)', transition: 'all 0.15s', flexShrink: 0,
}
/* PÃ­ldora FANTASMA, no llena. Llena era un rectÃ¡ngulo sÃ³lido de 245Ã—44 a todo
   el ancho: el elemento mÃ¡s pesado de la app entera compitiendo con el
   contenido. En la landing esa pÃ­ldora funciona porque es la Ãºnica llamada de
   una pÃ¡gina casi vacÃ­a; aquÃ­ no. Con filo se lee igual de bien como acciÃ³n y
   deja de gritar. */
const newChatBtn: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
  borderRadius: 999, background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)',
  cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, fontFamily: 'var(--font-body)',
  letterSpacing: '-0.015em', transition: 'background 0.15s, border-color 0.15s', textAlign: 'left',
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

function EditIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function SearchIcon({ size = 18 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> }
function LibIcon({ size = 18 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function ChatIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> }
function StudioIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> }
function NotebookIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9.5" y1="7" x2="16" y2="7"/><line x1="9.5" y1="11" x2="16" y2="11"/></svg> }
function DashboardIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg> }
function InsightsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3z"/></svg> }
function WorkspacesIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function MarketplaceIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> }
function FlowsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> }
function PlaygroundIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
function SettingsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
function LogoutIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg> }
function PanelIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg> }
function CloseIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function DownloadIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
