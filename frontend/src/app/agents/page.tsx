'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { Rocket, Store } from 'lucide-react'

interface Agent {
  id: string
  name: string
  description: string
  model: string
  tools: string[]
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

interface AgentTemplate {
  id: string
  name: string
  description: string
  systemPrompt: string
  tools: string[]
  model: string
}

interface Tool {
  id: string
  name: string
  description: string
  category: string
}

export default function AgentsPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const [agents, setAgents] = useState<Agent[]>([])
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [availableTools, setAvailableTools] = useState<Tool[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    description: '',
    systemPrompt: '',
    model: 'claude-3-5-sonnet',
    tools: [] as string[],
  })

  // Guard: sin sesión, a login (antes la página se quedaba cargando para siempre)
  useEffect(() => {
    if (hasHydrated && !token) router.push('/auth/login')
  }, [hasHydrated, token, router])

  useEffect(() => {
    if (!token) return
    Promise.all([
      fetch('/api/agent-builder', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/agent-builder/meta/templates', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/agent-builder/meta/tools', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([agentsData, templatesData, toolsData]) => {
      setAgents(agentsData.agents || [])
      setTemplates(templatesData.templates || [])
      setAvailableTools(toolsData.tools || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [token])

  const createAgent = async () => {
    const res = await fetch('/api/agent-builder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (data.agent) {
      setAgents([data.agent, ...agents])
      setShowCreate(false)
      setForm({ name: '', description: '', systemPrompt: '', model: 'claude-3-5-sonnet', tools: [] })
    }
  }

  const deleteAgent = async (id: string) => {
    await fetch(`/api/agent-builder/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setAgents(agents.filter(a => a.id !== id))
  }

  const publishAgent = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agent-builder/${agentId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priceCents: 0, category: 'ai', tags: ['agent'] }),
      })
      const data = await res.json()
      if (data.item) {
        setAgents(agents.map(a => a.id === agentId ? { ...a, isPublished: true } : a))
        alert(`Agente publicado en marketplace: ${data.slug}`)
      }
    } catch (e: unknown) {
      alert('Error publicando: ' + (e instanceof Error && e.message ? e.message : ''))
    }
  }

  const applyTemplate = (template: AgentTemplate) => {
    setForm({
      name: template.name,
      description: template.description,
      systemPrompt: template.systemPrompt,
      model: template.model,
      tools: template.tools,
    })
    setShowCreate(true)
  }

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div className="skeleton-line skeleton-line--title" style={{ width: 180, height: 24 }} />
            <div className="skeleton-line skeleton-line--text-sm" style={{ width: 240, marginTop: 8 }} />
          </div>
          <div className="skeleton-line" style={{ width: 120, height: 36, borderRadius: 10 }} />
        </div>
        <div className="skeleton-grid" style={{ marginBottom: 32 }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-line skeleton-line--title" />
              <div className="skeleton-line skeleton-line--text" />
              <div className="skeleton-line skeleton-line--text-sm" />
            </div>
          ))}
        </div>
        <div className="skeleton-grid">
          {[1,2,3].map(i => (
            <div key={i} className="skeleton-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="skeleton-line" style={{ width: '50%', height: 16 }} />
                <div className="skeleton-line" style={{ width: 60, height: 20, borderRadius: 20 }} />
              </div>
              <div className="skeleton-line skeleton-line--text" />
              <div className="skeleton-line skeleton-line--text-sm" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">AI Agent Builder</h1>
          <p className="text-muted-foreground">Crea agentes personalizados sin código</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Nuevo Agente</Button>
      </div>

      {/* Templates */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => applyTemplate(t)}>
              <CardContent className="p-4">
                <h3 className="font-medium">{t.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {t.tools.map(tool => (
                    <Badge key={tool} variant="outline" className="text-xs">{tool}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* My Agents */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Mis Agentes ({agents.length})</h2>
        {agents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No tienes agentes creados. Crea uno nuevo o usa un template.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <Card key={agent.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <Badge variant={agent.isPublished ? 'success' : 'neutral'}>
                      {agent.isPublished ? 'Publicado' : 'Borrador'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{agent.description || 'Sin descripción'}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <span>Modelo: {agent.model}</span>
                    <span>•</span>
                    <span>Herramientas: {agent.tools.length}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => router.push(`/agents/${agent.id}`)}>
                      Abrir
                    </Button>
                    {!agent.isPublished ? (
                      <Button size="sm" variant="secondary" onClick={() => publishAgent(agent.id)}>
                        <Rocket size={14} /> Publicar
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => router.push('/marketplace')}>
                        <Store size={14} /> Marketplace
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => deleteAgent(agent.id)}>
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Crear Agente</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nombre</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Mi Agente"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descripción</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Un agente que hace X"
                />
              </div>
              <div>
                <label className="text-sm font-medium">System Prompt</label>
                <textarea
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm min-h-[120px]"
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  placeholder="Eres un experto en..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Modelo</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                >
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="deepseek-chat">DeepSeek Chat</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Herramientas</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {availableTools.map((tool) => (
                    <label key={tool.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.tools.includes(tool.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, tools: [...form.tools, tool.id] })
                          } else {
                            setForm({ ...form, tools: form.tools.filter(t => t !== tool.id) })
                          }
                        }}
                        className="rounded"
                      />
                      <span>{tool.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button onClick={createAgent} disabled={!form.name || !form.systemPrompt}>Crear Agente</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
