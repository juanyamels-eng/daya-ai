// ============================================================================
// DAYA license audit — `node scripts/licencias.mjs`
//
// DAYA charges ($13/month), so dragging strong copyleft (GPL/AGPL/SSPL)
// would force opening the entire product. This script:
//   1. Groups DIRECT dependencies of backend and frontend by license.
//   2. Scans ALL of node_modules (including transitive) looking for copyleft.
//
// Read-only: does not install or modify anything. Requires npm install to have been run.
// The written and commented result lives in LICENCIAS.md.
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AREAS = ['backend', 'frontend']

// Strong copyleft and non-free licenses for commercial use. LGPL is excluded from
// the pattern on purpose: linking without modifying is acceptable (amber light).
const COPYLEFT = /GPL|AGPL|SSPL|CC-BY-NC|BUSL|Commons Clause/i

function licOf(dir) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const l = p.license || (Array.isArray(p.licenses) ? p.licenses.map(x => x.type).join('/') : p.licenses?.type)
    return { name: p.name, version: p.version, license: l || 'SIN LICENCIA' }
  } catch { return null }
}

const directas = {}
for (const area of AREAS) {
  const pkgPath = path.join(ROOT, area, 'package.json')
  if (!fs.existsSync(pkgPath)) continue
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  for (const dep of Object.keys(pkg.dependencies || {})) {
    const info = licOf(path.join(ROOT, area, 'node_modules', ...dep.split('/')))
    const key = info ? info.license : 'NO INSTALADO'
    ;(directas[key] ||= []).push(info ? `${dep}@${info.version}` : dep)
  }
}

console.log('=== DIRECT DEPENDENCIES by license ===')
for (const [lic, list] of Object.entries(directas).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n-- ${lic} (${list.length}) --\n   ` + [...new Set(list)].sort().join(', '))
}

console.log('\n=== FULL SCAN (includes transitive) ===')
const encontrados = []
let total = 0
function walk(dir, depth = 0) {
  if (depth > 6) return
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const full = path.join(dir, e.name)
    if (e.name === 'node_modules' || e.name.startsWith('@')) { walk(full, depth + 1); continue }
    const info = licOf(full)
    if (!info) continue
    total++
    if (COPYLEFT.test(info.license) && !/LGPL/i.test(info.license)) {
      encontrados.push(`${info.name}@${info.version} → ${info.license}`)
    }
    walk(path.join(full, 'node_modules'), depth + 1)
  }
}
for (const area of AREAS) walk(path.join(ROOT, area, 'node_modules'))

console.log(`Packages scanned: ${total}`)
if (encontrados.length) {
  console.log(`\n⚠️ Review (${encontrados.length}):`)
  for (const m of [...new Set(encontrados)].sort()) console.log('   ' + m)
  console.log('\nNOTE: a DUAL license like "(MIT OR GPL-3.0)" lets you choose MIT and is safe.')
} else {
  console.log('✅ No strong copyleft in the tree.')
}
