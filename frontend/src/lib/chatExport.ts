/* ============================================================================
   Exportar una conversación. Todo en el navegador: los mensajes ya están en el
   store, así que no hace falta pedirle nada al servidor ni gastar cuota.

   El PDF editorial vive aparte, en lib/pdfExport.ts (jsPDF, texto vectorial).
   Aquí están los formatos de texto: Markdown, JSON y Word.

   Word se resuelve con un HTML servido como application/msword. Es el truco de
   toda la vida y es el correcto para un ACTA de conversación: Word lo abre con
   sus títulos y negritas, sin pasar por el generador de documentos con IA —que
   reescribiría el contenido, tardaría y consumiría cuota de documentos.
   ========================================================================== */

export interface ExportMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

/** Nombre de archivo seguro a partir del título de la conversación. */
export function safeFileName(title: string): string {
  const base = (title || 'conversacion')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60)
  return base || 'conversacion'
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Un tick para que el navegador arranque la descarga antes de soltar la URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fmtDate = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('es')
}

// Los mensajes internos (tarjetas de documento generado) no son texto legible.
const isInternal = (c: string) => c.startsWith('__DOC__') || c.startsWith('__DOCJSON__')

/** Markdown puro: el contenido del asistente YA viene en markdown, se respeta tal cual. */
export function toMarkdown(title: string, messages: ExportMessage[], userLabel = 'Tú'): string {
  const head = `# ${title || 'Conversación'}\n\n_Exportado desde Daya AI el ${new Date().toLocaleString('es')}_\n\n---\n`
  const body = messages
    .filter(m => !isInternal(m.content))
    .map(m => {
      const who = m.role === 'user' ? userLabel : 'Daya'
      const when = fmtDate(m.createdAt)
      return `\n## ${who}${when ? ` · ${when}` : ''}\n\n${m.content.trim()}\n`
    })
    .join('\n')
  return head + body
}

export function exportMarkdown(title: string, messages: ExportMessage[], userLabel?: string) {
  const md = toMarkdown(title, messages, userLabel)
  download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeFileName(title)}.md`)
}

export function exportJson(title: string, messages: ExportMessage[]) {
  const data = messages
    .filter(m => !isInternal(m.content))
    .map(m => ({ role: m.role, content: m.content, timestamp: m.createdAt || null }))
  download(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    `${safeFileName(title)}.json`
  )
}

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Markdown mínimo → HTML: títulos, negrita, cursiva, código y listas. */
function mdToHtml(src: string): string {
  const lines = esc(src).split('\n')
  const out: string[] = []
  let inList = false
  let inCode = false
  for (const raw of lines) {
    const line = raw
    if (/^```/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(inCode ? '</pre>' : '<pre style="background:#f4f4f6;padding:10px;font-family:Consolas,monospace;font-size:10pt">')
      inCode = !inCode
      continue
    }
    if (inCode) { out.push(line + '<br/>'); continue }

    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    if (!line.trim()) { out.push('<p style="margin:0 0 8pt"></p>'); continue }
    out.push(`<p style="margin:0 0 8pt">${inline(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  if (inCode) out.push('</pre>')
  return out.join('\n')
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code style="font-family:Consolas,monospace">$1</code>')
}

export function exportWord(title: string, messages: ExportMessage[], userLabel = 'Tú') {
  const heading = title || 'Conversación'
  const blocks = messages
    .filter(m => !isInternal(m.content))
    .map(m => {
      const who = m.role === 'user' ? userLabel : 'Daya'
      const when = fmtDate(m.createdAt)
      return `<h2 style="color:#14131c;border-bottom:1px solid #dadce0;padding-bottom:4pt">${esc(who)}${when ? ` <span style="font-size:9pt;color:#6c6780;font-weight:normal">· ${esc(when)}</span>` : ''}</h2>${mdToHtml(m.content.trim())}`
    })
    .join('\n')

  // El bloque xmlns + ProgId es lo que hace que Word lo abra como documento y no
  // como página web suelta.
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(heading)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#14131c;line-height:1.5}h1{font-size:20pt}h2{font-size:13pt;margin-top:16pt}code,pre{font-size:10pt}</style>
</head><body>
<h1>${esc(heading)}</h1>
<p style="color:#6c6780;font-size:9pt">Exportado desde Daya AI el ${new Date().toLocaleString('es')}</p>
${blocks}
</body></html>`

  download(new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' }), `${safeFileName(title)}.doc`)
}
