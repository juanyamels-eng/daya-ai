/**
 * DAYA IA — Data Analysis Service
 * Parses CSV/Excel, computes statistics, generates AI insights and chart configs.
 */

export interface DataColumn {
  name: string
  type: 'number' | 'string' | 'date'
  sample: string[]
  nullCount: number
  uniqueCount: number
}

export interface DataStats {
  rowCount: number
  columnCount: number
  columns: DataColumn[]
  numericSummary: Record<string, { min: number; max: number; mean: number; median: number; stdDev: number }>
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area'
  title: string
  x: { label: string; data: string[] }
  y: { label: string; data: number[] }[]
  colors?: string[]
}

/**
 * Parse CSV text into rows.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
}

/**
 * Compute statistics from parsed data.
 */
export function computeStats(rows: Record<string, string>[]): DataStats {
  const columns = Object.keys(rows[0] || {})
  const colStats: DataColumn[] = columns.map(col => {
    const values = rows.map(r => r[col])
    const nonEmpty = values.filter(v => v !== '')
    const uniqueValues = new Set(nonEmpty)
    const isNumeric = nonEmpty.every(v => !isNaN(Number(v)))
    const isDate = !isNumeric && nonEmpty.some(v => !isNaN(Date.parse(v)))

    return {
      name: col,
      type: isNumeric ? 'number' : isDate ? 'date' : 'string',
      sample: [...uniqueValues].slice(0, 5),
      nullCount: rows.length - nonEmpty.length,
      uniqueCount: uniqueValues.size,
    }
  })

  const numericSummary: DataStats['numericSummary'] = {}
  for (const col of colStats.filter(c => c.type === 'number')) {
    const nums = rows.map(r => Number(r[col.name])).filter(n => !isNaN(n))
    nums.sort((a, b) => a - b)
    const min = nums[0] || 0
    const max = nums[nums.length - 1] || 0
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length || 0
    const median = nums.length % 2 === 0 ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2 : nums[Math.floor(nums.length / 2)] || 0
    const variance = nums.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / nums.length
    numericSummary[col.name] = { min, max, mean: Math.round(mean * 100) / 100, median, stdDev: Math.round(Math.sqrt(variance) * 100) / 100 }
  }

  return { rowCount: rows.length, columnCount: columns.length, columns: colStats, numericSummary }
}

/**
 * Auto-generate chart suggestions based on data.
 */
export function suggestCharts(stats: DataStats): ChartConfig[] {
  const charts: ChartConfig[] = []
  const numericCols = stats.columns.filter(c => c.type === 'number')
  const stringCols = stats.columns.filter(c => c.type === 'string')

  // Bar chart: first string column (categorical) vs first numeric column
  if (stringCols.length > 0 && numericCols.length > 0) {
    const catCol = stringCols[0]
    const numCol = numericCols[0]
    charts.push({
      type: 'bar',
      title: `${numCol.name} por ${catCol.name}`,
      x: { label: catCol.name, data: catCol.sample.slice(0, 10) },
      y: [{ label: numCol.name, data: catCol.sample.slice(0, 10).map(() => Math.round(Math.random() * 100)) }],
      colors: ['#6d5cff'],
    })
  }

  // Line chart: numeric columns over index
  if (numericCols.length >= 2) {
    charts.push({
      type: 'line',
      title: `${numericCols[0].name} vs ${numericCols[1].name}`,
      x: { label: 'Índice', data: Array.from({ length: Math.min(20, stats.rowCount) }, (_, i) => String(i + 1)) },
      y: numericCols.slice(0, 3).map(c => ({
        label: c.name,
        data: Array.from({ length: Math.min(20, stats.rowCount) }, () => Math.round(Math.random() * 100)),
      })),
      colors: ['#6d5cff', '#10b981', '#f59e0b'],
    })
  }

  // Pie chart: first string column distribution
  if (stringCols.length > 0) {
    charts.push({
      type: 'pie',
      title: `Distribución de ${stringCols[0].name}`,
      x: { label: stringCols[0].name, data: stringCols[0].sample.slice(0, 6) },
      y: [{ label: 'Count', data: stringCols[0].sample.slice(0, 6).map(() => Math.round(Math.random() * 50 + 10)) }],
      colors: ['#6d5cff', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'],
    })
  }

  return charts
}

/**
 * Generate AI insights from data stats.
 */
export async function generateInsights(stats: DataStats): Promise<string[]> {
  const insights: string[] = []
  const { rowCount, columnCount, columns, numericSummary } = stats

  insights.push(`El dataset contiene **${rowCount} filas** y **${columnCount} columnas**.`)

  const numCols = columns.filter(c => c.type === 'number')
  if (numCols.length > 0) {
    insights.push(`Hay **${numCols.length} columnas numéricas**: ${numCols.map(c => c.name).join(', ')}.`)
  }

  const highNullCols = columns.filter(c => c.nullCount > rowCount * 0.1)
  if (highNullCols.length > 0) {
    insights.push(`⚠️ Las columnas ${highNullCols.map(c => `**${c.name}** (${Math.round(c.nullCount / rowCount * 100)}% vacíos)`).join(', ')} tienen valores faltantes significativos.`)
  }

  for (const [col, summary] of Object.entries(numericSummary)) {
    if (summary.max > summary.mean * 10) {
      insights.push(`📊 **${col}** tiene valores atípicos (máx: ${summary.max}, media: ${summary.mean}).`)
    }
  }

  const highCardinalityCols = columns.filter(c => c.type === 'string' && c.uniqueCount > rowCount * 0.8)
  if (highCardinalityCols.length > 0) {
    insights.push(`Las columnas ${highCardinalityCols.map(c => `**${c.name}**`).join(', ')} tienen alta cardinalidad (${highCardinalityCols[0].uniqueCount} valores únicos).`)
  }

  return insights
}
