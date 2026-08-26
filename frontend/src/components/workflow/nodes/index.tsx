'use client'
import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'

const baseStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: 12,
  padding: '12px 16px',
  minWidth: 160,
  fontFamily: 'var(--font-body)',
  boxShadow: 'var(--shadow-sm)',
}

const iconMap: Record<string, string> = {
  trigger: '⚡',
  ai: '🤖',
  condition: '🔀',
  loop: '🔄',
  http: '🌐',
  output: '📤',
}

export interface WorkflowNodeData {
  label: string
  type: string
  config?: Record<string, unknown>
  [key: string]: unknown
}

function NodeBase({ data, selected }: NodeProps & { data: WorkflowNodeData }) {
  const colors: Record<string, string> = {
    trigger: '#10b981',
    ai: 'var(--brand)',
    condition: '#f59e0b',
    loop: '#06b6d4',
    http: '#3b82f6',
    output: '#8b5cf6',
  }
  const color = colors[data.type] || 'var(--text-tertiary)'

  return (
    <div style={{ ...baseStyle, borderColor: selected ? color : 'var(--border-default)', borderWidth: selected ? 2 : 1 }}>
      {data.type !== 'trigger' && <Handle type="target" position={Position.Top} style={{ background: color, width: 8, height: 8 }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{iconMap[data.type] || '📦'}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{data.label}</div>
          {data.config?.description ? (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{String(data.config.description)}</div>
          ) : null}
        </div>
      </div>
      {data.type !== 'output' && <Handle type="source" position={Position.Bottom} style={{ background: color, width: 8, height: 8 }} />}
    </div>
  )
}

function makeNode(type: string) {
  const NodeComponent = (props: NodeProps) => (
    <NodeBase {...props} data={{ ...props.data, type } as WorkflowNodeData} />
  )
  NodeComponent.displayName = `${type.charAt(0).toUpperCase()}${type.slice(1)}Node`
  return memo(NodeComponent)
}

export const TriggerNode = makeNode('trigger')
export const AiActionNode = makeNode('ai')
export const ConditionNode = makeNode('condition')
export const LoopNode = makeNode('loop')
export const HttpNode = makeNode('http')
export const OutputNode = makeNode('output')

export const nodeTypes = {
  trigger: TriggerNode,
  ai: AiActionNode,
  condition: ConditionNode,
  loop: LoopNode,
  http: HttpNode,
  output: OutputNode,
}
