'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import MessageBubble from '../../../components/chat/MessageBubble'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface Msg { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }
interface Shared { title: string; sharedAt: string; messages: Msg[] }

/* Vista pública de una conversación compartida: SOLO LECTURA y sin sesión.
   No hay redactor ni acciones — se lee y ya. El backend ya filtra las tarjetas
   de documentos generados, así que aquí nunca llegan enlaces privados. */
export default function SharedConversationPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<Shared | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetch(`${API}/api/public/conversation/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setError(true))
  }, [slug])

  if (error) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, background: 'var(--bg-base)', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>Esta conversación no está disponible</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', maxWidth: 420 }}>
          El enlace puede haber caducado o quien la compartió dejó de hacerlo.
        </p>
        <Link href="/" style={{ marginTop: 6, padding: '9px 18px', borderRadius: 999, background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
          Ir a Daya AI
        </Link>
      </main>
    )
  }

  if (!data) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
        Cargando conversación…
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '13px 20px', background: 'var(--bg-base)', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.title}</h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
            Conversación compartida · solo lectura
          </p>
        </div>
        <Link href="/" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 999, background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' }}>
          <img src="/logo.png" alt="" width={15} height={15} style={{ objectFit: 'contain', filter: 'var(--logo-filter)' }} />
          Probar Daya AI
        </Link>
      </header>

      <div className="daya-chat-col daya-msgs-col" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 80px' }}>
        {!data.messages.length ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', textAlign: 'center' }}>Esta conversación no tiene mensajes.</p>
        ) : data.messages.map(m => (
          <div key={m.id} style={{ animation: 'dayaRise 0.34s cubic-bezier(0.16,1,0.3,1) both' }}>
            <MessageBubble message={{ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt }} />
          </div>
        ))}
      </div>
    </main>
  )
}
