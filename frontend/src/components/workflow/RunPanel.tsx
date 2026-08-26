'use client'
import { Button, Spinner } from '@/components/ui'
import { Play, CheckCircle, XCircle, Clock } from 'lucide-react'

interface RunLog {
  nodeId: string
  nodeName: string
  status: 'pending' | 'running' | 'completed' | 'error'
  output?: string
  duration?: number
}

interface RunPanelProps {
  isRunning: boolean
  logs: RunLog[]
  onRun: () => void
}

export function RunPanel({ isRunning, logs, onRun }: RunPanelProps) {
  return (
    <div style={{
      width: 300, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Ejecución</h3>
        <Button size="sm" onClick={onRun} disabled={isRunning} loading={isRunning}>
          <Play size={14} /> Ejecutar
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {isRunning ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Spinner size={20} />
                <p>Ejecutando workflow...</p>
              </div>
            ) : (
              <p>Presiona Ejecutar para probar el workflow</p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 8, fontSize: 12,
                background: 'var(--bg-base)', border: '1px solid var(--border-default)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: log.output ? 4 : 0 }}>
                  {log.status === 'completed' && <CheckCircle size={12} style={{ color: 'var(--green)' }} />}
                  {log.status === 'error' && <XCircle size={12} style={{ color: 'var(--red)' }} />}
                  {log.status === 'running' && <Spinner size={12} />}
                  {log.status === 'pending' && <Clock size={12} style={{ color: 'var(--text-tertiary)' }} />}
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{log.nodeName}</span>
                  {log.duration && (
                    <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: 11 }}>{log.duration}ms</span>
                  )}
                </div>
                {log.output && (
                  <p style={{ color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {log.output.length > 100 ? log.output.slice(0, 100) + '...' : log.output}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
