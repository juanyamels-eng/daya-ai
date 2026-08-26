'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { Card, CardContent, Button, Badge, Input } from '@/components/ui'

interface Agent {
  id: string
  name: string
  description: string
  systemPrompt: string
  model: string
  tools: string[]
  knowledge: string[]
  settings: Record<string, unknown> | null
  isPublished: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function AgentDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)

  // Guard: sin sesión, a login (antes la página se quedaba cargando para siempre)
  useEffect(() => {
    if (hasHydrated && !token) router.push('/auth/login')
  }, [hasHydrated, token, router])

  useEffect(() => {
    if (!token || !id) return
    fetch(`/api/agent-builder/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setAgent(data.agent)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token, id])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || running) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setRunning(true)

    try {
      const res = await fetch(`/api/agent-builder/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.response || 'Error' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión' }])
    } finally {
      setRunning(false)
    }
  }

  if (loading || !agent) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/agents')}>← Volver</Button>
          <div>
            <h1 className="text-xl font-bold">{agent.name}</h1>
            <p className="text-sm text-muted-foreground">{agent.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{agent.model}</Badge>
          <Badge variant={agent.isPublished ? 'success' : 'neutral'}>
            {agent.isPublished ? 'Publicado' : 'Borrador'}
          </Badge>
        </div>
      </div>

      {/* Tools & Knowledge */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {agent.tools.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
        {agent.knowledge.map(k => <Badge key={k} variant="primary" className="text-xs">📚 {k}</Badge>)}
      </div>

      {/* Chat */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-lg mb-2">💬 {agent.name}</p>
              <p className="text-sm">Escribe un mensaje para comenzar la conversación</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {running && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEnd} />
        </CardContent>
        <div className="border-t p-4">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage() }} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe un mensaje..."
              disabled={running}
              className="flex-1"
            />
            <Button type="submit" disabled={!input.trim() || running}>Enviar</Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
