// ============================================
// DAYA IA — GitHub Doc Agent
// --------------------------------------------------------------------------
// Escanea un repositorio LOCAL y redacta un README.md técnico, limpio y
// profesional: detecta el stack, mapea la arquitectura (carpetas/módulos),
// extrae scripts y dependencias del package.json, descubre variables de entorno
// y endpoints, y compone todo con ayuda de IA.
//
// Devuelve JSON con el markdown listo (no escribe el archivo salvo que se pida
// explícitamente, para que el usuario lo revise primero).
//
// Implementación propia en TypeScript. Lee el filesystem de forma acotada
// (ignora node_modules, binarios, etc.) para no desbordarse en repos grandes.
// ============================================

import { readFile, readdir, stat, writeFile } from 'fs/promises'
import * as path from 'path'
import { chatJSON } from '../../services/openrouter'

// ── Recorrido del repo (acotado) ─────────────────────────────────────────────

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', 'vendor', '__pycache__'])
const CODE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|prisma)$/i

interface RepoMap {
  tree: string[]                 // rutas relativas de carpetas/archivos clave
  fileCount: number
  byExt: Record<string, number>  // recuento por extensión
  topDirs: string[]              // carpetas de primer/segundo nivel
}

// Recorre el árbol hasta cierta profundidad, ignorando ruido.
async function walk(root: string, maxDepth = 4): Promise<RepoMap> {
  const tree: string[] = []
  const byExt: Record<string, number> = {}
  const topDirs = new Set<string>()
  let fileCount = 0

  async function recurse(dir: string, depth: number, rel: string) {
    if (depth > maxDepth) return
    let entries: string[]
    try { entries = await readdir(dir) } catch { return }
    for (const name of entries) {
      if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue
      const full = path.join(dir, name)
      const relPath = rel ? `${rel}/${name}` : name
      let s
      try { s = await stat(full) } catch { continue }
      if (s.isDirectory()) {
        if (depth <= 1) topDirs.add(relPath)
        if (tree.length < 400) tree.push(relPath + '/')
        await recurse(full, depth + 1, relPath)
      } else {
        fileCount++
        const ext = (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
        if (ext) byExt[ext] = (byExt[ext] || 0) + 1
        if (CODE_EXT.test(name) && tree.length < 400) tree.push(relPath)
      }
    }
  }

  await recurse(root, 0, '')
  return { tree, fileCount, byExt, topDirs: [...topDirs].sort() }
}

// ── Señales del proyecto ─────────────────────────────────────────────────────

interface ProjectSignals {
  name?: string
  description?: string
  scripts?: Record<string, string>
  dependencies?: string[]
  devDependencies?: string[]
  stack: string[]
  envVars: string[]
  hasPrisma: boolean
  routeHints: string[]
}

async function readJSONSafe(p: string): Promise<any | null> {
  try { return JSON.parse(await readFile(p, 'utf-8')) } catch { return null }
}

// Extrae variables de entorno referenciadas (process.env.X) en el código.
async function findEnvVars(root: string, tree: string[]): Promise<string[]> {
  const found = new Set<string>()
  const codeFiles = tree.filter(t => CODE_EXT.test(t)).slice(0, 80)
  for (const rel of codeFiles) {
    try {
      const txt = await readFile(path.join(root, rel), 'utf-8')
      const re = /process\.env\.([A-Z0-9_]+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(txt))) found.add(m[1])
    } catch { /* ignora */ }
  }
  return [...found].sort()
}

// Detecta pistas de rutas/endpoints (app.use('/api/...'), router.get(...)).
async function findRouteHints(root: string, tree: string[]): Promise<string[]> {
  const hints = new Set<string>()
  const candidates = tree.filter(t => /index\.(ts|js)$|routes?\/|route\.(ts|js)$/i.test(t)).slice(0, 40)
  for (const rel of candidates) {
    try {
      const txt = await readFile(path.join(root, rel), 'utf-8')
      const re = /app\.use\(\s*['"](\/[^'"]+)['"]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(txt))) hints.add(m[1])
    } catch { /* ignora */ }
  }
  return [...hints].sort()
}

function inferStack(signals: { deps: string[]; byExt: Record<string, number>; hasPrisma: boolean }): string[] {
  const s = new Set<string>()
  const d = signals.deps
  if (d.includes('next')) s.add('Next.js')
  if (d.includes('react')) s.add('React')
  if (d.includes('express')) s.add('Express')
  if (d.includes('@prisma/client') || signals.hasPrisma) s.add('Prisma')
  if (d.some(x => x.includes('tailwind'))) s.add('Tailwind CSS')
  if (signals.byExt['.ts'] || signals.byExt['.tsx']) s.add('TypeScript')
  if (signals.byExt['.py']) s.add('Python')
  if (signals.byExt['.go']) s.add('Go')
  if (d.includes('openai') || d.some(x => x.includes('openrouter'))) s.add('OpenRouter / LLM')
  return [...s]
}

