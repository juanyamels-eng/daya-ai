import { generateDocumentContent, GenerateRequest } from './documentService'
import { chatJSON, MODELS } from '../../services/openrouter'
import { DESIGN, hex, looksLikeMoney, looksLikeDate } from './designSystem'
import * as XLSX from 'xlsx'

// ============================================
// GENERADOR DE EXCEL (.xlsx) — VIP
// Auto-fit · cabeceras carbón · moneda/fechas · cebreado
// ============================================

export async function generateExcelData(req: GenerateRequest): Promise<{
  headers: string[]
  rows: any[][]
  chartConfig: { type: 'bar' | 'line' | 'pie' | 'area'; title: string; dataColumn: string; labelColumn: string } | null
  summary: string
  insights?: string[]
}> {
  const sys = `Eres un analista de datos SENIOR. Generas hojas de cálculo realistas y RIGUROSAS, no de relleno.
Principios innegociables:
- COHERENCIA NUMÉRICA: los números deben tener sentido entre sí. Si hay subtotales/porcentajes, deben cuadrar (los % suman ~100, los totales son la suma real de sus filas).
- UNIDADES CONSISTENTES por columna (toda una columna en la misma moneda/unidad/escala). No mezcles $ con % en la misma columna.
- DATOS PLAUSIBLES: magnitudes y proporciones realistas para el tema (nada de cifras absurdas ni redondas idénticas).
- VARIACIÓN REAL: evita patrones artificiales (todo 100, 200, 300…); usa una distribución creíble.
Respondes SOLO en JSON válido.`

  const prompt = `Genera una tabla de Excel REAL, completa y útil sobre: "${req.prompt}"
${req.answers && Object.keys(req.answers).length ? `Preferencias del usuario (respétalas): ${Object.entries(req.answers).map(([k, v]) => `${k}: ${v}`).join(' · ')}\n` : ''}
REGLAS:
- Entre 12 y 20 filas de datos realistas y coherentes (NADA de "dato1", nada de [corchetes]).
- 4 a 6 columnas. Al menos una columna numérica (cifras, montos o porcentajes) coherente con el tema.
- Cada columna numérica con UNA sola unidad (indícala en el encabezado si ayuda, p.ej. "Ingresos (USD)" o "Margen (%)").
- Si el tema implica un agregado, AÑADE una fila final de "Total"/"Promedio" cuyo valor sea la suma/promedio REAL de las filas de arriba.
- Nombres, fechas y montos verosímiles y específicos del tema.
- chartConfig: el gráfico que mejor represente los datos, apuntando a columnas que EXISTAN por su nombre exacto.
- insights: 2-4 conclusiones concretas y NO obvias, derivadas de los datos (tendencia, concentración, outlier…).

Responde SOLO con JSON válido:
{
  "title": "título claro de la hoja",
  "headers": ["Columna 1", "Columna 2", "Columna 3", "Valor"],
  "rows": [["...", "...", "...", 1234], ["...", "...", "...", 987]],
  "chartConfig": { "type": "bar", "title": "título del gráfico", "dataColumn": "Valor", "labelColumn": "Columna 1" },
  "summary": "qué muestra la tabla en 1-2 frases",
  "insights": ["conclusión concreta 1", "conclusión concreta 2"]
}`

  // Pago → GLM-5.2 (datos más coherentes); FREE → DeepSeek V4 Pro.
  const isPaid = !!req.plan && !/free/i.test(req.plan)
  // Por alias, no por id: así el sanador del catálogo los mantiene vivos.
  const model = isPaid ? MODELS.claude : MODELS.chat
  const parsed = await chatJSON(prompt, sys, model, 4000)

  return {
    headers: Array.isArray(parsed.headers) ? parsed.headers : ['Categoría', 'Valor'],
    rows: Array.isArray(parsed.rows) && parsed.rows.length ? parsed.rows : [['Sin datos', 0]],
    chartConfig: parsed.chartConfig || { type: 'bar', title: 'Datos', dataColumn: '', labelColumn: '' },
    summary: parsed.summary || '',
    insights: Array.isArray(parsed.insights) ? parsed.insights : [],
  }
}

// ============================================
// Genera el archivo .xlsx REAL estilizado
// ============================================
export function buildXLSX(title: string, headers: string[], rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new()

  // Construir matriz: cabecera + filas
  const aoa = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // === AUTO-FIT: ancho de columna según el contenido más largo ===
  ws['!cols'] = headers.map((h, c) => {
    let maxLen = String(h).length
    for (const row of rows) {
      const val = row[c]
      if (val != null) maxLen = Math.max(maxLen, String(val).length)
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 50) } // entre 10 y 50 chars
  })

  // Altura de la fila de cabecera
  ws['!rows'] = [{ hpt: 24 }]

  const range = XLSX.utils.decode_range(ws['!ref']!)

  // === ESTILOS por celda ===
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[cellRef]
      if (!cell) continue

      if (R === 0) {
        // CABECERA VIP: fondo carbón, texto blanco, negrita
        cell.s = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12, name: 'Calibri' },
          fill: { fgColor: { rgb: hex(DESIGN.color.charcoal) } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: thinBorder('FFFFFF'),
        }
      } else {
        // FILAS: cebreado suave + formato de moneda/fecha
        const isEven = R % 2 === 0
        const header = headers[C] || ''
        const numFmt = looksLikeMoney(header) ? '"S/. "#,##0.00'
          : looksLikeDate(header) ? 'dd/mm/yyyy'
          : undefined

        cell.s = {
          font: { sz: 11, color: { rgb: hex(DESIGN.color.graphite) }, name: 'Calibri' },
          fill: { fgColor: { rgb: isEven ? hex(DESIGN.color.surfaceAlt) : 'FFFFFF' } },
          alignment: { vertical: 'center', horizontal: typeof cell.v === 'number' ? 'right' : 'left' },
          border: thinBorder(hex(DESIGN.color.line)),
          ...(numFmt ? { numFmt } : {}),
        }
        if (numFmt) cell.z = numFmt
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, (title || 'Datos').slice(0, 28))
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
}

