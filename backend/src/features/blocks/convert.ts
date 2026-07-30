// ============================================
// DAYA IA — Conversores de bloques
// --------------------------------------------------------------------------
// Llevan el formato de bloques canónico a/desde los formatos que tus features
// ya usan: markdown (chat, research2, audiointel) y HTML (render/exportar).
// Así un informe de research2, un acta de audiointel o un CV de career pueden
// vivir como bloques y mostrarse/editarse de forma uniforme.
// ============================================

import { Block, BlockDocument, B, doc } from './blockDocument'

// ════════════════════════════════════════════════════════════════════════════
// markdown → bloques
// ════════════════════════════════════════════════════════════════════════════

/**
 * Parsea markdown a un documento de bloques. Cubre lo común: encabezados,
 * párrafos, listas (orden./desord.), checklists, citas, bloques de código,
 * tablas y delimitadores. El inline (negrita/cursiva/enlaces) se conserva tal
 * cual en el texto (los conversores de salida lo entienden).
 */
export function markdownToBlocks(md: string): BlockDocument {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  const flushParagraph = (buf: string[]) => {
    const text = buf.join(' ').trim()
    if (text) blocks.push(B.paragraph(text))
  }

  let paraBuf: string[] = []

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Bloque de código ```
    if (/^```/.test(trimmed)) {
      flushParagraph(paraBuf); paraBuf = []
      const lang = trimmed.replace(/^```/, '').trim() || undefined
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i++ }
      i++ // cierre ```
      blocks.push(B.code(code.join('\n'), lang))
      continue
    }

    // Delimitador --- o ***
    if (/^(\-\-\-|\*\*\*|___)\s*$/.test(trimmed)) {
      flushParagraph(paraBuf); paraBuf = []
      blocks.push(B.delimiter()); i++; continue
    }

    // Encabezado #..######
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushParagraph(paraBuf); paraBuf = []
      blocks.push(B.header(h[2].trim(), h[1].length as any)); i++; continue
    }

    // Cita >
    if (/^>\s?/.test(trimmed)) {
      flushParagraph(paraBuf); paraBuf = []
      const q: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++ }
      blocks.push(B.quote(q.join(' '))); continue
    }

    // Tabla |a|b| con separador |---|---|
    if (/^\|.*\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s:\-|]+\|$/.test(lines[i + 1].trim())) {
      flushParagraph(paraBuf); paraBuf = []
      const headers = splitRow(trimmed)
      i += 2 // salta cabecera y separador
      const rows: string[][] = []
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(splitRow(lines[i].trim())); i++ }
      blocks.push(B.table(rows, headers)); continue
    }

    // Checklist - [ ] / - [x]
    if (/^[-*]\s+\[[ xX]\]/.test(trimmed)) {
      flushParagraph(paraBuf); paraBuf = []
      const items: { text: string; checked: boolean }[] = []
      while (i < lines.length && /^[-*]\s+\[[ xX]\]/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^[-*]\s+\[([ xX])\]\s*(.*)$/)!
        items.push({ text: m[2], checked: /[xX]/.test(m[1]) }); i++
      }
      blocks.push(B.checklist(items)); continue
    }

    // Lista desordenada - / *
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph(paraBuf); paraBuf = []
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, '')); i++ }
      blocks.push(B.list(items, 'unordered')); continue
    }

    // Lista ordenada 1.
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph(paraBuf); paraBuf = []
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, '')); i++ }
      blocks.push(B.list(items, 'ordered')); continue
    }

    // Línea en blanco: cierra párrafo
    if (!trimmed) { flushParagraph(paraBuf); paraBuf = []; i++; continue }

    // Texto normal: acumula en párrafo
    paraBuf.push(trimmed); i++
  }
  flushParagraph(paraBuf)
  return doc(blocks)
}

function splitRow(line: string): string[] {
  return line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}

// ════════════════════════════════════════════════════════════════════════════
// bloques → markdown
// ════════════════════════════════════════════════════════════════════════════

