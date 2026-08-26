'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function WidgetPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [config, setConfig] = useState({
    primaryColor: '#6d5cff',
    greeting: 'Hola, soy DAYA. ¿En qué te puedo ayudar?',
    title: 'DAYA Assistant',
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (token) {
      setMessages([{ role: 'assistant', content: config.greeting }])
      // Load config
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/widget/config`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(data => {
        if (data.config) {
          setConfig(data.config)
          setMessages([{ role: 'assistant', content: data.config.greeting }])
        }
      }).catch(() => {})
    }
  }, [token])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/widget/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, token, conversationId }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
        if (data.conversationId) setConversationId(data.conversationId)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }])
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-base)', fontFamily: 'var(--font-body)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border-default)',
        background: config.primaryColor, color: '#fff',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>🤖</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{config.title}</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Powered by DAYA</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            maxWidth: '85%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              padding: '10px 14px', borderRadius: 14,
              background: msg.role === 'user' ? config.primaryColor : 'var(--bg-elevated)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
              fontSize: 13.5, lineHeight: 1.5,
              borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
              borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 14,
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 14, background: 'var(--bg-elevated)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Escribiendo...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px', borderTop: '1px solid var(--border-default)',
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Escribe tu mensaje..."
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
            color: 'var(--text-primary)', fontSize: 13.5, outline: 'none',
            fontFamily: 'var(--font-body)',
          }}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
          width: 40, height: 40, borderRadius: 10, border: 'none',
          background: config.primaryColor, color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: loading || !input.trim() ? 0.5 : 1,
        }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
