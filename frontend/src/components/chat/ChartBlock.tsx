'use client'
// Renderiza un bloque ```chart``` del chat como gráfico (Chart.js).
// Esquema JSON esperado:
//   { "type": "bar|line|pie|doughnut", "title"?: "...", "labels": [...], "datasets": [{ "label": "...", "data": [...] }] }
// Si el JSON es inválido, cae al código en texto plano — nunca rompe el chat.
import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import type { ChartType } from 'chart.js'
import { useAuthStore } from '../../store'

// Paleta de marca (violeta) + acompañantes vivos.
const PAL = ['#6d5cff', '#d946ef', '#22d3ee', '#34d399', '#f59e0b', '#f87171', '#8b7cff', '#38bdf8']

type Spec = { type?: string; title?: string; labels?: unknown[]; datasets?: { label?: string; data?: unknown[] }[] }

export default function ChartBlock({ code }: { code: string }) {
  const { theme } = useAuthStore()
  const dark = theme === 'dark'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let spec: Spec
    try {
      spec = JSON.parse(code)
    } catch { setFailed(true); return }

    const rawType = String(spec.type || 'bar').toLowerCase()
    const chartType = (rawType === 'donut' ? 'doughnut' : rawType) as ChartType
    const isPie = chartType === 'pie' || chartType === 'doughnut'
    const labels = Array.isArray(spec.labels) ? spec.labels.map(String) : []
    const dsIn = Array.isArray(spec.datasets) ? spec.datasets : []
    if (!dsIn.length || !dsIn.some(d => Array.isArray(d.data) && d.data.length)) { setFailed(true); return }

    const text = dark ? '#a8a3c4' : '#5a5470'
    const grid = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
    const cardBg = dark ? '#16142e' : '#ffffff'

    const datasets = dsIn.map((d, i) => {
      const data = (Array.isArray(d.data) ? d.data : []).map(Number)
      if (isPie) {
        return { label: d.label || '', data, backgroundColor: data.map((_, j) => PAL[j % PAL.length]), borderColor: cardBg, borderWidth: 2 }
      }
      const c = PAL[i % PAL.length]
      return {
        label: d.label || `Serie ${i + 1}`, data,
        backgroundColor: chartType === 'line' ? c + '22' : c,
        borderColor: c, borderWidth: 2, borderRadius: chartType === 'bar' ? 6 : 0,
        tension: 0.35, fill: chartType === 'line' ? false : undefined, pointRadius: 3, pointBackgroundColor: c,
      }
    })

    let chart: Chart
    try {
      chart = new Chart(canvas, {
        type: chartType,
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 600 },
          plugins: {
            legend: { display: datasets.length > 1 || isPie, labels: { color: text, font: { size: 12 } } },
            title: spec.title ? { display: true, text: String(spec.title), color: dark ? '#f1eff8' : '#16131f', font: { size: 14, weight: 600 } } : { display: false },
          },
          scales: isPie ? undefined : {
            x: { grid: { color: grid }, ticks: { color: text }, border: { color: grid } },
            y: { grid: { color: grid }, ticks: { color: text }, border: { color: grid }, beginAtZero: true },
          },
        },
      })
    } catch { setFailed(true); return }

    return () => { chart.destroy() }
  }, [code, dark])

  if (failed) {
    return (
      <pre style={{
        margin: '12px 0', padding: '12px 14px', borderRadius: 10, overflowX: 'auto',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.55,
      }}>{code}</pre>
    )
  }

  return (
    <div style={{
      margin: '14px 0', padding: '16px 14px 12px', borderRadius: 12,
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      height: 300, position: 'relative', animation: 'dayaRise 0.25s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <canvas ref={canvasRef} />
    </div>
  )
}
