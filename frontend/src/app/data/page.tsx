'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import type { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Badge } from '@/components/ui'
import { Database, Upload, BarChart3, TrendingUp, FileText } from 'lucide-react'

interface DataColumn {
  name: string
  type: string
  sample: string[]
  nullCount: number
  uniqueCount: number
}

interface DataStats {
  rowCount: number
  columnCount: number
  columns: DataColumn[]
  numericSummary: Record<string, unknown>
}

interface ChartConfig {
  type: string
  title: string
  x: { label: string; data: string[] }
  y: { label: string; data: number[] }[]
  colors?: string[]
}

export default function DataPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [stats, setStats] = useState<DataStats | null>(null)
  const [charts, setCharts] = useState<ChartConfig[]>([])
  const [insights, setInsights] = useState<string[]>([])
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setLoading(true)

    try {
      const text = await file.text()
      const res = await api.post('/data/analyze', { csvData: text })
      setStats(res.data.stats)
      setCharts(res.data.charts)
      setInsights(res.data.insights)
      setPreview(res.data.preview)
      toast.success('Datos analizados')
    } catch (err: unknown) {
      const e = err as AxiosError<{ error?: string }>
      toast.error(e.response?.data?.error || 'Error analizando')
    } finally { setLoading(false) }
  }

  if (!hasHydrated) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={24} style={{ color: 'var(--accent-500)' }} />
            AI Data Analyst
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
            Sube CSV/Excel para análisis automático con IA
          </p>
        </div>

        {/* Upload */}
        <Card style={{ padding: '2rem', border: '1px solid var(--border-default)', marginBottom: 20, textAlign: 'center' }}>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
          <Upload size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
            {fileName ? `Analizando: ${fileName}` : 'Arrastra o selecciona un archivo CSV'}
          </p>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={loading}>
            Seleccionar archivo
          </Button>
        </Card>

        {stats && (
          <>
            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <Card style={{ padding: 16, border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Filas</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.rowCount.toLocaleString()}</div>
              </Card>
              <Card style={{ padding: 16, border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Columnas</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.columnCount}</div>
              </Card>
              <Card style={{ padding: 16, border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Numéricas</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.columns.filter(c => c.type === 'number').length}</div>
              </Card>
              <Card style={{ padding: 16, border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Categóricas</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.columns.filter(c => c.type === 'string').length}</div>
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Insights */}
              <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={18} style={{ color: 'var(--green)' }} />
                  Insights
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {insights.map((insight, i) => (
                    <div key={i} style={{
                      padding: '10px 12px', borderRadius: 8, fontSize: 13,
                      background: 'var(--bg-elevated)', color: 'var(--text-secondary)', lineHeight: 1.5,
                    }} dangerouslySetInnerHTML={{ __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>') }} />
                  ))}
                </div>
              </Card>

              {/* Column summary */}
              <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)', maxHeight: 400, overflowY: 'auto' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={18} style={{ color: 'var(--brand)' }} />
                  Columnas
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stats.columns.map(col => (
                    <div key={col.name} style={{
                      padding: '8px 10px', borderRadius: 8, fontSize: 12,
                      background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{col.name}</span>
                        <Badge variant={col.type === 'number' ? 'primary' : 'neutral'} style={{ marginLeft: 6, fontSize: 9 }}>
                          {col.type}
                        </Badge>
                      </div>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {col.uniqueCount} únicos{col.nullCount > 0 ? `, ${col.nullCount} nulos` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Charts */}
            {charts.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BarChart3 size={18} style={{ color: 'var(--brand)' }} />
                  Gráficas sugeridas
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
                  {charts.map((chart, i) => (
                    <Card key={i} style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{chart.title}</h3>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                        {chart.y[0]?.data.slice(0, 12).map((val, j) => {
                          const max = Math.max(...(chart.y[0]?.data || [1]))
                          const h = max > 0 ? (val / max) * 100 : 0
                          return (
                            <div key={j} style={{
                              flex: 1, background: chart.colors?.[0] || 'var(--brand)',
                              height: `${Math.max(4, h)}%`, borderRadius: 4,
                              opacity: 0.7 + (val / max) * 0.3,
                              transition: 'height 0.3s ease',
                            }} title={`${chart.x.data[j]}: ${val}`} />
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {chart.x.data.slice(0, 4).map((label, j) => <span key={j}>{label}</span>)}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Data preview */}
            <Card style={{ border: '1px solid var(--border-default)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', fontWeight: 600, fontSize: 14 }}>
                Vista previa (primeras {preview.length} filas)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {stats.columns.map(col => (
                        <th key={col.name} style={{
                          padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-default)',
                          background: 'var(--bg-elevated)', fontWeight: 600, color: 'var(--text-secondary)',
                          position: 'sticky', top: 0,
                        }}>{col.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {stats.columns.map(col => (
                          <td key={col.name} style={{
                            padding: '6px 12px', borderBottom: '1px solid var(--border-default)',
                            color: 'var(--text-secondary)',
                          }}>{row[col.name] || ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
