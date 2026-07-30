'use client'
import React from 'react'
import { cn } from '../../lib/cn'

const SKELETON_STYLES = `
.daya-skeleton { background: var(--bg-elevated); border-radius: 8px;
  animation: dayaShimmer 1.8s ease-in-out infinite; }
@keyframes dayaShimmer {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}
`

let injected = false

function useStyles() {
  React.useEffect(() => {
    if (injected || typeof document === 'undefined') return
    const el = document.createElement('style')
    el.setAttribute('data-daya-skeleton', 'true')
    el.textContent = SKELETON_STYLES
    document.head.appendChild(el)
    injected = true
  }, [])
}

export function Skeleton({ className, style, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  useStyles()
  return <div className={cn('daya-skeleton', className)} style={style} {...p} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} style={{
          height: 14,
          width: i === lines - 1 ? '55%' : '100%',
          borderRadius: 4,
        }} />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('daya-card', className)} style={{ padding: 20 }}>
      <Skeleton style={{ width: '40%', height: 18, marginBottom: 12, borderRadius: 4 }} />
      <SkeletonText lines={2} />
    </div>
  )
}

export function SkeletonAvatar({ size = 36 }: { size?: number }) {
  return <Skeleton style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }} />
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <SkeletonAvatar size={32} />
      <div style={{ flex: 1 }}>
        <Skeleton style={{ width: '35%', height: 14, marginBottom: 6, borderRadius: 4 }} />
        <Skeleton style={{ width: '60%', height: 11, borderRadius: 4 }} />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', gap: 16, padding: '12px 16px', borderBottom: '1px solid var(--border-default)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} style={{ flex: i === 0 ? 2 : 1, height: 14, borderRadius: 4 }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border-default)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} style={{ flex: c === 0 ? 2 : 1, height: 12, borderRadius: 4, opacity: 1 - r * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  )
}
