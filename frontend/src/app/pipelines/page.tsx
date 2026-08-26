'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import type { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input } from '@/components/ui'
import { GitBranch, Plus, Play, Trash2, ArrowRight, Loader2 } from 'lucide-react'

interface Agent {
  id: string
  name: string
  description: string
  model: string
}

interface PipelineStep {
  agentId: string
  instruction?: string
}

interface Pipeline {
  id: string
  name: string
  description: string
  steps: PipelineStep[]
  createdAt: string
}

interface StepResult {
  step: number
  agentId: string
  output: string
  model: string
  duration: number
}

export default function PipelinesPage() {
  const router = useRouter()
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const toast = useToast()

  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<{ pipelineId: string; result: string; steps: StepResult[]; totalDuration: number } | null>(null)
  const [runInput, setRunInput] = useState('')
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    description: '',
    steps: [{ agentId: '', instruction: '' }] as PipelineStep[],
  })

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated()) { router.push('/auth/login'); return }
    loadData()
  }, [hasHydrated])

  async function loadData() {
    try {
      setLoading(true)
      const [pipelinesRes, agentsRes] = await Promise.all([
        api.get('/agent-composition/pipelines'),
        api.get('/agent-builder'),
      ])
      setPipelines(pipelinesRes.data.pipelines || [])
      setAgents(agentsRes.data.agents || [])
    } catch {
      toast.error('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }

  async function createPipeline() {
    if (form.steps.length < 2) { toast.error('Necesitas al menos 2 agentes'); return }
    if (form.steps.some(s => !s.agentId)) { toast.error('Todos los steps deben tener un agente'); return }

    try {
      const res = await api.post('/agent-composition/pipelines', form)
      setPipelines([res.data.pipeline, ...pipelines])
      setShowCreate(false)
      setForm({ name: '', description: '', steps: [{ agentId: '', instruction: '' }] })
      toast.success('Pipeline creado')
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error creando pipeline')
    }
  }

  async function deletePipeline(id: string) {
    try {
      await api.delete(`/agent-composition/pipelines/${id}`)
      setPipelines(pipelines.filter(p => p.id !== id))
      toast.success('Pipeline eliminado')
    } catch {
      toast.error('Error eliminando')
    }
  }

  async function runPipeline(pipelineId: string) {
    if (!runInput.trim()) { toast.error('Escribe un input para el pipeline'); return }

    setRunning(pipelineId)
    setResults(null)
    try {
      const res = await api.post(`/agent-composition/pipelines/${pipelineId}/run`, { input: runInput })
      setResults({ pipelineId, ...res.data })
      toast.success(`Pipeline completado en ${(res.data.totalDuration / 1000).toFixed(1)}s`)
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error ejecutando pipeline')
    } finally {
      setRunning(null)
    }
  }

  const getAgentName = (id: string) => agents.find(a => a.id === id)?.name || id.slice(0, 8)

  if (!hasHydrated || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><p style={{ color: 'var(--text-tertiary)' }}>Cargando...</p></div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
              <GitBranch size={24} style={{ color: 'var(--accent-500)' }} />
              Agent Pipelines
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              Encadena agentes para automatizar flujos complejos
            </p>
          </div>
          <Button onClick={() => { setShowCreate(true); setForm({ name: '', description: '', steps: [{ agentId: '', instruction: '' }] }) }}>
            <Plus size={16} /> Nuevo Pipeline
          </Button>
        </div>

        {/* Pipelines List */}
        <div style={{ display: 'grid', gap: 16, marginBottom: '2rem' }}>
          {pipelines.length === 0 ? (
            <Card style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
              <GitBranch size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
              <p style={{ color: 'var(--text-secondary)' }}>No tienes pipelines creados</p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 8 }}>
                Crea un pipeline para encadenar agentes y automatizar flujos de trabajo
              </p>
            </Card>
          ) : (
            pipelines.map(pipeline => (
              <Card key={pipeline.id} style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>{pipeline.name}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>{pipeline.description || 'Sin descripción'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="danger" onClick={() => deletePipeline(pipeline.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {/* Pipeline Steps Visualization */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--bg-elevated)' }}>
                  {pipeline.steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', fontSize: '0.8rem', fontWeight: 500 }}>
                        {getAgentName(step.agentId)}
                      </div>
                      {i < pipeline.steps.length - 1 && (
                        <ArrowRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Run Pipeline */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    placeholder="Input para el pipeline..."
                    value={selectedPipeline === pipeline.id ? runInput : ''}
                    onChange={e => { setRunInput(e.target.value); setSelectedPipeline(pipeline.id) }}
                    onKeyDown={e => e.key === 'Enter' && runPipeline(pipeline.id)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    onClick={() => runPipeline(pipeline.id)}
                    disabled={running === pipeline.id}
                  >
                    {running === pipeline.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    {running === pipeline.id ? 'Ejecutando...' : 'Ejecutar'}
                  </Button>
                </div>

                {/* Results */}
                {results && results.pipelineId === pipeline.id && (
                  <div style={{ marginTop: 16, padding: '16px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h4 style={{ fontWeight: 600, fontSize: '0.85rem' }}>Resultado</h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {(results.totalDuration / 1000).toFixed(1)}s · {results.steps.length} steps
                      </span>
                    </div>
                    {results.steps.map(step => (
                      <div key={step.step} style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                            Step {step.step}: {getAgentName(step.agentId)}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                            {step.model} · {(step.duration / 1000).toFixed(1)}s
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {step.output.slice(0, 500)}{step.output.length > 500 ? '...' : ''}
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: '12px', borderRadius: 6, background: 'var(--accent-500)', color: 'white', marginTop: 8 }}>
                      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, opacity: 0.8 }}>Output Final</div>
                      <div style={{ fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {results.result.slice(0, 1000)}{results.result.length > 1000 ? '...' : ''}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
            <Card style={{ width: '100%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto', padding: '1.5rem', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontWeight: 600 }}>Crear Pipeline</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>✕</Button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Nombre</label>
                  <Input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Mi Pipeline de Investigación"
                    style={{ marginTop: 4 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Descripción</label>
                  <Input
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Un pipeline que investiga y genera reportes"
                    style={{ marginTop: 4 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: 8, display: 'block' }}>Pasos del Pipeline</label>
                  {form.steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', minWidth: 20 }}>{i + 1}.</span>
                      <select
                        value={step.agentId}
                        onChange={e => {
                          const newSteps = [...form.steps]
                          newSteps[i] = { ...newSteps[i], agentId: e.target.value }
                          setForm({ ...form, steps: newSteps })
                        }}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      >
                        <option value="">Seleccionar agente...</option>
                        {agents.map(a => (
                          <option key={a.id} value={a.id}>{a.name} ({a.model})</option>
                        ))}
                      </select>
                      <Input
                        value={step.instruction || ''}
                        onChange={e => {
                          const newSteps = [...form.steps]
                          newSteps[i] = { ...newSteps[i], instruction: e.target.value }
                          setForm({ ...form, steps: newSteps })
                        }}
                        placeholder="Instrucción adicional (opcional)"
                        style={{ flex: 1 }}
                      />
                      {form.steps.length > 2 && (
                        <Button variant="ghost" size="sm" onClick={() => {
                          setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })
                        }}>✕</Button>
                      )}
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" onClick={() => setForm({ ...form, steps: [...form.steps, { agentId: '', instruction: '' }] })}>
                    <Plus size={14} /> Agregar paso
                  </Button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
                  <Button onClick={createPipeline} disabled={!form.name || form.steps.length < 2}>
                    Crear Pipeline
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
