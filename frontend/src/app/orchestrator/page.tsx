'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input } from '@/components/ui'
import { Play, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'

interface OrchestratorEvent {
  type: string
  iteration?: number
  tool?: string
  args?: Record<string, unknown>
  success?: boolean
  durationMs?: number
  verdict?: string
  content?: string
  traceId?: string
  state?: string
  totalDurationMs?: number
  totalCostUsd?: number
  message?: string
  checkpointId?: string
}

interface Step {
  iteration: number
  tool: string
  success: boolean
  durationMs: number
  output?: string
}

export default function OrchestratorPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const [task, setTask] = useState('')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<OrchestratorEvent[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [answer, setAnswer] = useState('')
  const [traceId, setTraceId] = useState('')
  const eventsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (eventsRef.current) {
      eventsRef.current.scrollTop = eventsRef.current.scrollHeight
    }
  }, [events])

  const runOrchestrator = useCallback(async () => {
    if (!task.trim() || running) return
    setRunning(true)
    setEvents([])
    setSteps([])
    setAnswer('')
    setTraceId('')

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/orchestrator/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({ task: task.trim(), stream: true }),
      })

      if (!res.ok) throw new Error('Orchestrator request failed')

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            const event = data as OrchestratorEvent
            setEvents(prev => [...prev, event])

            if (event.type === 'tool_end' && event.tool) {
              setSteps(prev => [...prev, {
                iteration: event.iteration || 0,
                tool: event.tool!,
                success: event.success || false,
                durationMs: event.durationMs || 0,
              }])
            }

            if (event.type === 'answer' && event.content) {
              setAnswer(event.content)
            }

            if (event.type === 'done') {
              setTraceId(event.traceId || '')
              toast.success(`Completado en ${(event.totalDurationMs || 0 / 1000).toFixed(1)}s`)
            }

            if (event.type === 'error') {
              toast.error(event.message || 'Error en orquestador')
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error && e.message ? e.message : 'Error ejecutando orquestador')
    } finally {
      setRunning(false)
    }
  }, [task, running, toast])

  if (!hasHydrated) return null

  const eventTypeColor = (type: string) => {
    switch (type) {
      case 'start': return 'var(--accent-500)'
      case 'plan': return '#6366f1'
      case 'tool_start': return '#f59e0b'
      case 'tool_end': return 'var(--accent-500)'
      case 'evaluate': return '#8b5cf6'
      case 'answer': return '#10b981'
      case 'error': return '#ef4444'
      case 'done': return '#10b981'
      default: return 'var(--text-secondary)'
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: 4 }}>Orquestador</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Plan-Execute-Evaluate — tareas complejas con herramientas
        </p>

        {/* Task input */}
        <Card style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Input
              placeholder="Describe la tarea que quieres ejecutar..."
              value={task}
              onChange={e => setTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !running && runOrchestrator()}
              disabled={running}
              style={{ flex: 1 }}
            />
            <Button onClick={runOrchestrator} disabled={running || !task.trim()}>
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {running ? 'Ejecutando...' : 'Ejecutar'}
            </Button>
          </div>
        </Card>

        {/* Steps timeline */}
        {steps.length > 0 && (
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>Pasos ejecutados</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map((step, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                  borderRadius: 8, background: 'var(--bg-surface)',
                }}>
                  {step.success
                    ? <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                    : <XCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />}
                  <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{step.tool}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginLeft: 'auto' }}>
                    <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {step.durationMs}ms
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Answer */}
        {answer && (
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--accent-500)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem', color: 'var(--accent-500)' }}>
              Respuesta {traceId && <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>trace: {traceId}</span>}
            </h3>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.9rem' }}>{answer}</div>
          </Card>
        )}

        {/* Event log */}
        {events.length > 0 && (
          <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>Log de eventos</h3>
            <div ref={eventsRef} style={{ maxHeight: 400, overflow: 'auto', fontFamily: 'monospace', fontSize: '0.8rem' }}>
              {events.map((ev, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-default)' }}>
                  <span style={{ color: eventTypeColor(ev.type), fontWeight: 500 }}>{ev.type}</span>
                  {ev.tool && <span style={{ color: 'var(--text-secondary)' }}> → {ev.tool}</span>}
                  {ev.iteration && <span style={{ color: 'var(--text-tertiary)' }}> [iter {ev.iteration}]</span>}
                  {ev.success === false && <span style={{ color: '#ef4444' }}> FAIL</span>}
                  {ev.durationMs && <span style={{ color: 'var(--text-tertiary)' }}> {ev.durationMs}ms</span>}
                  {ev.content && <span style={{ color: 'var(--text-secondary)' }}> &quot;{ev.content.slice(0, 80)}&quot;</span>}
                  {ev.checkpointId && <span style={{ color: 'var(--text-tertiary)' }}> checkpoint: {ev.checkpointId}</span>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
