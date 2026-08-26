import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import { parseCsv, computeStats, suggestCharts, generateInsights } from '../../services/dataAnalyzer'

const router = Router()
router.use(requireAuth)

/**
 * POST /api/data/analyze — Upload and analyze CSV/Excel data
 */
router.post('/analyze', async (req: any, res) => {
  try {
    const { csvData } = req.body
    if (!csvData || typeof csvData !== 'string') {
      return res.status(400).json({ error: 'csvData requerido' })
    }

    const rows = parseCsv(csvData)
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No se encontraron datos válidos' })
    }

    const stats = computeStats(rows)
    const charts = suggestCharts(stats)
    const insights = await generateInsights(stats)

    res.json({ stats, charts, insights, preview: rows.slice(0, 20) })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error analizando datos' })
  }
})

/**
 * POST /api/data/chart — Generate a specific chart config
 */
router.post('/chart', async (req: any, res) => {
  try {
    const { csvData, chartType, xColumn, yColumns } = req.body
    if (!csvData) return res.status(400).json({ error: 'csvData requerido' })

    const rows = parseCsv(csvData)

    // Build chart from specified columns
    const xData = rows.slice(0, 30).map(r => r[xColumn || Object.keys(r)[0]] || '')
    const yData = (yColumns || [Object.keys(rows[0] || {}).find(k => !isNaN(Number(rows[0]?.[k]))) || Object.keys(rows[0] || {})[0]]).map((col: string) => ({
      label: col,
      data: rows.slice(0, 30).map(r => Number(r[col]) || 0),
    }))

    res.json({
      chart: {
        type: chartType || 'bar',
        title: `Gráfica de ${xColumn || 'datos'}`,
        x: { label: xColumn || 'Categoría', data: xData },
        y: yData,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error' })
  }
})

export default router
