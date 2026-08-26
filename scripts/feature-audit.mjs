#!/usr/bin/env node
// Auditoría de features: cruza features del backend × rutas montadas ×
// referencias en el frontend × imports cruzados en el backend × tests.
// Uso: node scripts/feature-audit.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BE = join(ROOT, 'backend', 'src')
const FE = join(ROOT, 'frontend', 'src')
const FEATURES = join(BE, 'features')

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const featureDirs = readdirSync(FEATURES, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

const indexTs = readFileSync(join(BE, 'index.ts'), 'utf8')

console.error('[2] mapeando mounts…')
// mapa feature → prefijo montado
const mount = new Map()
for (const f of featureDirs) {
  const im = indexTs.match(new RegExp(`import\\s+(\\w+)Routes?\\s*=\\s*['"][^'"]*features/${esc(f)}/`, 'i'))
  if (!im) continue
  const um = [...indexTs.matchAll(new RegExp(`app\\.use\\('/api/([a-z0-9/-]+)',\\s*${im[1]}Routes?\\b`, 'gi'))]
  if (um.length) mount.set(f, um[0][1])
}

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|jsx)$/.test(e.name)) out.push(p)
  }
  return out
}

console.error('[3] caminando árboles…')
const feFiles = walk(FE)
const beAll = walk(BE)
const beTestFiles = beAll.filter(p => p.includes(`${join('__tests__')}${join('/')}`))
const beFiles = beAll.filter(p => !p.includes(`${join('features')}${join('/')}`))

// cache: lee cada archivo UNA vez
function hydrate(files) {
  return files.map(p => ({ p, src: readFileSync(p, 'utf8'), short: p.split(/[\\/]/).slice(-3).join('/') }))
}
const feCache = hydrate(feFiles)
const beCache = hydrate(beFiles.filter(x => {
  const low = x.toLowerCase()
  return true
}))
const testCache = hydrate(beTestFiles)

console.error(`[4] caches: fe=${feCache.length} be=${beCache.length} tests=${testCache.length}`)

function countRefs(cache, re) {
  let n = 0
  const where = new Set()
  for (const { src, short } of cache) {
    let m
    re.lastIndex = 0
    while ((m = re.exec(src))) {
      if (m.index === re.lastIndex) re.lastIndex++ // guarda anti-bucle
      n++; where.add(short)
    }
  }
  return { n, where: [...where].slice(0, 4).join(', ') }
}

// precalcula qué feature-folder contiene cada archivo del backend
const folderOf = new Map()
for (const { p } of beCache) {
  const norm = p.replace(/\\/g, '/')
  const m = /\/features\/([^/]+)\//.exec(norm)
  if (m) folderOf.set(p, m[1])
}

const rows = []
for (const f of featureDirs) {
  console.error('  ·', f)
  const ef = esc(f)
  const prefixes = new Set([f])
  if (mount.get(f)) prefixes.add(mount.get(f))

  // refs frontend: /api/<prefix> o '<prefix>/...'/`<prefix>/...` en axios relativo
  let fe = { n: 0, where: '' }
  for (const p of prefixes) {
    const ep = esc(p)
    const r = countRefs(feCache, new RegExp(`/api/${ep}(?![a-z-])|['"\`]${ep}/`, 'g'))
    if (r.n > fe.n) fe = r
  }

  // imports cruzados backend: features/<f> importado desde fuera de la propia carpeta
  const crossRe = new RegExp(`features/${ef}[/\\\\"']`, 'g')
  const outside = beCache.filter(({ p }) => folderOf.get(p) !== f)
  const cross = countRefs(outside, crossRe)

  const tests = countRefs(testCache, crossRe)

  let loc = 0
  for (const fp of walk(join(FEATURES, f))) loc += readFileSync(fp, 'utf8').split('\n').length

  rows.push({ f, prefix: mount.get(f) || '—', loc, fe: fe.n, feWhere: fe.where, cross: cross.n, crossWhere: cross.where, tests: tests.n })
}

rows.sort((a, b) => (a.fe + a.cross * 5 + a.tests * 10) - (b.fe + b.cross * 5 + b.tests * 10))
console.log('| feature | prefijo | LOC | refs FE | dónde (FE) | x-imports BE | tests |')
console.log('|---|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(`| ${r.f} | ${r.prefix} | ${r.loc} | ${r.fe} | ${r.feWhere || '—'} | ${r.cross}${r.crossWhere ? ' (' + r.crossWhere + ')' : ''} | ${r.tests} |`)
}
