// ============================================
// DAYA IA — Codemap (servicio de alto nivel)
// --------------------------------------------------------------------------
// Dos capacidades sobre el motor TreeContext:
//
//   1) grepStructural: busca un patrón en código y devuelve cada coincidencia
//      con su CONTEXTO estructural (función/clase que la contiene), colapsando
//      lo demás. Ideal para que el agente "lea" un repo sin tragarse archivos
//      enteros.
//
//   2) codeSkeleton: extrae el "esqueleto" de un archivo — solo las cabeceras
//      de funciones/clases/métodos — para dar un mapa navegable y barato en
//      tokens. Pensado para mejorar el RAG (features/docrag): en vez de trozos
//      ciegos de 900 caracteres, se indexan unidades con significado.
//
// Todo devuelve JSON. Funciona con o sin tree-sitter (degradación elegante).
// ============================================

import { TreeContext } from './treeContext'
import { buildBestModel } from './lineModel'

export interface GrepMatch {
  file: string
  context: string          // código con contexto estructural y "⋮"
  lineHits: number[]       // líneas (1-indexed) que coincidieron
  usedTreeSitter: boolean
}

export interface GrepOptions {
  ignoreCase?: boolean
  loiPad?: number
  childContext?: boolean
  lineNumbers?: boolean
}

/**
 * grep estructural sobre un único archivo (contenido en memoria).
 */
export async function grepFile(
  filePath: string,
  code: string,
  pattern: string,
  opts: GrepOptions = {}
): Promise<GrepMatch | null> {
  const { model, usedTreeSitter } = await buildBestModel(code, filePath)
  const tc = new TreeContext(code, model, {
    loiPad: opts.loiPad ?? 1,
    childContext: opts.childContext ?? true,
    lineNumbers: opts.lineNumbers ?? true,
    parentContext: true,
    markLois: true,
  })
  const hits = tc.grep(pattern, opts.ignoreCase)
  if (!hits.length) return null
  tc.addContext()
  return {
    file: filePath,
    context: tc.format(),
    lineHits: hits.map(h => h + 1),
    usedTreeSitter,
  }
}

/**
 * grep estructural sobre varios archivos (los provee el caller: [{path, content}]).
 * El caller decide de dónde salen los archivos (repo local, uploads, etc.).
 */
export async function grepStructural(
  files: { path: string; content: string }[],
  pattern: string,
  opts: GrepOptions = {}
): Promise<GrepMatch[]> {
  const out: GrepMatch[] = []
  for (const f of files) {
    if (!f.content || f.content.length > 500_000) continue // omite gigantes/binarios
    const m = await grepFile(f.path, f.content, pattern, opts).catch(() => null)
    if (m) out.push(m)
  }
  return out
}

// ── Esqueleto de código (para mapas y RAG) ───────────────────────────────────

export interface SkeletonUnit {
  header: string           // primera línea(s) de la firma
  startLine: number        // 1-indexed
  endLine: number          // 1-indexed
  lineCount: number
}

export interface CodeSkeleton {
  file: string
  usedTreeSitter: boolean
  units: SkeletonUnit[]
  outline: string          // representación textual compacta del archivo
}

/**
 * Extrae el esqueleto de un archivo: cada función/clase/método como una unidad
 * con su firma y rango. El "outline" es un texto colapsado mostrando solo las
 * cabeceras — perfecto para dar contexto barato al modelo.
 */
export async function codeSkeleton(filePath: string, code: string): Promise<CodeSkeleton> {
  const { model, usedTreeSitter } = await buildBestModel(code, filePath)
  const lines = code.split('\n')

  // Cada entrada de `header` es el inicio de un scope: su cabecera + rango.
  const units: SkeletonUnit[] = []
  const loiForOutline: number[] = []
  for (const [startLine, [hStart, hEnd]] of model.header.entries()) {
    const nodeArr = model.nodes.get(startLine) || [[startLine, startLine]]
    const endLine = Math.max(...nodeArr.map(([, e]) => e))
    const headerText = lines.slice(hStart, hEnd).join('\n').trim()
    if (!headerText) continue
    units.push({
      header: headerText,
      startLine: startLine + 1,
      endLine: endLine + 1,
      lineCount: endLine - startLine + 1,
    })
    for (let n = hStart; n < hEnd; n++) loiForOutline.push(n)
  }
  units.sort((a, b) => a.startLine - b.startLine)

  // Outline: usa TreeContext mostrando solo las cabeceras (sin cuerpos).
  const tc = new TreeContext(code, model, {
    loiPad: 0, childContext: false, parentContext: true,
    lineNumbers: true, markLois: false,
  })
  tc.addLinesOfInterest(loiForOutline)
  tc.addContext()
  const outline = tc.format()

  return { file: filePath, usedTreeSitter, units, outline }
}

/**
 * Trocea código por UNIDADES con significado (función/clase) en vez de por
 * caracteres. Devuelve fragmentos listos para indexar en el RAG, cada uno con
 * su firma como "título". Pensado como mejora drop-in para features/docrag.
 */
export async function structuralChunks(
  filePath: string,
  code: string,
  maxChunkLines = 120
): Promise<{ title: string; text: string; startLine: number }[]> {
  const skel = await codeSkeleton(filePath, code)
  const lines = code.split('\n')
  if (!skel.units.length) {
    // Sin estructura detectable: cae a troceo simple por bloques de líneas.
    const chunks: { title: string; text: string; startLine: number }[] = []
    for (let i = 0; i < lines.length; i += maxChunkLines) {
      chunks.push({
        title: `${filePath}:${i + 1}`,
        text: lines.slice(i, i + maxChunkLines).join('\n'),
        startLine: i + 1,
      })
    }
    return chunks
  }

  // Una unidad = un chunk. Las unidades muy grandes se parten por tamaño.
  const chunks: { title: string; text: string; startLine: number }[] = []
  for (const u of skel.units) {
    const body = lines.slice(u.startLine - 1, u.endLine)
    const firstLine = u.header.split('\n')[0]
    if (body.length <= maxChunkLines) {
      chunks.push({ title: `${filePath} → ${firstLine}`, text: body.join('\n'), startLine: u.startLine })
    } else {
      for (let i = 0; i < body.length; i += maxChunkLines) {
        chunks.push({
          title: `${filePath} → ${firstLine} (parte ${Math.floor(i / maxChunkLines) + 1})`,
          text: body.slice(i, i + maxChunkLines).join('\n'),
          startLine: u.startLine + i,
        })
      }
    }
  }
  return chunks
}