export function blocksToMarkdown(docu: BlockDocument): string {
  const out: string[] = []
  for (const b of docu.blocks) {
    const d = b.data || {}
    switch (b.type) {
      case 'header': out.push(`${'#'.repeat(d.level || 2)} ${d.text || ''}`); break
      case 'paragraph': out.push(d.text || ''); break
      case 'list':
        out.push((d.items || []).map((it: string, idx: number) => d.style === 'ordered' ? `${idx + 1}. ${it}` : `- ${it}`).join('\n')); break
      case 'checklist':
        out.push((d.items || []).map((it: any) => `- [${it.checked ? 'x' : ' '}] ${it.text}`).join('\n')); break
      case 'quote': out.push(`> ${(d.text || '').replace(/\n/g, '\n> ')}${d.caption ? `\n> — ${d.caption}` : ''}`); break
      case 'code': out.push('```' + (d.language || '') + '\n' + (d.code || '') + '\n```'); break
      case 'table': {
        const headers = d.headers || (d.rows?.[0] ? d.rows[0].map(() => '') : [])
        const rows = d.rows || []
        if (headers.length) {
          out.push(`| ${headers.join(' | ')} |`)
          out.push(`| ${headers.map(() => '---').join(' | ')} |`)
        }
        for (const r of rows) out.push(`| ${(r || []).join(' | ')} |`)
        break
      }
      case 'delimiter': out.push('---'); break
      case 'image': out.push(`![${d.alt || d.caption || ''}](${d.url || ''})${d.caption ? `\n*${d.caption}*` : ''}`); break
      case 'callout': out.push(`> **${(d.variant || 'info').toUpperCase()}:** ${d.text || ''}`); break
    }
  }
  return out.join('\n\n')
}

// ════════════════════════════════════════════════════════════════════════════
// bloques → HTML (con escape seguro + inline básico)
// ════════════════════════════════════════════════════════════════════════════

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Inline seguro: aplica negrita/cursiva/código/enlaces SOBRE texto ya escapado.
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

export function blocksToHtml(docu: BlockDocument): string {
  const out: string[] = []
  for (const b of docu.blocks) {
    const d = b.data || {}
    switch (b.type) {
      case 'header': out.push(`<h${d.level || 2}>${inline(d.text || '')}</h${d.level || 2}>`); break
      case 'paragraph': out.push(`<p>${inline(d.text || '')}</p>`); break
      case 'list': {
        const tag = d.style === 'ordered' ? 'ol' : 'ul'
        out.push(`<${tag}>${(d.items || []).map((it: string) => `<li>${inline(it)}</li>`).join('')}</${tag}>`); break
      }
      case 'checklist':
        out.push(`<ul class="checklist">${(d.items || []).map((it: any) => `<li><input type="checkbox" disabled ${it.checked ? 'checked' : ''}/> ${inline(it.text)}</li>`).join('')}</ul>`); break
      case 'quote':
        out.push(`<blockquote>${inline(d.text || '')}${d.caption ? `<cite>${esc(d.caption)}</cite>` : ''}</blockquote>`); break
      case 'code':
        out.push(`<pre><code${d.language ? ` class="language-${esc(d.language)}"` : ''}>${esc(d.code || '')}</code></pre>`); break
      case 'table': {
        const head = d.headers ? `<thead><tr>${d.headers.map((h: string) => `<th>${inline(h)}</th>`).join('')}</tr></thead>` : ''
        const body = `<tbody>${(d.rows || []).map((r: string[]) => `<tr>${(r || []).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
        out.push(`<table>${head}${body}</table>`); break
      }
      case 'delimiter': out.push('<hr/>'); break
      case 'image':
        out.push(`<figure><img src="${esc(d.url)}" alt="${esc(d.alt || d.caption || '')}"/>${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ''}</figure>`); break
      case 'callout':
        out.push(`<div class="callout callout--${esc(d.variant || 'info')}">${inline(d.text || '')}</div>`); break
    }
  }
  return out.join('\n')
}