async function gatherSignals(root: string, map: RepoMap): Promise<ProjectSignals> {
  // package.json (raíz o backend/frontend)
  const pkgPaths = [
    path.join(root, 'package.json'),
    path.join(root, 'backend', 'package.json'),
    path.join(root, 'frontend', 'package.json'),
  ]
  let pkg: any = null
  for (const p of pkgPaths) { pkg = await readJSONSafe(p); if (pkg) break }

  const deps = pkg?.dependencies ? Object.keys(pkg.dependencies) : []
  const devDeps = pkg?.devDependencies ? Object.keys(pkg.devDependencies) : []
  const hasPrisma = map.tree.some(t => /schema\.prisma$/.test(t)) || deps.includes('@prisma/client')
  const envVars = await findEnvVars(root, map.tree)
  const routeHints = await findRouteHints(root, map.tree)

  return {
    name: pkg?.name,
    description: pkg?.description,
    scripts: pkg?.scripts,
    dependencies: deps,
    devDependencies: devDeps,
    stack: inferStack({ deps: [...deps, ...devDeps], byExt: map.byExt, hasPrisma }),
    envVars,
    hasPrisma,
    routeHints,
  }
}

// ── Composición del README ────────────────────────────────────────────────────

export interface DocResult {
  ok: boolean
  error?: string
  markdown?: string
  signals?: ProjectSignals
  written?: string         // ruta si se escribió a disco
}

/**
 * Escanea el repo y redacta el README. Si `write` es true, guarda el archivo
 * (por defecto NO escribe, para que el usuario revise primero).
 */
export async function generateReadme(
  repoPath: string,
  opts: { write?: boolean; fileName?: string; projectName?: string } = {}
): Promise<DocResult> {
  if (!repoPath) return { ok: false, error: 'Falta la ruta del repositorio.' }
  const root = path.resolve(repoPath)

  let map: RepoMap
  try { map = await walk(root) } catch (e: any) { return { ok: false, error: 'No se pudo leer el repositorio: ' + (e?.message || '') } }
  if (map.fileCount === 0) return { ok: false, error: 'No se encontraron archivos para documentar.' }

  const signals = await gatherSignals(root, map)
  const projectName = opts.projectName || signals.name || path.basename(root)
  const topDirs = map.topDirs

  // Estructura resumida para el prompt (no volcamos todo el árbol).
  const structure = map.tree.slice(0, 120).join('\n')
  const scripts = signals.scripts ? Object.entries(signals.scripts).map(([k, v]) => `${k}: ${v}`).join('\n') : '(sin scripts)'

  let aiBody = ''
  try {
    const parsed = await chatJSON(
      `Redacta un README.md técnico, profesional y limpio para este proyecto. En español. Usa secciones markdown con encabezados.\n\n` +
      `Nombre: ${projectName}\n` +
      `Descripción: ${signals.description || '(no especificada)'}\n` +
      `Stack detectado: ${signals.stack.join(', ') || 'n/d'}\n` +
      `Carpetas principales: ${topDirs.join(', ') || 'n/d'}\n` +
      `Scripts:\n${scripts}\n` +
      `Variables de entorno detectadas: ${signals.envVars.join(', ') || 'ninguna'}\n` +
      `Endpoints detectados: ${signals.routeHints.join(', ') || 'n/d'}\n\n` +
      `Estructura (parcial):\n${structure}\n\n` +
      `Responde SOLO con JSON:\n{ "body": "el contenido markdown COMPLETO del README, con secciones: descripción, características, stack, estructura del proyecto (explicando para qué sirve cada carpeta principal), requisitos, instalación, variables de entorno (tabla), scripts disponibles, arquitectura, y notas. Profesional y conciso. No inventes datos que no estén en las señales." }`,
      'Eres un technical writer senior. Escribes READMEs claros, bien estructurados y honestos (no inventas features). Respondes SOLO en JSON válido.',
      undefined,
      8000
    )
    aiBody = String(parsed?.body || '').trim()
  } catch (e: any) {
    return { ok: false, error: 'La redacción con IA falló: ' + (e?.message || '') }
  }

  // Encabezado con badges del stack + tabla de env vars garantizada (por si la IA la omite).
  const badges = signals.stack.map(s => `![](https://img.shields.io/badge/${encodeURIComponent(s)}-informational)`).join(' ')
  const envTable = signals.envVars.length
    ? `\n\n## Variables de entorno\n\n| Variable | Descripción |\n|----------|-------------|\n` +
      signals.envVars.map(v => `| \`${v}\` | — |`).join('\n')
    : ''

  const markdown = `# ${projectName}\n\n${badges}\n\n${aiBody}${aiBody.includes('Variables de entorno') ? '' : envTable}\n`

  let written: string | undefined
  if (opts.write) {
    const out = path.join(root, opts.fileName || 'README.generated.md')
    try { await writeFile(out, markdown, 'utf-8'); written = out }
    catch (e: any) { return { ok: false, error: 'No se pudo escribir el archivo: ' + (e?.message || ''), markdown, signals } }
  }

  return { ok: true, markdown, signals, written }
}
