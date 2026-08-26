'use client'
import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import type { AxiosError } from 'axios'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input } from '@/components/ui'
import { ReactFlow, addEdge, useNodesState, useEdgesState, Controls, Background, Handle, Position, ReactFlowProvider, ReactFlowInstance, NodeProps, type Node, type Edge, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Play, Save, Plus, ArrowLeft, Zap, MessageSquare, Globe, Database, Clock, GitBranch, Filter, Code } from 'lucide-react'

// Node Types
function TriggerNode({ data }: NodeProps) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', minWidth: 140, textAlign: 'center', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
      <Handle type="source" position={Position.Bottom} style={{ background: '#fff', width: 10, height: 10 }} />
      <div style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: 4 }}>TRIGGER</div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{data.label as string}</div>
    </div>
  )
}

function ActionNode({ data }: NodeProps) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff', minWidth: 140, textAlign: 'center', boxShadow: '0 4px 12px rgba(139,92,246,0.3)' }}>
      <Handle type="target" position={Position.Top} style={{ background: '#fff', width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#fff', width: 10, height: 10 }} />
      <div style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: 4 }}>ACTION</div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{data.label as string}</div>
    </div>
  )
}

function ConditionNode({ data }: NodeProps) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', minWidth: 140, textAlign: 'center', boxShadow: '0 4px 12px rgba(245,158,11,0.3)', transform: 'rotate(0deg)' }}>
      <Handle type="target" position={Position.Top} style={{ background: '#fff', width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} id="yes" style={{ background: '#10b981', width: 10, height: 10, left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="no" style={{ background: '#ef4444', width: 10, height: 10, left: '70%' }} />
      <div style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: 4 }}>CONDITION</div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{data.label as string}</div>
    </div>
  )
}

function AINode({ data }: NodeProps) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', minWidth: 140, textAlign: 'center', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
      <Handle type="target" position={Position.Top} style={{ background: '#fff', width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#fff', width: 10, height: 10 }} />
      <div style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: 4 }}>AI</div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{data.label as string}</div>
    </div>
  )
}

function OutputNode({ data }: NodeProps) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', minWidth: 140, textAlign: 'center', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}>
      <Handle type="target" position={Position.Top} style={{ background: '#fff', width: 10, height: 10 }} />
      <div style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: 4 }}>OUTPUT</div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{data.label as string}</div>
    </div>
  )
}

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  ai: AINode,
  output: OutputNode,
}

interface FlowTemplate {
  id: string
  name: string
  description: string
  icon: string
  nodes: Node[]
  edges: Edge[]
}

