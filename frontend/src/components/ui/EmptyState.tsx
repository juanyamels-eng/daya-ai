'use client'
import React from 'react'

const ILLUSTRATIONS = {
  default: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <rect x="16" y="20" width="48" height="40" rx="6" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
      <path d="M28 36h24M28 44h16M28 52h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
      <circle cx="56" cy="56" r="14" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.2" />
      <path d="M62 62l8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.2" />
    </svg>
  ),
  search: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="16" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.2" />
      <path d="M44 44l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.2" />
      <path d="M16 56l8 8M56 16l8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.12" strokeDasharray="3 3" />
    </svg>
  ),
  chat: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="M40 14c13 0 24 9 24 22s-11 22-24 22c-4 0-8-1-11-3l-11 3 3-10c-2-3-3-7-3-12 0-13 11-22 22-22z" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.2" />
      <circle cx="32" cy="36" r="2" fill="currentColor" opacity="0.25" />
      <circle cx="40" cy="36" r="2" fill="currentColor" opacity="0.25" />
      <circle cx="48" cy="36" r="2" fill="currentColor" opacity="0.25" />
    </svg>
  ),
  calendar: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <rect x="14" y="18" width="52" height="48" rx="6" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.2" />
      <path d="M14 30h52" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M26 12v8M54 12v8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.2" />
      <circle cx="32" cy="44" r="3" fill="currentColor" opacity="0.15" />
      <circle cx="48" cy="44" r="3" fill="currentColor" opacity="0.15" />
      <circle cx="40" cy="56" r="3" fill="currentColor" opacity="0.15" />
    </svg>
  ),
  code: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <rect x="14" y="14" width="52" height="36" rx="6" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.2" />
      <path d="M22 24l6 6-6 6M34 38h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.2" />
      <path d="M28 60l24-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.12" />
      <circle cx="28" cy="62" r="6" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.15" />
    </svg>
  ),
}

export interface EmptyStateProps {
  icon?: keyof typeof ILLUSTRATIONS
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon = 'default', title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '48px 24px', color: 'var(--text-tertiary)',
    }}>
      <div style={{ marginBottom: 16, opacity: 0.6 }}>
        {ILLUSTRATIONS[icon]}
      </div>
      <h3 style={{
        margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-secondary)',
        lineHeight: 1.3,
      }}>{title}</h3>
      {description && (
        <p style={{
          margin: '6px 0 0', fontSize: '0.85rem', lineHeight: 1.6, maxWidth: 340,
          color: 'var(--text-tertiary)',
        }}>{description}</p>
      )}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  )
}
