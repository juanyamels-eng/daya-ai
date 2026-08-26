'use client'
import { GripVertical } from 'lucide-react'

const NODE_CATEGORIES = [
  {
    name: 'Trigger',
    nodes: [
      { type: 'trigger', label: 'Inicio', icon: '⚡', description: 'Inicia el workflow' },
    ],
  },
  {
    name: 'Acciones',
    nodes: [
      { type: 'ai', label: 'Acción IA', icon: '🤖', description: 'Procesar con IA' },
      { type: 'http', label: 'HTTP Request', icon: '🌐', description: 'Llamar API externa' },
      { type: 'loop', label: 'Iterar', icon: '🔄', description: 'Repetir sobre items' },
    ],
  },
  {
    name: 'Control',
    nodes: [
      { type: 'condition', label: 'Condición', icon: '🔀', description: 'Si/Entonces' },
    ],
  },
  {
    name: 'Salida',
    nodes: [
      { type: 'output', label: 'Resultado', icon: '📤', description: 'Output final' },
    ],
  },
]

interface NodeSidebarProps {
  onAddNode: (type: string, label: string) => void
}

export function NodeSidebar({ onAddNode }: NodeSidebarProps) {
  return (
    <div style={{
      width: 220, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-default)',
      padding: 16, overflowY: 'auto', height: '100%',
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Nodos
      </h3>
      {NODE_CATEGORIES.map(cat => (
        <div key={cat.name} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>{cat.name}</div>
          {cat.nodes.map(node => (
            <button
              key={node.type}
              onClick={() => onAddNode(node.type, node.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)',
                background: 'var(--bg-base)', color: 'var(--text-primary)',
                cursor: 'grab', marginBottom: 4, textAlign: 'left', fontSize: 13,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-glow)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <GripVertical size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              <span>{node.icon}</span>
              <span style={{ fontWeight: 500 }}>{node.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
