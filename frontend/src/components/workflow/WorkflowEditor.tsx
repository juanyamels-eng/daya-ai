'use client'
import { useCallback, useState } from 'react'
import {
  ReactFlow, Controls, Background, BackgroundVariant,
  addEdge, useNodesState, useEdgesState, Connection, Node, Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes'
import { NodeSidebar } from './NodeSidebar'
import { RunPanel } from './RunPanel'
import { Button } from '@/components/ui'
import { Save, ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

let nodeId = 0
const getId = () => `node_${++nodeId}`

interface RunLog {
  nodeId: string
  nodeName: string
  status: 'pending' | 'running' | 'completed' | 'error'
  output?: string
  duration?: number
}

interface WorkflowEditorProps {
  workflowId?: string
  initialName?: string
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onSave?: () => void
  onBack?: () => void
}

export function WorkflowEditor({
  initialName, initialNodes = [], initialEdges = [], onSave, onBack,
}: WorkflowEditorProps) {
  const toast = useToast()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [name, setName] = useState(initialName || 'Nuevo Workflow')
  const [isRunning, setIsRunning] = useState(false)
  const [runLogs, setRunLogs] = useState<RunLog[]>([])
  const [showRun, setShowRun] = useState(false)

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: 'var(--brand)' } }, eds))
  }, [setEdges])

  const addNode = useCallback((type: string, label: string) => {
    const id = getId()
    const newNode: Node = {
      id,
      type,
      position: { x: 250 + Math.random() * 100, y: 100 + nodes.length * 100 },
      data: { label, config: {} },
    }
    setNodes(nds => [...nds, newNode])
  }, [nodes.length, setNodes])

  const saveWorkflow = async () => {
    try {
      const workflow = {
        name,
        steps: nodes.map(n => ({ type: n.type, label: n.data.label, config: n.data.config })),
        nodes,
        edges,
      }
      await api.post('/workflows', workflow)
      toast.success('Workflow guardado')
      onSave?.()
    } catch {
      toast.error('Error guardando')
    }
  }

  const runWorkflow = async () => {
    setIsRunning(true)
    setShowRun(true)
    setRunLogs([])

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      setRunLogs(prev => [...prev, { nodeId: node.id, nodeName: String(node.data.label), status: 'running' }])
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200))
      setRunLogs(prev => prev.map((l, idx) => idx === i ? { ...l, status: 'completed', output: `Resultado de ${node.data.label}`, duration: Math.round(800 + Math.random() * 1200) } : l))
    }
    setIsRunning(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)' }}>
      <NodeSidebar onAddNode={addNode} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)',
        }}>
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={14} />
            </Button>
          )}
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              background: 'transparent', border: 'none', fontSize: 15, fontWeight: 600,
              color: 'var(--text-primary)', outline: 'none', flex: 1,
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => { setShowRun(true); runWorkflow() }} loading={isRunning}>
            ▶ Ejecutar
          </Button>
          <Button size="sm" onClick={saveWorkflow}>
            <Save size={14} /> Guardar
          </Button>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            style={{ background: 'var(--bg-base)' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border-default)" />
            <Controls style={{ borderRadius: 8, border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }} />
          </ReactFlow>
        </div>
      </div>

      {showRun && (
        <RunPanel isRunning={isRunning} logs={runLogs} onRun={runWorkflow} />
      )}
    </div>
  )
}
