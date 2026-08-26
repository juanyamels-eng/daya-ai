'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import type { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { Button, Card } from '@/components/ui'
import { WorkflowEditor } from '@/components/workflow/WorkflowEditor'
import { GitBranch, Plus, Play } from 'lucide-react'

interface Workflow {
  id: string
  name: string
  description?: string
  steps: { label?: string; type?: string }[]
  createdAt: number
}

export default function WorkflowsPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Workflow | null>(null)

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated()) loadWorkflows()
  }, [hasHydrated, isAuthenticated])

  async function loadWorkflows() {
    try {
      const res = await api.get('/workflows')
      setWorkflows(res.data.workflows || [])
    } catch {}
    finally { setLoading(false) }
  }

  if (!hasHydrated) return null

  // Editor mode
  if (editing) {
    return (
      <WorkflowEditor
        workflowId={editing.id}
        initialName={editing.name}
        onBack={() => { setEditing(null); loadWorkflows() }}
        onSave={() => { setEditing(null); loadWorkflows() }}
      />
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
              <GitBranch size={24} style={{ color: 'var(--accent-500)' }} />
              Workflows
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              Automatiza flujos de trabajo con nodos visuales
            </p>
          </div>
          <Button onClick={() => setEditing({ id: '', name: 'Nuevo Workflow', steps: [], createdAt: Date.now() })}>
            <Plus size={16} /> Nuevo Workflow
          </Button>
        </div>

        {loading ? (
          <div className="skeleton-grid">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-line skeleton-line--title" />
                <div className="skeleton-line skeleton-line--text" />
                <div className="skeleton-line skeleton-line--text-sm" />
              </div>
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border-default)' }}>
            <GitBranch size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>No hay workflows creados</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 8 }}>
              Crea tu primer workflow para automatizar tareas
            </p>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {workflows.map(wf => (
              <Card key={wf.id} style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }} className="hover-lift">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{wf.name}</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {wf.steps?.length || 0} nodos
                  </span>
                </div>
                {wf.description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 8 }}>{wf.description}</p>
                )}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {wf.steps?.slice(0, 4).map((step, i) => (
                    <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                      {step.label || step.type}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(wf)}>
                    Abrir
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    await api.post('/workflows/run', { workflowId: wf.id })
                  }}>
                    <Play size={14} /> Ejecutar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
