// ============================================
// DAYA IA — Documento por bloques
// --------------------------------------------------------------------------
// Formato de contenido canónico de DAYA: en vez de HTML sucio o markdown suelto,
// el contenido es un array de BLOQUES estructurados { type, data }. Limpio,
// portable, saneable y fácil de procesar por IA — la idea central de Editor.js
// (Apache-2.0), reescrita como tipos TypeScript propios.
//
// Sirve como "lengua franca" de contenido entre features: chat, research2,
// audiointel, career y el editor pueden emitir/consumir el mismo formato, y los
// conversores (convert.ts) lo llevan a markdown / HTML / texto.
// ============================================

// Tipos de bloque soportados (los esenciales; ampliable).
export type BlockType =
  | 'header' | 'paragraph' | 'list' | 'checklist' | 'quote'
  | 'code' | 'table' | 'delimiter' | 'image' | 'callout'

export interface Block {
  id?: string
  type: BlockType
  data: Record<string, any>
}

// Documento completo (forma compatible con Editor.js: blocks + meta).
export interface BlockDocument {
  time?: number
  blocks: Block[]
  version?: string
}

// ── Formas de `data` por tipo (referencia para quien construye bloques) ──────
//   header:    { text: string, level: 1..6 }
//   paragraph: { text: string }                       // text admite **negrita**, *cursiva*, `code`, [enlaces](url)
//   list:      { style: 'ordered'|'unordered', items: string[] }
//   checklist: { items: { text: string, checked: boolean }[] }
//   quote:     { text: string, caption?: string }
//   code:      { code: string, language?: string }
//   table:     { headers?: string[], rows: string[][] }
//   delimiter: {}
//   image:     { url: string, caption?: string, alt?: string }
//   callout:   { text: string, variant?: 'info'|'warning'|'success'|'danger' }

// ── Constructores rápidos (para que las features emitan bloques sin fricción) ─

export const B = {
  header: (text: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 2): Block => ({ type: 'header', data: { text, level } }),
  paragraph: (text: string): Block => ({ type: 'paragraph', data: { text } }),
  list: (items: string[], style: 'ordered' | 'unordered' = 'unordered'): Block => ({ type: 'list', data: { style, items } }),
  checklist: (items: { text: string; checked?: boolean }[]): Block => ({ type: 'checklist', data: { items: items.map(i => ({ text: i.text, checked: !!i.checked })) } }),
  quote: (text: string, caption?: string): Block => ({ type: 'quote', data: { text, caption } }),
  code: (code: string, language?: string): Block => ({ type: 'code', data: { code, language } }),
  table: (rows: string[][], headers?: string[]): Block => ({ type: 'table', data: { headers, rows } }),
  delimiter: (): Block => ({ type: 'delimiter', data: {} }),
  image: (url: string, caption?: string, alt?: string): Block => ({ type: 'image', data: { url, caption, alt } }),
  callout: (text: string, variant: 'info' | 'warning' | 'success' | 'danger' = 'info'): Block => ({ type: 'callout', data: { text, variant } }),
}

/** Crea un documento a partir de una lista de bloques. */
export function doc(blocks: Block[]): BlockDocument {
  return { time: Date.now(), blocks, version: 'daya-1' }
}

// ── Validación y saneo ───────────────────────────────────────────────────────

export interface ValidationResult { valid: boolean; errors: string[] }

const VALID_TYPES = new Set<BlockType>(['header', 'paragraph', 'list', 'checklist', 'quote', 'code', 'table', 'delimiter', 'image', 'callout'])

export function validateDocument(input: any): ValidationResult {
  const errors: string[] = []
  if (!input || typeof input !== 'object') return { valid: false, errors: ['El documento no es un objeto.'] }
  if (!Array.isArray(input.blocks)) return { valid: false, errors: ['Falta el array "blocks".'] }
  input.blocks.forEach((b: any, i: number) => {
    if (!b || typeof b !== 'object') { errors.push(`Bloque ${i}: no es un objeto.`); return }
    if (!VALID_TYPES.has(b.type)) errors.push(`Bloque ${i}: tipo desconocido "${b.type}".`)
    if (b.data == null || typeof b.data !== 'object') errors.push(`Bloque ${i}: falta "data".`)
  })
  return { valid: errors.length === 0, errors }
}

/**
 * Sanea un documento: descarta bloques inválidos, recorta longitudes, asegura
 * la forma esperada de cada tipo. Nunca lanza: devuelve siempre algo usable.
 */
export function sanitizeDocument(input: any): BlockDocument {
  const blocks: Block[] = []
  const raw = Array.isArray(input?.blocks) ? input.blocks : []
  for (const b of raw) {
    if (!b || !VALID_TYPES.has(b.type) || typeof b.data !== 'object') continue
    blocks.push(sanitizeBlock(b))
    if (blocks.length >= 1000) break // tope de seguridad
  }
  return { time: input?.time || Date.now(), blocks, version: input?.version || 'daya-1' }
}

function clip(s: any, n: number): string { return String(s ?? '').slice(0, n) }

function sanitizeBlock(b: Block): Block {
  const d = b.data || {}
  switch (b.type) {
    case 'header':
      return B.header(clip(d.text, 300), (Math.min(Math.max(Number(d.level) || 2, 1), 6) as any))
    case 'paragraph':
      return B.paragraph(clip(d.text, 5000))
    case 'list':
      return B.list((Array.isArray(d.items) ? d.items : []).map((i: any) => clip(i, 1000)).slice(0, 200), d.style === 'ordered' ? 'ordered' : 'unordered')
    case 'checklist':
      return B.checklist((Array.isArray(d.items) ? d.items : []).slice(0, 200).map((i: any) => ({ text: clip(i?.text, 1000), checked: !!i?.checked })))
    case 'quote':
      return B.quote(clip(d.text, 2000), d.caption ? clip(d.caption, 200) : undefined)
    case 'code':
      return B.code(clip(d.code, 20000), d.language ? clip(d.language, 30) : undefined)
    case 'table':
      return B.table((Array.isArray(d.rows) ? d.rows : []).slice(0, 200).map((r: any) => (Array.isArray(r) ? r.map((c: any) => clip(c, 500)) : [])), Array.isArray(d.headers) ? d.headers.map((h: any) => clip(h, 200)) : undefined)
    case 'image':
      return B.image(clip(d.url, 1000), d.caption ? clip(d.caption, 300) : undefined, d.alt ? clip(d.alt, 300) : undefined)
    case 'callout':
      return B.callout(clip(d.text, 2000), ['info', 'warning', 'success', 'danger'].includes(d.variant) ? d.variant : 'info')
    case 'delimiter':
    default:
      return { type: b.type, data: {} }
  }
}

/** Extrae todo el texto plano de un documento (para indexar en RAG/búsqueda). */
export function documentToPlainText(docu: BlockDocument): string {
  const out: string[] = []
  for (const b of docu.blocks) {
    const d = b.data || {}
    switch (b.type) {
      case 'header': case 'paragraph': case 'quote': case 'callout': out.push(String(d.text || '')); break
      case 'list': out.push((d.items || []).join('\n')); break
      case 'checklist': out.push((d.items || []).map((i: any) => i.text).join('\n')); break
      case 'code': out.push(String(d.code || '')); break
      case 'table':
        if (d.headers) out.push(d.headers.join(' | '))
        for (const r of d.rows || []) out.push((r || []).join(' | '))
        break
      case 'image': if (d.caption) out.push(String(d.caption)); break
    }
  }
  return out.filter(Boolean).join('\n\n')
}