function thinBorder(rgb: string) {
  const side = { style: 'thin', color: { rgb } }
  return { top: side, bottom: side, left: side, right: side }
}

// ============================================
// HTML preview (estética unificada de DAYA AI)
// ============================================
export function buildExcelPreviewHTML(
  title: string,
  headers: string[],
  rows: any[][],
  chartConfig: any,
  insights: string[] = []
): string {
  const tableRows = rows.map((row, ri) =>
    `<tr style="background:${ri % 2 === 0 ? DESIGN.color.surfaceAlt : DESIGN.color.white}">${row.map((cell: any) => `<td>${cell}</td>`).join('')}</tr>`
  ).join('')

  const insightsList = insights.map(i => `<li>${i}</li>`).join('')
  const today = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${DESIGN.font.sans}; background: ${DESIGN.color.surfaceAlt}; color: ${DESIGN.color.ink}; padding: 36px; }
  .header { background: ${DESIGN.color.charcoal}; color: ${DESIGN.color.white}; padding: 28px 36px; border-radius: 14px; margin-bottom: 28px; }
  .eyebrow { font-size: 11px; font-weight: 700; opacity: 0.7; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; }
  .header h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 6px; }
  .header p { opacity: 0.7; font-size: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .card { background: ${DESIGN.color.white}; border-radius: 14px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid ${DESIGN.color.line}; }
  .card h2 { font-size: 12px; font-weight: 700; color: ${DESIGN.color.slate}; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${DESIGN.color.charcoal}; color: ${DESIGN.color.white}; padding: 11px 16px; text-align: left; font-size: 13px; font-weight: 650; }
  td { padding: 10px 16px; border-bottom: 1px solid ${DESIGN.color.line}; font-size: 14px; color: ${DESIGN.color.graphite}; }
  .chart-container { position: relative; height: 280px; }
  .insights { background: ${DESIGN.color.white}; border-radius: 14px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid ${DESIGN.color.line}; }
  .insights h2 { font-size: 12px; font-weight: 700; color: ${DESIGN.color.slate}; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 14px; }
  .insights li { padding: 8px 0; color: ${DESIGN.color.graphite}; font-size: 14px; border-bottom: 1px solid ${DESIGN.color.lineLight}; list-style: none; padding-left: 18px; position: relative; }
  .insights li::before { content: ''; position: absolute; left: 0; top: 15px; width: 5px; height: 5px; border-radius: 1px; background: ${DESIGN.color.charcoal}; }
  .footer { text-align: center; font-size: 11px; color: ${DESIGN.color.mist}; margin-top: 28px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
</style>
</head>
<body>
<div class="header">
  <div class="eyebrow">${DESIGN.brand.name} · ${DESIGN.brand.org}</div>
  <h1>${title}</h1>
  <p>${today}</p>
</div>
<div class="grid">
  <div class="card">
    <h2>Datos</h2>
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <div class="card">
    <h2>${chartConfig?.title || 'Gráfico'}</h2>
    <div class="chart-container"><canvas id="chart"></canvas></div>
  </div>
</div>
${insightsList ? `<div class="insights"><h2>Análisis e Insights</h2><ul>${insightsList}</ul></div>` : ''}
<div class="footer">Generado con ${DESIGN.brand.name} · ${DESIGN.brand.org}</div>
<script>
const labels = ${JSON.stringify(rows.map(r => r[0]))};
const data = ${JSON.stringify(rows.map(r => r[headers.length - 1]))};
const ctx = document.getElementById('chart').getContext('2d');
const NEUTRALS = ['#18181B','#3F3F46','#52525B','#71717A','#A1A1AA','#D4D4D8'];
new Chart(ctx, {
  type: '${chartConfig?.type || 'bar'}',
  data: { labels, datasets: [{
    label: '${headers[headers.length - 1] || 'Valor'}',
    data,
    backgroundColor: NEUTRALS,
    borderColor: '${DESIGN.color.charcoal}',
    borderWidth: 1,
    borderRadius: 6,
  }]},
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { grid: { color: '${DESIGN.color.lineLight}' } }, x: { grid: { display: false } } }
  }
});
</script>
</body>
</html>`
}
