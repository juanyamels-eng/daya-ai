#!/usr/bin/env node
// ============================================
// DAYA Code v2 — Agente de programación en tu terminal.
// Corre en TU máquina, dentro de TU proyecto: lee, edita y escribe archivos,
// busca en el código y ejecuta comandos reales. El "cerebro" vive en DAYA;
// tú solo necesitas un token.
//
// Uso:
//   daya-code login                   (una sola vez: guarda tu token en ~/.daya)
//   daya-code                         (modo interactivo)
//   daya-code "fix the login bug and run the tests"
//
// Opciones:
//   --yes        no pedir confirmación para escribir/editar/ejecutar
//   --continue   retoma la última sesión de esta carpeta (alias: -c)
//   --version    muestra la versión        --help   ayuda
// Variables:  DAYA_TOKEN (opcional, gana sobre ~/.daya) · DAYA_API_URL · DAYA_YES=1
// ============================================
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import readline from 'node:readline'
import { execSync, spawn } from 'node:child_process'

// Silencia solo el aviso cosmético de Node al lanzar servidores MCP en Windows
// (shell + args). Los comandos vienen del propio ~/.daya/mcp.json del usuario.
const _emitWarning = process.emitWarning.bind(process)
process.emitWarning = (w, ...rest) => {
  const code = (typeof rest[0] === 'object' && rest[0]?.code) || rest[1]
  if (code === 'DEP0190') return
  return _emitWarning(w, ...rest)
}

const VERSION = '3.2.0'
const API = (process.env.DAYA_API_URL || 'http://localhost:4000').replace(/\/+$/, '')
const SITE = process.env.DAYA_SITE_URL || 'http://localhost:3000'
const CONFIG_DIR = path.join(os.homedir(), '.daya')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

function savedToken() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).token || '' } catch { return '' }
}
const TOKEN = process.env.DAYA_TOKEN || savedToken()
const AUTO = process.argv.includes('--yes') || process.env.DAYA_YES === '1'
const CONT = process.argv.includes('--continue') || process.argv.includes('-c')
const PLAN = process.argv.includes('--plan')
// Cerebro: balanced (por defecto, híbrido) · glm (económico, GLM-5.2 al mando) · max (solo frontera)
const BRAIN_MODE = process.argv.includes('--glm') ? 'glm' : process.argv.includes('--max') ? 'max' : 'balanced'
// Modo dúo: al terminar, el OTRO modelo revisa el trabajo y el primero corrige.
const DUO = process.argv.includes('--duo') || process.argv.includes('--equipo')
// Quién revisa: si GLM lideró, revisa la frontera; si no, revisa GLM.
const REVIEWER = BRAIN_MODE === 'glm' ? 'sonnet' : 'glm'
const ROOT = process.cwd()

// ── Sesiones persistentes: una por carpeta de proyecto, en ~/.daya/sessions ──
const SESSION_DIR = path.join(CONFIG_DIR, 'sessions')
const SESSION_FILE = path.join(SESSION_DIR, crypto.createHash('sha1').update(ROOT.toLowerCase()).digest('hex').slice(0, 16) + '.json')

function saveSession(msgs) {
  try {
    const keep = msgs.length > 120 ? [msgs[0], ...msgs.slice(-100)] : msgs
    fs.mkdirSync(SESSION_DIR, { recursive: true })
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ root: ROOT, savedAt: new Date().toISOString(), messages: keep }))
  } catch {}
}
function loadSession() {
  try {
    const s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
    if (Array.isArray(s?.messages) && s.messages.length) return s
  } catch {}
  return null
}
function clearSession() { try { fs.rmSync(SESSION_FILE, { force: true }) } catch {} }

// ── Deshacer: copia el estado anterior de cada archivo ANTES de tocarlo, para
//    poder revertir el último cambio con /undo. Se guarda en memoria (la sesión
//    del CLI); es una red de seguridad rápida, no un control de versiones.
const undoStack = []
function pushUndo(relPath, absPath) {
  try {
    const before = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null
    undoStack.push({ path: relPath, abs: absPath, before })
    if (undoStack.length > 50) undoStack.shift()
  } catch {}
}

