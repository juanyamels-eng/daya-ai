'use client'
import React from 'react'

interface Props {
  children: React.ReactNode
  label?: string
}
interface State { hasError: boolean }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ':' + this.props.label : ''}]`, error.message, info.componentStack?.split('\n')[1]?.trim())
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: 200, padding: 32, gap: 16, textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem' }}>⚡</div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Algo salió mal
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', maxWidth: 320 }}>
          Este componente encontró un error inesperado. No afecta al resto de la app.
        </div>
        <button
          onClick={() => this.setState({ hasError: false })}
          style={{
            padding: '8px 20px', borderRadius: 9, background: 'var(--text-primary)',
            color: 'var(--bg-base)', border: 'none', cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--font-body)',
          }}>
          Reintentar
        </button>
      </div>
    )
  }
}