const TEMPLATES: FlowTemplate[] = [
  {
    id: 'email-summarize',
    name: 'Resumir emails',
    description: 'Cuando llega un email, la IA lo resume y crea una nota',
    icon: '📧',
    nodes: [
      { id: '1', type: 'trigger', position: { x: 300, y: 0 }, data: { label: 'Email recibido' } },
      { id: '2', type: 'ai', position: { x: 300, y: 150 }, data: { label: 'Resumir con IA' } },
      { id: '3', type: 'action', position: { x: 300, y: 300 }, data: { label: 'Crear nota' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
    ],
  },
  {
    id: 'web-monitor',
    name: 'Monitorear web',
    description: 'Detecta cambios en una página web y notifica',
    icon: '🌐',
    nodes: [
      { id: '1', type: 'trigger', position: { x: 300, y: 0 }, data: { label: 'Cada 1 hora' } },
      { id: '2', type: 'action', position: { x: 300, y: 150 }, data: { label: 'Scrapear URL' } },
      { id: '3', type: 'condition', position: { x: 300, y: 300 }, data: { label: '¿Cambio detectado?' } },
      { id: '4', type: 'action', position: { x: 150, y: 450 }, data: { label: 'Enviar notificación' } },
      { id: '5', type: 'action', position: { x: 450, y: 450 }, data: { label: 'No hacer nada' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4', sourceHandle: 'yes', label: 'Sí' },
      { id: 'e3-5', source: '3', target: '5', sourceHandle: 'no', label: 'No' },
    ],
  },
  {
    id: 'research-report',
    name: 'Investigación profunda',
    description: 'Investiga un tema y genera un reporte completo',
    icon: '🔬',
    nodes: [
      { id: '1', type: 'trigger', position: { x: 300, y: 0 }, data: { label: 'Ejecutar manual' } },
      { id: '2', type: 'ai', position: { x: 300, y: 150 }, data: { label: 'Planificar investigación' } },
      { id: '3', type: 'action', position: { x: 300, y: 300 }, data: { label: 'Buscar fuentes' } },
      { id: '4', type: 'ai', position: { x: 300, y: 450 }, data: { label: 'Generar reporte' } },
      { id: '5', type: 'output', position: { x: 300, y: 600 }, data: { label: 'Exportar PDF' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4' },
      { id: 'e4-5', source: '4', target: '5' },
    ],
  },
]

function FlowEditor() {
  const { hasHydrated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])
  const [flowName, setFlowName] = useState('Mi Workflow')
  const [flowId, setFlowId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState('')
  const [showTemplates, setShowTemplates] = useState(true)

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } }, eds))
  }, [setEdges])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/reactflow-type')
    const label = event.dataTransfer.getData('application/reactflow-label')
    if (!type || !reactFlowInstance || !reactFlowWrapper.current) return

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    const newNode = { id: `node-${Date.now()}`, type, position, data: { label } }
    setNodes((nds) => nds.concat(newNode))
  }, [reactFlowInstance, setNodes])

  function loadTemplate(template: FlowTemplate) {
    setNodes(template.nodes.map(n => ({ ...n })))
    setEdges(template.edges.map(e => ({ ...e, animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } })))
    setShowTemplates(false)
  }

  async function saveFlow() {
    try {
      const flowData = { name: flowName, nodes, edges }
      if (flowId) {
        await api.put(`/workflows/${flowId}`, flowData)
      } else {
        const res = await api.post('/workflows', flowData)
        setFlowId(res.data.id)
      }
      toast.success('Workflow guardado')
    } catch { toast.error('Error guardando') }
  }

  async function runFlow() {
    if (nodes.length === 0) return toast.error('Agrega nodos al workflow')
    setRunning(true)
    setResult('')
    try {
      const res = await api.post('/workflows/run', {
        id: flowId,
        nodes,
        edges,
        input: {},
      })
      setResult(JSON.stringify(res.data, null, 2))
      toast.success('Workflow ejecutado')
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: string }>
      toast.error(err.response?.data?.error || 'Error ejecutando')
    } finally { setRunning(false) }
  }

  if (!hasHydrated) return null

  const nodePalette = [
    { type: 'trigger', label: 'Schedule', icon: <Clock size={14} />, color: '#3b82f6' },
    { type: 'trigger', label: 'Webhook', icon: <Globe size={14} />, color: '#3b82f6' },
    { type: 'action', label: 'HTTP Request', icon: <Globe size={14} />, color: '#8b5cf6' },
    { type: 'action', label: 'Send Email', icon: <MessageSquare size={14} />, color: '#8b5cf6' },
    { type: 'action', label: 'Save to DB', icon: <Database size={14} />, color: '#8b5cf6' },
    { type: 'condition', label: 'If/Else', icon: <GitBranch size={14} />, color: '#f59e0b' },
    { type: 'ai', label: 'AI Generate', icon: <Zap size={14} />, color: '#10b981' },
    { type: 'ai', label: 'AI Classify', icon: <Filter size={14} />, color: '#10b981' },
    { type: 'output', label: 'Notify', icon: <MessageSquare size={14} />, color: '#ef4444' },
    { type: 'output', label: 'Run Code', icon: <Code size={14} />, color: '#ef4444' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
        <Button variant="ghost" size="sm" onClick={() => router.push('/automations')}>
          <ArrowLeft size={16} />
        </Button>
        <Input value={flowName} onChange={e => setFlowName(e.target.value)}
          style={{ width: 200, fontSize: '0.9rem', fontWeight: 600, border: 'none', background: 'transparent' }} />
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => setShowTemplates(true)}>Templates</Button>
        <Button variant="ghost" size="sm" onClick={saveFlow}><Save size={16} /> Guardar</Button>
        <Button size="sm" onClick={runFlow} disabled={running}>
          <Play size={16} /> {running ? 'Ejecutando...' : 'Ejecutar'}
        </Button>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        {/* Node Palette */}
        <div style={{ width: 200, borderRight: '1px solid var(--border-default)', padding: 12, overflowY: 'auto', background: 'var(--bg-surface)' }}>
          <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>Nodos</h4>
          {nodePalette.map((item, i) => (
            <div key={i}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/reactflow-type', item.type)
                e.dataTransfer.setData('application/reactflow-label', item.label)
                e.dataTransfer.effectAllowed = 'move'
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 4, borderRadius: 8, cursor: 'grab', background: 'var(--bg-base)', border: '1px solid var(--border-default)', fontSize: '0.8rem' }}
            >
              <div style={{ color: item.color }}>{item.icon}</div>
              {item.label}
            </div>
          ))}
        </div>

        {/* Flow Canvas */}
        <div style={{ flex: 1 }} ref={reactFlowWrapper}>
          {showTemplates ? (
            <div style={{ padding: '3rem', maxWidth: 800, margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>Empezar con un template</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>O arrastra nodos desde la izquierda para crear desde cero</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
                {TEMPLATES.map(t => (
                  <Card key={t.id} style={{ padding: '1.5rem', border: '1px solid var(--border-default)', cursor: 'pointer' }}
                    onClick={() => loadTemplate(t)}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{t.icon}</div>
                    <h3 style={{ fontWeight: 600, marginBottom: 4 }}>{t.name}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t.description}</p>
                  </Card>
                ))}
                <Card style={{ padding: '1.5rem', border: '2px dashed var(--border-default)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}
                  onClick={() => setShowTemplates(false)}>
                  <Plus size={24} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Crear desde cero</span>
                </Card>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              fitView
              style={{ background: '#0f0f1a' }}
              defaultEdgeOptions={{ animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } }}
            >
              <Controls />
              <Background color="#333" gap={20} />
            </ReactFlow>
          )}
        </div>

        {/* Result Panel */}
        {result && (
          <div style={{ width: 300, borderLeft: '1px solid var(--border-default)', padding: 12, overflowY: 'auto', background: 'var(--bg-surface)' }}>
            <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>Resultado</h4>
            <pre style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FlowsPage() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  )
}