// ── Comandos destructivos: guard duro. Nunca los aprueba --yes ni la allowlist;
//    exigen un "sí" explícito (y en modo no interactivo se DENIEGAN siempre).
const DANGEROUS_RE = /\brm\s+(-\w*\s+)*-\w*[rf]|\brm\s+-[rf]|\brmdir\s+\/s|\bgit\s+reset\s+--hard|\bgit\s+clean\s+-\w*f|\bgit\s+push\s+.*--force|\bgit\s+push\s+-f\b|--force-with-lease|\bdd\s+if=|\bmkfs|\bformat\s+[a-z]:|>\s*\/dev\/sd|\bchmod\s+-R\s+777|\bchown\s+-R\b|:\(\)\s*\{|\bshutdown\b|\breboot\b|\bdel\s+\/[sq]|\brd\s+\/s|\btruncate\s+-s\s*0|\bsudo\b/i
const isDangerous = (cmd) => DANGEROUS_RE.test(cmd)

const MAX_STEPS = 40
const READ_CAP = 12000
const OUT_CAP = 10000
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.turbo', '.cache', 'coverage', '__pycache__', '.venv', 'venv'])

const c = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', cy: '\x1b[36m', mg: '\x1b[35m', x: '\x1b[0m' }
const log = (...a) => console.log(...a)

if (process.argv.includes('--version')) { log(`daya-code v${VERSION}`); process.exit(0) }
if (process.argv.includes('--help')) {
  log(`${c.b}DAYA Code v${VERSION}${c.x} — agente de código en tu terminal.

  ${c.dim}$${c.x} daya-code login          guarda tu token una sola vez (~/.daya)
  ${c.dim}$${c.x} daya-code ["tarea"]      ejecuta una tarea (o modo interactivo sin argumento)
  ${c.dim}$${c.x} daya-code --continue     retoma la última sesión de esta carpeta (alias: -c)
  ${c.dim}$${c.x} daya-code logout         borra el token guardado
  ${c.dim}$${c.x} daya-code opencode       conecta tu cuenta con OpenCode (opencode.ai)

  Herramientas que el agente puede usar en tu proyecto:
    read_file · edit_file · write_file · list_dir · search_files · run_command
    ver_imagen (capturas y mockups) · delegar_exploracion (subagentes en paralelo)

  Opciones:
    --yes       ejecuta sin pedir confirmación
    --plan      presenta un plan y espera tu aprobación antes de actuar
    --glm       modo económico: GLM-5.2 lleva todo (frontera solo ante errores/imágenes)
    --max       máxima calidad: modelo de frontera en cada paso
    --duo       al terminar, el otro modelo revisa el trabajo y se corrige lo que falle
    --version   versión del CLI

  En modo interactivo:  /undo revierte · /mcp lista servidores MCP · /clear reinicia · /permisos · "salir" termina.

  MCP: conecta herramientas externas configurándolas en ~/.daya/mcp.json
    { "servers": { "nombre": { "command": "npx", "args": ["-y", "@paquete/servidor"] } } }

  Seguridad: los comandos destructivos (rm -rf, git reset --hard, push --force…) exigen
  confirmación explícita SIEMPRE, aunque uses --yes.
`)
  process.exit(0)
}

const SUBCMD = (process.argv[2] || '').toLowerCase()

// ── login / logout: token persistente en ~/.daya/config.json ──
if (SUBCMD === 'logout') {
  try { fs.rmSync(CONFIG_FILE, { force: true }) } catch {}
  log(`${c.g}Sesión cerrada.${c.x} Token eliminado de ${CONFIG_FILE}`)
  process.exit(0)
}
if (SUBCMD === 'login') {
  const rlLogin = readline.createInterface({ input: process.stdin, output: process.stdout })
  const askOnce = (q) => new Promise((res) => rlLogin.question(q, res))
  log(`${c.b}DAYA Code — login${c.x}`)
  log(`1. Abre ${c.cy}${SITE}${c.x} → Ajustes → ${c.b}Tokens de API${c.x} y crea un token.`)
  try {
    const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    execSync(`${opener} ${SITE}/dashboard`, { stdio: 'ignore', timeout: 5000 })
    log(`${c.dim}   (Abrí el navegador por ti.)${c.x}`)
  } catch {}
  const pasted = (await askOnce('2. Pega aquí tu token (dy_...): ')).trim()
  rlLogin.close()
  if (!/^dy_[A-Za-z0-9_-]{8,}$/.test(pasted)) {
    log(`${c.r}Eso no parece un token de DAYA (empieza con dy_).${c.x}`)
    process.exit(1)
  }
  // Verificación real contra el backend: 401 = inválido; cualquier otra cosa = válido.
  try {
    const res = await fetch(`${API}/api/codeagent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pasted}` },
      body: JSON.stringify({}),
    })
    if (res.status === 401) { log(`${c.r}El token fue rechazado por el servidor (inválido o revocado).${c.x}`); process.exit(1) }
  } catch {
    log(`${c.y}No pude verificar el token (sin conexión con ${API}); lo guardo de todas formas.${c.x}`)
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ token: pasted, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 })
  log(`${c.g}Listo.${c.x} Token guardado en ${CONFIG_FILE} — ya puedes usar: ${c.b}daya-code "tu tarea"${c.x}`)
  process.exit(0)
}

// ── daya-code opencode ──────────────────────────────────────────────────────
// Conecta DAYA con OpenCode (https://opencode.ai, MIT — proyecto de terceros,
// no es nuestro). DAYA expone una API compatible con OpenAI, así que OpenCode
// puede usar tu cuenta, tus modelos y tu cuota como un proveedor más. No se
// instala ni se redistribuye nada suyo: solo se escribe su archivo de config.
if (SUBCMD === 'opencode') {
  if (!TOKEN) {
    log(`${c.r}Primero necesitas un token.${c.x} Ejecuta ${c.b}daya-code login${c.x} y vuelve a intentarlo.`)
    process.exit(1)
  }
  log(`${c.b}Conectando DAYA con OpenCode…${c.x}`)

  // 1. Pedimos el catálogo al backend: de paso valida token y plan, y los ids
  //    tienen que salir de aquí (OpenCode exige que coincidan con /v1/models).
  let models = []
  try {
    // Con tiempo límite: sin él, un backend caído deja el comando colgado para
    // siempre sin decir nada.
    const r = await fetch(`${API}/v1/models`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(20000),
    })
    if (r.status === 401) { log(`${c.r}Tu token fue rechazado.${c.x} Ejecuta ${c.b}daya-code login${c.x} de nuevo.`); process.exit(1) }
    if (r.status === 403) { log(`${c.r}La API de DAYA es del plan Pro.${c.x} Mejora tu plan en ${c.cy}${SITE}/planes${c.x}`); process.exit(1) }
    const j = await r.json()
    models = Array.isArray(j?.data) ? j.data : []
  } catch (e) {
    log(`${c.r}No pude hablar con ${API}.${c.x} ${e.message}`)
    process.exit(1)
  }
  if (!models.length) { log(`${c.r}El servidor no devolvió modelos.${c.x}`); process.exit(1) }

  // 2. Merge NO destructivo sobre su config global.
  const OC_DIR = path.join(os.homedir(), '.config', 'opencode')
  const OC_FILE = path.join(OC_DIR, 'opencode.json')
  let cfg = {}
  if (fs.existsSync(OC_FILE)) {
    try {
      cfg = JSON.parse(fs.readFileSync(OC_FILE, 'utf8'))
    } catch {
      log(`${c.r}Tu ${OC_FILE} no es JSON válido.${c.x} No voy a tocarlo: arréglalo y vuelve a intentarlo.`)
      process.exit(1)
    }
    const bak = `${OC_FILE}.bak-${Date.now()}`
    try { fs.copyFileSync(OC_FILE, bak); log(`${c.dim}Copia de seguridad: ${bak}${c.x}`) } catch {}
  }

  cfg.$schema = cfg.$schema || 'https://opencode.ai/config.json'
  cfg.provider = cfg.provider || {}
  cfg.provider.daya = {
    npm: '@ai-sdk/openai-compatible',
    name: 'DAYA',
    options: { baseURL: `${API}/v1`, apiKey: TOKEN },
    models: Object.fromEntries(models.map((m) => [m.id, { name: m.name || m.id }])),
  }
  // El modelo por defecto solo se pone si no había uno: si ya usas OpenCode con
  // otro proveedor, no te lo cambiamos por debajo.
  const yaTenia = !!cfg.model
  if (!yaTenia) cfg.model = 'daya/daya'

  try {
    fs.mkdirSync(OC_DIR, { recursive: true })
    fs.writeFileSync(OC_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  } catch (e) {
    log(`${c.r}No pude escribir ${OC_FILE}:${c.x} ${e.message}`)
    process.exit(1)
  }

  log(`${c.g}Listo.${c.x} DAYA quedó configurado en ${c.dim}${OC_FILE}${c.x}`)
  log(`\n  Modelos disponibles en OpenCode:`)
  for (const m of models) log(`    ${c.cy}daya/${m.id}${c.x}${' '.repeat(Math.max(1, 18 - m.id.length))}${c.dim}${m.name || ''}${c.x}`)
  log(`\n  ${c.b}Ahora:${c.x}`)
  log(`    ${c.dim}$${c.x} opencode                 ${c.dim}(si no lo tienes: npm i -g opencode-ai)${c.x}`)
  if (yaTenia) log(`    Dentro, elige el modelo con ${c.b}/models${c.x} → DAYA. (No toqué tu modelo por defecto: ${c.dim}${cfg.model}${c.x})`)
  log(`\n  ${c.dim}Las llamadas consumen cuota según lo que cuestan: una ligera vale 1 mensaje,`)
  log(`  una que manda medio proyecto vale más. Elegir un modelo caro también gasta más.`)
  log(`  OpenCode es un proyecto independiente (MIT, opencode.ai); DAYA solo actúa de proveedor.${c.x}`)
  process.exit(0)
}

if (!TOKEN) {
  log(`${c.r}No hay token de DAYA.${c.x} Ejecuta ${c.b}daya-code login${c.x} (o exporta DAYA_TOKEN=dy_xxxxx).`)
  process.exit(1)
}

// ── Utilidades ──
const safe = (p) => {
  const f = path.resolve(ROOT, p || '.')
  if (f !== ROOT && !f.startsWith(ROOT + path.sep)) throw new Error('ruta fuera del proyecto')
  return f
}
const rel = (f) => path.relative(ROOT, f) || '.'
const cap = (s, n) => (s.length > n ? s.slice(0, n) + `\n… (truncado: ${s.length} caracteres en total)` : s)
const INTERACTIVE = process.stdin.isTTY === true
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
// Blindaje: si stdin se cerró (pipe/EOF), question lanza; respondemos vacío (= denegar).
const ask = (q) => new Promise((res) => { try { rl.question(q, res) } catch { res('') } })
// Ctrl+C: salida limpia con la sesión guardada (readline captura el SIGINT).
rl.on('SIGINT', () => process.emit('SIGINT'))
process.on('SIGINT', () => {
  try { if (messages.length) saveSession(messages) } catch {}
  console.log(`\n${c.dim}Sesión guardada. Retómala con --continue.${c.x}`)
  process.exit(0)
})

// Permisos con memoria: "t" aprueba y no vuelve a preguntar por lo mismo (el
// MISMO comando, o todas las escrituras) — y se RECUERDA para este proyecto
// entre sesiones (~/.daya/allow.json). Gestión: /permisos y /permisos reset.
const ALLOW_FILE = path.join(CONFIG_DIR, 'allow.json')
const PROJECT_KEY = crypto.createHash('sha1').update(ROOT.toLowerCase()).digest('hex').slice(0, 16)

function loadAllowFile() {
  try { return JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8')) || {} } catch { return {} }
}
const sessionAllow = new Set(Array.isArray(loadAllowFile()[PROJECT_KEY]) ? loadAllowFile()[PROJECT_KEY] : [])

function persistAllow() {
  try {
    const j = loadAllowFile()
    j[PROJECT_KEY] = [...sessionAllow]
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    fs.writeFileSync(ALLOW_FILE, JSON.stringify(j, null, 2))
  } catch {}
}

async function confirm(desc, preview, allowKey) {
  if (AUTO) return true
  if (allowKey && sessionAllow.has(allowKey)) return true
  // Sin terminal interactiva no hay forma de preguntar: se deniega con claridad
  // (para scripts/CI, usa --yes o DAYA_YES=1).
  if (!INTERACTIVE) {
    log(`${c.y}Acción denegada (sin terminal interactiva para confirmar): ${desc}. Usa --yes para aprobar automáticamente.${c.x}`)
    return false
  }
  if (preview) log(preview)
  const hint = allowKey ? ' [s=sí · N=no · t=siempre en este proyecto]' : ' [s/N]'
  const a = (await ask(`${c.y}¿Permitir ${desc}?${hint} ${c.x}`)).trim().toLowerCase()
  if (allowKey && (a === 't' || a === 'todos' || a === 'a' || a === 'always')) {
    sessionAllow.add(allowKey)
    persistAllow()
    return true
  }
  return a === 's' || a === 'si' || a === 'sí' || a === 'y' || a === 'yes'
}

// Coincidencia tolerante a espacios: si el texto exacto no aparece (típico por
// una diferencia de indentación o espacios al final), casa por líneas ignorando
// esos espacios. Devuelve las posiciones de línea donde empieza cada coincidencia.
function fuzzyFindSpans(fileText, oldText) {
  const fileLines = fileText.split('\n')
  const oldLines = oldText.split('\n')
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  const oldNorm = oldLines.map(norm)
  const spans = []
  for (let i = 0; i + oldLines.length <= fileLines.length; i++) {
    let ok = true
    for (let j = 0; j < oldLines.length; j++) {
      if (norm(fileLines[i + j]) !== oldNorm[j]) { ok = false; break }
    }
    if (ok) spans.push(i)
  }
  return spans
}

// Vista previa tipo diff (rojo lo que sale, verde lo que entra), con tope de líneas.
function diffPreview(oldText, newText) {
  const out = []
  const o = String(oldText).split('\n')
  const n = String(newText).split('\n')
  for (const l of o.slice(0, 6)) out.push(`${c.r}- ${l.slice(0, 110)}${c.x}`)
  if (o.length > 6) out.push(`${c.dim}  … ${o.length - 6} líneas más que salen${c.x}`)
  for (const l of n.slice(0, 6)) out.push(`${c.g}+ ${l.slice(0, 110)}${c.x}`)
  if (n.length > 6) out.push(`${c.dim}  … ${n.length - 6} líneas más que entran${c.x}`)
  return out.join('\n')
}

// Estadísticas de la tarea en curso (para el resumen final).
const taskStats = { files: new Set(), commands: 0, subagents: 0 }
function resetStats() { taskStats.files.clear(); taskStats.commands = 0; taskStats.subagents = 0 }
function statsLine() {
  const parts = []
  if (taskStats.files.size) parts.push(`${taskStats.files.size} archivo${taskStats.files.size > 1 ? 's' : ''}`)
  if (taskStats.commands) parts.push(`${taskStats.commands} comando${taskStats.commands > 1 ? 's' : ''}`)
  if (taskStats.subagents) parts.push(`${taskStats.subagents} subagente${taskStats.subagents > 1 ? 's' : ''}`)
  return parts.length ? ` · ${parts.join(' · ')}` : ''
}

// ── Herramientas locales (se ejecutan en TU máquina) ──
function* walk(dir, depth = 0) {
  if (depth > 8) return
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.env.example') continue
    if (IGNORE_DIRS.has(e.name)) continue
    const f = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(f, depth + 1)
    else yield f
  }
}

async function runTool(name, args) {
  try {
    if (name === 'read_file') {
      const text = fs.readFileSync(safe(args.path), 'utf8')
      const lines = text.split('\n')
      const offset = Math.max(0, (args.offset | 0))
      const limit = args.limit > 0 ? args.limit : 400
      const slice = lines.slice(offset, offset + limit).join('\n')
      const head = `[${args.path} · ${lines.length} líneas · mostrando ${offset + 1}-${Math.min(offset + limit, lines.length)}]\n`
      return cap(head + slice, READ_CAP)
    }
    if (name === 'list_dir') {
      return fs.readdirSync(safe(args.path || '.'), { withFileTypes: true })
        .filter((d) => !IGNORE_DIRS.has(d.name))
        .map((d) => (d.isDirectory() ? d.name + '/' : d.name)).join('\n') || '(carpeta vacía)'
    }
    if (name === 'search_files') {
      const q = String(args.query || '')
      if (!q) return 'ERROR: falta query.'
      let re
      try { re = new RegExp(q, 'i') } catch { re = null }
      const results = []
      for (const f of walk(safe(args.path || '.'))) {
        if (results.length >= 60) break
        let text
        try { text = fs.readFileSync(f, 'utf8') } catch { continue }
        if (text.length > 1_500_000) continue
        const lines = text.split('\n')
        for (let i = 0; i < lines.length && results.length < 60; i++) {
          if (re ? re.test(lines[i]) : lines[i].includes(q)) {
            results.push(`${rel(f)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
          }
        }
      }
      return results.length ? results.join('\n') : `Sin coincidencias para "${q}".`
    }
    if (name === 'edit_file') {
      const f = safe(args.path)
      const old = String(args.old_text ?? '')
      const neu = String(args.new_text ?? '')
      if (!old) return 'ERROR: old_text vacío. Para crear un archivo usa write_file.'
      const text = fs.readFileSync(f, 'utf8')
      let count = text.split(old).length - 1
      let exactOld = old   // el texto REALMENTE presente en el archivo (puede diferir en espacios)
      let note = ''
      if (count === 0) {
        // Fallback tolerante a espacios/indentación (causa #1 de fallos de edición).
        const spans = fuzzyFindSpans(text, old)
        if (spans.length === 0) return 'ERROR: old_text no aparece en el archivo (ni siquiera ignorando espacios). Lee el archivo de nuevo y usa el texto actual.'
        if (spans.length > 1 && !args.all) return `ERROR: old_text coincide en ${spans.length} lugares (ignorando espacios). Añade más contexto único o pasa all=true.`
        const fileLines = text.split('\n')
        exactOld = fileLines.slice(spans[0], spans[0] + old.split('\n').length).join('\n')
        count = spans.length
        note = ' (ajustado por espacios)'
      } else if (count > 1 && !args.all) {
        return `ERROR: old_text aparece ${count} veces. Hazlo más específico o pasa all=true.`
      }
      if (!(await confirm(`editar ${c.b}${args.path}${c.x}`, diffPreview(exactOld, neu), 'write'))) return 'El usuario denegó la edición.'
      pushUndo(args.path, f)
      fs.writeFileSync(f, args.all ? text.split(exactOld).join(neu) : text.replace(exactOld, neu))
      taskStats.files.add(args.path)
      return `Editado ${args.path} (${count} reemplazo${count > 1 ? 's' : ''})${note}.`
    }
    if (name === 'plan_tareas') {
      const tareas = Array.isArray(args.tareas) ? args.tareas : []
      if (!tareas.length) return 'ERROR: envía al menos una tarea.'
      log(`${c.b}Plan de tareas:${c.x}`)
      for (const t of tareas) {
        const e = String(t?.estado || 'pendiente')
        const mark = e === 'hecho' ? `${c.g}✓${c.x}` : e === 'en_progreso' ? `${c.y}▸${c.x}` : `${c.dim}○${c.x}`
        const txt = e === 'hecho' ? `${c.dim}${t.texto}${c.x}` : t.texto
        log(`  ${mark} ${txt}`)
      }
      const hechas = tareas.filter((t) => t?.estado === 'hecho').length
      return `Plan actualizado (${hechas}/${tareas.length} completadas).`
    }
    if (name === 'write_file') {
      const content = String(args.content ?? '')
      const exists = fs.existsSync(safe(args.path))
      const head = content.split('\n').slice(0, 5).map((l) => `${c.g}+ ${l.slice(0, 110)}${c.x}`).join('\n')
      const preview = `${c.dim}${exists ? 'SOBREESCRIBE' : 'crea'} · ${content.length} bytes · ${content.split('\n').length} líneas${c.x}\n${head}`
      if (!(await confirm(`escribir ${c.b}${args.path}${c.x}`, preview, 'write'))) return 'El usuario denegó la escritura.'
      const f = safe(args.path)
      pushUndo(args.path, f)
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, content)
      taskStats.files.add(args.path)
      return `Escrito ${args.path} (${content.length} bytes).`
    }
    if (name === 'ver_imagen') {
      const f = safe(args.path)
      const ext = path.extname(f).toLowerCase()
      const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
      if (!mimes[ext]) return 'ERROR: solo imágenes png, jpg, webp o gif.'
      const st = fs.statSync(f)
      if (st.size > 4 * 1024 * 1024) return 'ERROR: la imagen supera 4MB.'
      const b64 = fs.readFileSync(f).toString('base64')
      pendingImages.push({ path: args.path, dataUri: `data:${mimes[ext]};base64,${b64}` })
      return `Imagen ${args.path} (${Math.round(st.size / 1024)} KB) adjuntada: la verás en el siguiente paso.`
    }
    if (name === 'run_command') {
      const cmd = String(args.command || '').trim()
      if (isDangerous(cmd)) {
        // Guard duro: ni --yes ni la allowlist saltan esto. Sin TTY se deniega.
        if (!INTERACTIVE) return `COMANDO PELIGROSO BLOQUEADO (sin terminal para confirmar): ${cmd}. Reformula la tarea sin comandos destructivos.`
        log(`${c.r}⚠ Comando potencialmente destructivo:${c.x} ${c.b}${cmd}${c.x}`)
        const a = (await ask(`${c.r}Escribe "confirmo" para ejecutarlo (cualquier otra cosa lo cancela): ${c.x}`)).trim().toLowerCase()
        if (a !== 'confirmo') return `El usuario canceló el comando destructivo: ${cmd}.`
      } else {
        if (!(await confirm(`ejecutar ${c.b}${cmd}${c.x}`, '', `cmd:${cmd}`))) return 'El usuario denegó el comando.'
      }
      taskStats.commands++
      try {
        const out = execSync(cmd, { cwd: ROOT, timeout: 120000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
        return cap(out, OUT_CAP) || '(sin salida, exit 0)'
      } catch (e) {
        const out = [e.stdout, e.stderr].filter(Boolean).join('\n')
        return cap(`EXIT ${e.status ?? '?'}:\n${out || e.message}`, OUT_CAP)
      }
    }
    return `Herramienta desconocida: ${name}`
  } catch (e) {
    return 'ERROR: ' + String(e.message || e).slice(0, 3000)
  }
}

// ── Contexto inicial del proyecto: el agente no empieza ciego ──
function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

function projectTree() {
  const lines = []
  const walkTree = (dir, prefix, depth) => {
    if (depth > 2 || lines.length >= 120) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (lines.length >= 120) return
      if (e.name.startsWith('.') || IGNORE_DIRS.has(e.name)) continue
      lines.push(prefix + e.name + (e.isDirectory() ? '/' : ''))
      if (e.isDirectory()) walkTree(path.join(dir, e.name), prefix + '  ', depth + 1)
    }
  }
  walkTree(ROOT, '', 0)
  return lines.join('\n')
}

function projectContext() {
  const parts = []
  const osName = process.platform === 'win32' ? 'Windows (los comandos de shell corren en cmd/PowerShell: usa dir, type, rutas con \\)'
    : process.platform === 'darwin' ? 'macOS' : 'Linux'
  parts.push(`Sistema: ${osName} · Node ${process.version} · Carpeta: ${ROOT}`)
  const branch = sh('git rev-parse --abbrev-ref HEAD')
  if (branch) {
    const status = sh('git status --short').slice(0, 1200)
    const remote = sh('git remote get-url origin')
    const gitUser = sh('git config user.name')
    parts.push(`Git: rama ${branch}${remote ? ` · remoto ${remote}` : ' · sin remoto configurado'}${gitUser ? '' : ' · ¡falta git config user.name/email para poder commitear!'}\n${status || '(árbol limpio)'}`)
  } else {
    parts.push('Git: esta carpeta NO es un repositorio (usa "git init" si hay que versionar).')
  }
  // Herramientas disponibles en la máquina (para instalar, publicar en GitHub, etc.)
  const tools = []
  const ver = (cmd, label) => { const v = sh(cmd); if (v) tools.push(`${label} ${v.split('\n')[0].slice(0, 40)}`) }
  ver('node --version', 'node'); ver('npm --version', 'npm'); ver('python --version', 'python'); ver('git --version', 'git')
  const gh = sh('gh --version')
  if (gh) {
    const ghAuth = sh('gh auth status') // vacío si no está autenticado
    tools.push(`gh CLI ${/Logged in|logged in/i.test(ghAuth) ? 'AUTENTICADO (puedes crear y subir repos con: gh repo create <nombre> --source=. --push)' : 'presente pero SIN autenticar (el usuario debe correr: gh auth login)'}`)
  } else {
    tools.push('gh CLI no instalado (para subir a GitHub: git push a un remoto ya configurado, o pídele al usuario que instale/autentique gh)')
  }
  if (tools.length) parts.push(`Herramientas: ${tools.join(' · ')}`)
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    parts.push(`package.json: ${pkg.name || '(sin nombre)'} · scripts: ${Object.keys(pkg.scripts || {}).join(', ') || '(ninguno)'} · deps: ${Object.keys(pkg.dependencies || {}).slice(0, 25).join(', ') || '(ninguna)'}`)
  } catch {}
  for (const f of ['DAYA.md', 'CLAUDE.md', 'AGENTS.md']) {
    try {
      const rules = fs.readFileSync(path.join(ROOT, f), 'utf8').slice(0, 4000)
      parts.push(`${f} (REGLAS DEL PROYECTO — respétalas):\n${rules}`)
      break
    } catch {}
  }
  const tree = projectTree()
  if (tree) parts.push(`Estructura (2 niveles):\n${tree}`)
  return `[Contexto del proyecto — generado automáticamente por el CLI]\n\n${parts.join('\n\n')}`
}

// ── Subagente explorador: solo lectura, corre en paralelo, contexto propio ──
const EXPLORER_ALLOWED = new Set(['read_file', 'list_dir', 'search_files'])

async function runExplorer(objetivo) {
  const osName = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'
  const sub = [{ role: 'user', content: `Sistema: ${osName} · Carpeta del proyecto: ${ROOT}\n\nOBJETIVO:\n${objetivo}` }]
  for (let i = 0; i < 8; i++) {
    let r
    try { r = await step(null, sub, 'explorer') } catch (e) { return `El subagente falló: ${e.message}` }
    const msg = r.message
    if (!msg) return 'El subagente no respondió.'
    if (msg.tool_calls?.length) {
      sub.push(msg)
      for (const tc of msg.tool_calls) {
        let args = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
        // Seguridad: el subagente SOLO puede leer. Cualquier otra cosa se rechaza.
        const out = EXPLORER_ALLOWED.has(tc.function.name)
          ? await runTool(tc.function.name, args)
          : 'Herramienta no permitida para el subagente (solo lectura).'
        log(`  ${c.dim}▸ ${tc.function.name} ${String(args.path || args.query || '').slice(0, 80)}${c.x}`)
        sub.push({ role: 'tool', tool_call_id: tc.id, content: out })
      }
      continue
    }
    return msg.content || '(el subagente terminó sin informe)'
  }
  return 'El subagente agotó sus pasos sin concluir. Considera explorar directamente.'
}

// ══════════════════════════════════════════════════════════════════════════════
// MCP (Model Context Protocol): conecta servidores de herramientas externos.
// Config en ~/.daya/mcp.json: { "servers": { "nombre": { "command": "npx",
// "args": ["-y","@modelcontextprotocol/server-filesystem","."], "env": {...} } } }
// Cada servidor se lanza como subproceso (stdio, JSON-RPC 2.0 por líneas), se hace
// el handshake, se listan sus tools y se ofrecen al modelo como mcp__<srv>__<tool>.
// ══════════════════════════════════════════════════════════════════════════════
const MCP_FILE = path.join(CONFIG_DIR, 'mcp.json')
const mcpClients = new Map()   // servidor → { proc, send, tools }
let mcpTools = []              // esquemas OpenAI para el modelo

function mcpConfig() {
  try { return JSON.parse(fs.readFileSync(MCP_FILE, 'utf8'))?.servers || {} } catch { return {} }
}

// Cliente JSON-RPC mínimo sobre stdio (framing por líneas newline-delimited).
function startMcpServer(name, cfg) {
  return new Promise((resolve) => {
    let proc
    try {
      proc = spawn(cfg.command, cfg.args || [], {
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, ...(cfg.env || {}) },
        shell: process.platform === 'win32',
      })
    } catch { return resolve(null) }

    let nextId = 1
    const pending = new Map()
    let buf = ''
    proc.stdout.on('data', (d) => {
      buf += d.toString()
      let nl
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
        if (!line) continue
        let msg; try { msg = JSON.parse(line) } catch { continue }
        if (msg.id != null && pending.has(msg.id)) {
          const { resolve: r } = pending.get(msg.id); pending.delete(msg.id)
          r(msg.error ? { error: msg.error } : { result: msg.result })
        }
      }
    })
    proc.on('error', () => resolve(null))
    proc.on('exit', () => { for (const { resolve: r } of pending.values()) r({ error: { message: 'servidor MCP terminó' } }); pending.clear() })

    const rpc = (method, params) => new Promise((r) => {
      const id = nextId++
      pending.set(id, { resolve: r })
      try { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n') } catch { r({ error: { message: 'no se pudo escribir' } }) }
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); r({ error: { message: 'timeout' } }) } }, 30000)
    })
    const notify = (method, params) => { try { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n') } catch {} }

    ;(async () => {
      const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'daya-code', version: VERSION } })
      if (init.error) { try { proc.kill() } catch {}; return resolve(null) }
      notify('notifications/initialized', {})
      const listed = await rpc('tools/list', {})
      const tools = listed.result?.tools || []
      resolve({ proc, rpc, tools, name })
    })()
  })
}

async function initMcp() {
  const servers = mcpConfig()
  const names = Object.keys(servers)
  if (!names.length) return
  for (const name of names) {
    if (!/^[a-z0-9_.-]{1,40}$/i.test(name)) continue
    const client = await startMcpServer(name, servers[name])
    if (!client) { log(`${c.y}MCP: no pude iniciar el servidor "${name}".${c.x}`); continue }
    mcpClients.set(name, client)
    for (const t of client.tools) {
      const full = `mcp__${name}__${t.name}`.slice(0, 90)
      mcpTools.push({ type: 'function', function: { name: full, description: (t.description || `Herramienta ${t.name} del servidor MCP ${name}`).slice(0, 600), parameters: t.inputSchema || { type: 'object', properties: {} } } })
    }
    log(`${c.dim}MCP · ${name}: ${client.tools.length} herramienta${client.tools.length === 1 ? '' : 's'} disponible${client.tools.length === 1 ? '' : 's'}.${c.x}`)
  }
}

async function callMcpTool(fullName, args) {
  const m = /^mcp__([^_]+(?:[_.-][^_]+)*?)__(.+)$/.exec(fullName)
  if (!m) return `ERROR: nombre de herramienta MCP inválido: ${fullName}`
  // El servidor es el segmento entre mcp__ y el último __tool; reconstruimos por prefijo conocido.
  let server = null, tool = null
  for (const name of mcpClients.keys()) {
    const pref = `mcp__${name}__`
    if (fullName.startsWith(pref)) { server = name; tool = fullName.slice(pref.length); break }
  }
  if (!server) return `ERROR: servidor MCP no encontrado para ${fullName}`
  const client = mcpClients.get(server)
  const res = await client.rpc('tools/call', { name: tool, arguments: args || {} })
  if (res.error) return `ERROR MCP (${server}/${tool}): ${res.error.message || JSON.stringify(res.error)}`
  // El resultado MCP es { content: [{type:'text',text}], ... }: extraemos el texto.
  const content = res.result?.content
  if (Array.isArray(content)) return content.map((p) => p?.text || (p?.type === 'image' ? '[imagen]' : JSON.stringify(p))).join('\n').slice(0, OUT_CAP) || '(sin salida)'
  return cap(JSON.stringify(res.result ?? {}), OUT_CAP)
}

function shutdownMcp() {
  for (const { proc } of mcpClients.values()) { try { proc.kill() } catch {} }
}

// ── Bucle del agente: pide el siguiente paso al backend y ejecuta ──
let messages = []
// Imágenes pedidas con ver_imagen: se adjuntan como mensaje multimodal tras
// los resultados de herramientas (el cerebro de frontera tiene visión).
const pendingImages = []

// Revisión cruzada (modo dúo): pide al segundo modelo que revise el trabajo.
async function reviewStep() {
  try {
    const res = await fetch(`${API}/api/codeagent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ messages, review: true, reviewer: REVIEWER }),
    })
    if (!res.ok) return { ok: true, feedback: '' }
    return (await res.json()).review || { ok: true, feedback: '' }
  } catch { return { ok: true, feedback: '' } }
}

function trimHistory() {
  // Compactación: los resultados de herramientas ANTIGUOS se recortan (el modelo
  // ya actuó sobre ellos); solo los últimos 30 mensajes conservan el detalle.
  const cutoff = messages.length - 30
  for (let i = 0; i < cutoff; i++) {
    const m = messages[i]
    if (m?.role === 'tool' && typeof m.content === 'string' && m.content.length > 400) {
      m.content = m.content.slice(0, 300) + '\n…[recortado: resultado antiguo, ya procesado]'
    }
  }
  // Y si aun así la conversación crece demasiado, recorta conservando la tarea inicial.
  if (messages.length <= 120) return
  messages = [messages[0], { role: 'user', content: '[Historial recortado por longitud. Continúa la tarea.]' }, ...messages.slice(-80)]
}

// Pide el siguiente paso al cerebro. Si el servidor soporta streaming (SSE),
// `onDelta` recibe el texto en vivo; si no (backend antiguo), cae a JSON clásico.
// `msgsOverride`/`agent`: los usa el subagente explorador (sin stream, sin tocar
// la conversación principal).
async function step(onDelta, msgsOverride, agent) {
  const body = agent
    ? JSON.stringify({ messages: msgsOverride, agent })
    : JSON.stringify({ messages, stream: true, mode: BRAIN_MODE, ...(mcpTools.length ? { extraTools: mcpTools } : {}) })
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(`${API}/api/codeagent/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body,
      })
    } catch (e) {
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
      throw new Error(`sin conexión con ${API} (${e.message})`)
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      // 429 con mensaje = cuota del plan agotada → no reintentar, avisar ya.
      const isQuota = res.status === 429 && d.error
      if ([429, 502, 503].includes(res.status) && !isQuota && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        continue
      }
      throw new Error(d.error || `HTTP ${res.status}`)
    }

    const ctype = res.headers.get('content-type') || ''
    if (!ctype.includes('text/event-stream')) {
      return { message: (await res.json()).message, streamed: false }
    }

    // SSE: cada evento es una línea "data: {json}" separada por línea en blanco.
    const decoder = new TextDecoder()
    let buf = ''
    let finalMsg = null
    let streamed = false
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data: ')) continue
          let ev
          try { ev = JSON.parse(line.slice(6)) } catch { continue }
          if (ev.type === 'text' && ev.delta) { streamed = true; if (onDelta) onDelta(ev.delta) }
          else if (ev.type === 'done') finalMsg = ev.message
          else if (ev.type === 'error') throw new Error(ev.error || 'El modelo no respondió.')
        }
      }
    }
    if (!finalMsg) throw new Error('El stream terminó sin mensaje final. Intenta de nuevo.')
    return { message: finalMsg, streamed }
  }
}

async function handleTask(task) {
  // La primera tarea de la conversación lleva el contexto del proyecto delante.
  if (messages.length === 0) {
    task = `${projectContext()}\n\n=== TAREA DEL USUARIO ===\n${task}`
    if (PLAN) {
      task += `\n\n[MODO PLAN] Antes de tocar nada: explora lo mínimo necesario, presenta un plan numerado corto (3-7 pasos concretos) y termina preguntando "¿Procedo?". NO uses herramientas de escritura ni de ejecución hasta que el usuario apruebe en su siguiente mensaje.`
    }
  }
  messages.push({ role: 'user', content: task })
  resetStats()
  let reviewsDone = 0
  const t0 = Date.now()
  for (let i = 0; i < MAX_STEPS; i++) {
    trimHistory()
    // El texto del modelo se imprime EN VIVO según llega (streaming).
    let live = false
    const onDelta = (d) => {
      if (!live) { live = true; process.stdout.write(`\n${c.g}`) }
      process.stdout.write(d)
    }
    let r
    try { r = await step(onDelta) } catch (e) {
      if (live) process.stdout.write(`${c.x}\n`)
      log(`${c.r}Error: ${e.message}${c.x}`)
      saveSession(messages)
      return
    }
    if (live) process.stdout.write(`${c.x}\n`)
    const msg = r.message
    if (!msg) { log(`${c.r}Sin respuesta del modelo.${c.x}`); saveSession(messages); return }

    if (msg.tool_calls?.length) {
      messages.push(msg)
      const tcs = msg.tool_calls
      const results = new Map()

      // Los subagentes de exploración corren EN PARALELO (son de solo lectura).
      const explorations = tcs.filter((tc) => tc.function.name === 'delegar_exploracion')
      if (explorations.length) {
        taskStats.subagents += explorations.length
        log(`${c.mg}▸ ${explorations.length} subagente${explorations.length > 1 ? 's' : ''} explorando${explorations.length > 1 ? ' en paralelo' : ''}…${c.x}`)
        await Promise.all(explorations.map(async (tc) => {
          let args = {}
          try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
          log(`${c.mg}  · ${String(args.objetivo || '').slice(0, 110)}${c.x}`)
          results.set(tc.id, await runExplorer(String(args.objetivo || '')))
        }))
      }

      // El resto de herramientas, en orden (pueden pedir confirmación).
      for (const tc of tcs) {
        if (results.has(tc.id)) continue
        let args = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
        const nm = tc.function.name
        if (nm.startsWith('mcp__')) {
          // Herramienta de un servidor MCP externo: pide confirmación (puede tener efectos).
          log(`${c.cy}▸ ${nm}${c.x}`)
          if (await confirm(`usar la herramienta MCP ${c.b}${nm}${c.x}`, `${c.dim}args: ${JSON.stringify(args).slice(0, 160)}${c.x}`, `mcp:${nm}`)) {
            results.set(tc.id, await callMcpTool(nm, args))
          } else {
            results.set(tc.id, 'El usuario denegó la herramienta MCP.')
          }
          continue
        }
        const detail = args.path || args.command || args.query || ''
        log(`${c.cy}▸ ${nm}${c.x}${detail ? ` ${c.dim}${String(detail).slice(0, 120)}${c.x}` : ''}`)
        results.set(tc.id, await runTool(nm, args))
      }

      for (const tc of tcs) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: results.get(tc.id) ?? '' })
      }
      // Adjuntar las imágenes solicitadas (ver_imagen) como mensaje multimodal.
      while (pendingImages.length) {
        const img = pendingImages.shift()
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: `[Imagen adjunta: ${img.path}]` },
            { type: 'image_url', image_url: { url: img.dataUri } },
          ],
        })
      }
      continue
    }
    // Si no hubo streaming (backend clásico), imprimir la respuesta completa.
    if (msg.content && !r.streamed) log(`\n${c.g}${msg.content}${c.x}`)
    messages.push({ role: 'assistant', content: msg.content || '' })

    // Modo dúo: el segundo modelo revisa el trabajo antes de darlo por bueno.
    // Solo si hubo trabajo real (no en respuestas de solo texto ni planes), y máx 2 rondas.
    if (DUO && reviewsDone < 2 && (taskStats.files.size + taskStats.commands) > 0) {
      reviewsDone++
      log(`${c.mg}▸ Revisión cruzada (${REVIEWER === 'glm' ? 'GLM-5.2' : 'frontera'})…${c.x}`)
      const rev = await reviewStep()
      if (!rev.ok && rev.feedback) {
        log(`${c.y}  Correcciones pedidas:${c.x} ${c.dim}${rev.feedback.slice(0, 220)}${c.x}`)
        messages.push({ role: 'user', content: `[REVISIÓN del segundo modelo] Corrige estos puntos y verifica de nuevo:\n${rev.feedback}` })
        continue
      }
      log(`${c.g}  Revisión aprobada.${c.x}`)
    }

    log(`${c.dim}· ${i + 1} paso${i ? 's' : ''} · ${((Date.now() - t0) / 1000).toFixed(1)}s${statsLine()}${DUO && reviewsDone ? ' · revisado' : ''}${c.x}\n`)
    saveSession(messages)
    return
  }
  log(`${c.y}(Se alcanzó el máximo de ${MAX_STEPS} pasos.)${c.x}`)
  saveSession(messages)
}

// ── Arranque: una tarea por argumento, o modo interactivo (REPL) ──
;(async () => {
  log(`${c.b}DAYA Code${c.x} ${c.dim}v${VERSION} · ${ROOT}${c.x}`)
  if (BRAIN_MODE === 'glm') log(`${c.dim}Cerebro: económico (GLM-5.2 al mando; sube a la frontera solo ante errores o imágenes).${c.x}`)
  if (BRAIN_MODE === 'max') log(`${c.dim}Cerebro: máximo (frontera en cada paso).${c.x}`)
  if (DUO) log(`${c.dim}Modo dúo: al terminar, ${REVIEWER === 'glm' ? 'GLM-5.2' : 'la frontera'} revisa el trabajo y se corrige lo que falle.${c.x}`)
  if (AUTO) log(`${c.y}Modo --yes: no se pedirán confirmaciones.${c.x}`)
  await initMcp()   // conecta servidores MCP configurados en ~/.daya/mcp.json
  if (CONT) {
    const s = loadSession()
    if (s) {
      messages = s.messages
      const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : ''
      log(`${c.dim}Sesión restaurada · ${messages.length} mensajes${when ? ` · ${when}` : ''}${c.x}`)
    } else {
      log(`${c.dim}No hay sesión previa en esta carpeta; empezamos de cero.${c.x}`)
    }
  }
  const oneShot = process.argv.slice(2).filter((a) => a !== '-c' && !a.startsWith('--')).join(' ').trim()
  if (oneShot) { await handleTask(oneShot); shutdownMcp(); rl.close(); return }
  log(`${c.dim}Escribe una tarea. /clear reinicia · "salir" termina (la sesión queda guardada; retómala con --continue).${c.x}`)
  for (;;) {
    const input = (await ask(`${c.b}› ${c.x}`)).trim()
    if (!input) continue
    const low = input.toLowerCase()
    if (['salir', 'exit', 'quit', ':q'].includes(low)) break
    if (low === '/clear') { messages = []; clearSession(); log(`${c.dim}Conversación y sesión guardada reiniciadas.${c.x}`); continue }
    if (low === '/undo') {
      const last = undoStack.pop()
      if (!last) { log(`${c.dim}Nada que deshacer.${c.x}`); continue }
      try {
        if (last.before === null) { fs.rmSync(last.abs, { force: true }); log(`${c.g}Deshecho:${c.x} se eliminó ${last.path} (era un archivo nuevo).`) }
        else { fs.writeFileSync(last.abs, last.before); log(`${c.g}Deshecho:${c.x} ${last.path} restaurado a su estado anterior.`) }
      } catch (e) { log(`${c.r}No se pudo deshacer ${last.path}: ${e.message}${c.x}`) }
      continue
    }
    if (low === '/permisos' || low === '/permisos reset') {
      if (low.endsWith('reset')) { sessionAllow.clear(); persistAllow(); log(`${c.dim}Permisos recordados de este proyecto: eliminados.${c.x}`) }
      else if (!sessionAllow.size) log(`${c.dim}Sin permisos recordados en este proyecto. Responde "t" a una confirmación para recordarla.${c.x}`)
      else { log(`${c.dim}Permisos recordados (este proyecto):${c.x}`); for (const k of sessionAllow) log(`${c.dim}  · ${k === 'write' ? 'escribir/editar archivos' : k.replace(/^cmd:/, 'ejecutar: ')}${c.x}`) }
      continue
    }
    if (low === '/mcp') {
      if (!mcpClients.size) log(`${c.dim}Sin servidores MCP. Configúralos en ${MCP_FILE} y reinicia daya-code.${c.x}`)
      else { log(`${c.dim}Servidores MCP conectados:${c.x}`); for (const [n, cl] of mcpClients) log(`${c.dim}  · ${n}: ${cl.tools.map((t) => t.name).join(', ') || '(sin herramientas)'}${c.x}`) }
      continue
    }
    if (low === '/help') { log(`${c.dim}Escribe una tarea en lenguaje natural. /undo revierte · /mcp lista servidores · /permisos · /clear reinicia · "salir" termina · --continue retoma · --plan propone antes de actuar.${c.x}`); continue }
    await handleTask(input)
  }
  shutdownMcp()
  rl.close()
})()
