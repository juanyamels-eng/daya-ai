// ============================================
// DAYA IA — GitHub Guardian
// --------------------------------------------------------------------------
// Vigila un repositorio LOCAL: detecta cambios, genera un mensaje de commit
// claro (con IA), y hace commit + push — PERO solo si el escáner de secretos
// da luz verde. Si encuentra credenciales expuestas, BLOQUEA el push y avisa.
//
// Importante sobre el entorno:
//   • Necesita `git` instalado y acceso al filesystem → corre en una máquina
//     local o en un runner, NO en un filesystem efímero (Railway).
//   • Usa `git` vía child_process (sin librerías). Todas las rutas se validan.
//
// Todas las funciones devuelven objetos JSON (nunca lanzan al caller salvo
// validación de entrada), para encajar con un API que responde JSON.
// ============================================

import { promisify } from 'util'
import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import * as path from 'path'
import { scanFiles, SecretFinding, shouldBlock } from './secretScanner'
import { chatJSON } from '../../services/openrouter'

const run = promisify(execFile)

// ── Utilidad: ejecutar git de forma segura en un repo ───────────────────────
// Usamos execFile (no exec) con argumentos en array → no hay interpolación de
// shell, así que no hay inyección de comandos por rutas o mensajes raros.

async function git(repoPath: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    const { stdout, stderr } = await run('git', ['-C', repoPath, ...args], {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60_000,
    })
    return { ok: true, out: stdout || '', err: stderr || '' }
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: err?.stdout || '', err: err?.stderr || err?.message || 'git falló' }
  }
}

// Valida que la ruta sea un repo git real (evita operar en sitios equivocados).
async function assertRepo(repoPath: string): Promise<string | null> {
  if (!repoPath || typeof repoPath !== 'string') return 'Falta la ruta del repositorio.'
  const resolved = path.resolve(repoPath)
  const r = await git(resolved, ['rev-parse', '--is-inside-work-tree'])
  if (!r.ok || r.out.trim() !== 'true') return 'La ruta no es un repositorio git válido.'
  return null
}

// ── Estado del repo ──────────────────────────────────────────────────────────

export interface RepoStatus {
  ok: boolean
  error?: string
  branch?: string
  changedFiles?: { path: string; status: string }[]
  ahead?: number
  clean?: boolean
}

export async function status(repoPath: string): Promise<RepoStatus> {
  const bad = await assertRepo(repoPath)
  if (bad) return { ok: false, error: bad }
  const repo = path.resolve(repoPath)

  const branchRes = await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const statusRes = await git(repo, ['status', '--porcelain=v1'])
  const changed = statusRes.out
    .split('\n')
    .filter(Boolean)
    .map(l => ({ status: l.slice(0, 2).trim(), path: l.slice(3).trim() }))

  return {
    ok: true,
    branch: branchRes.out.trim() || 'desconocida',
    changedFiles: changed,
    clean: changed.length === 0,
  }
}

// ── Verificación de seguridad sobre los cambios ──────────────────────────────

export interface GuardScan {
  ok: boolean
  error?: string
  findings: SecretFinding[]
  blocked: boolean
  filesScanned: number
}

// Lee el contenido de los archivos modificados/añadidos y los escanea.
export async function scanChanges(repoPath: string): Promise<GuardScan> {
  const bad = await assertRepo(repoPath)
  if (bad) return { ok: false, error: bad, findings: [], blocked: false, filesScanned: 0 }
  const repo = path.resolve(repoPath)

  const st = await git(repo, ['status', '--porcelain=v1'])
  const paths = st.out
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3).trim())
    // ignora borrados (no hay contenido que escanear)
    .filter(p => p && !p.startsWith('"'))

  const files: { path: string; content: string }[] = []
  for (const rel of paths) {
    try {
      const content = await readFile(path.join(repo, rel), 'utf-8')
      files.push({ path: rel, content })
    } catch { /* binario o borrado: se omite */ }
  }

  const findings = scanFiles(files)
  return { ok: true, findings, blocked: shouldBlock(findings), filesScanned: files.length }
}

// ── Mensaje de commit con IA ─────────────────────────────────────────────────

async function generateCommitMessage(repoPath: string): Promise<string> {
  const repo = path.resolve(repoPath)
  // Diff acotado para no gastar contexto: solo nombres + un resumen del diff.
  const namesRes = await git(repo, ['diff', '--cached', '--name-status'])
  let names = namesRes.out.trim()
  if (!names) {
    // si no hay nada en stage, mira el diff del working tree
    const wt = await git(repo, ['diff', '--name-status'])
    names = wt.out.trim()
  }
  const diffRes = await git(repo, ['diff', '--cached', '--stat'])
  const stat = diffRes.out.trim().slice(0, 2000)

  try {
    const parsed = await chatJSON(
      `Genera un mensaje de commit en español siguiendo convención (tipo: descripción breve). Cambios:\n\nArchivos:\n${names}\n\nResumen:\n${stat}\n\nResponde SOLO con JSON: { "message": "tipo: descripción concisa en imperativo, máx 72 caracteres" }`,
      'Eres un asistente que escribe mensajes de commit claros y convencionales (feat, fix, docs, refactor, chore, style, test). Respondes SOLO en JSON.'
    )
    const msg = String(parsed?.message || '').trim().slice(0, 100)
    return msg || 'chore: actualizar archivos'
  } catch {
    return 'chore: actualizar archivos'
  }
}

// ── Operación principal: commit + push seguro ────────────────────────────────

export interface GuardResult {
  ok: boolean
  error?: string
  blocked?: boolean
  findings?: SecretFinding[]
  committed?: boolean
  pushed?: boolean
  message?: string
  branch?: string
  details?: string
}

/**
 * Flujo seguro: escanea → si hay secretos de severidad alta, BLOQUEA →
 * si está limpio, hace add + commit (mensaje IA o el provisto) + push opcional.
 */
export async function guardedCommit(
  repoPath: string,
  opts: { message?: string; push?: boolean; remote?: string; dryRun?: boolean } = {}
): Promise<GuardResult> {
  const bad = await assertRepo(repoPath)
  if (bad) return { ok: false, error: bad }
  const repo = path.resolve(repoPath)

  // 1) Seguridad PRIMERO
  const scan = await scanChanges(repo)
  if (!scan.ok) return { ok: false, error: scan.error }
  if (scan.blocked) {
    return {
      ok: true,
      blocked: true,
      committed: false,
      pushed: false,
      findings: scan.findings,
      details: 'Push bloqueado: se detectaron posibles credenciales expuestas. Quítalas (usa variables de entorno) antes de subir.',
    }
  }

  // 2) ¿Hay algo que commitear?
  const st = await status(repo)
  if (st.clean) return { ok: true, committed: false, pushed: false, details: 'No hay cambios que confirmar.', findings: scan.findings }

  // 3) Modo simulación: no escribe nada, solo informa qué haría.
  const message = (opts.message && opts.message.trim()) || (await generateCommitMessage(repo))
  if (opts.dryRun) {
    return { ok: true, committed: false, pushed: false, message, branch: st.branch, findings: scan.findings, details: 'Simulación: estos cambios pasarían el filtro y se confirmarían.' }
  }

  // 4) add + commit
  const add = await git(repo, ['add', '-A'])
  if (!add.ok) return { ok: false, error: 'git add falló: ' + add.err }
  const commit = await git(repo, ['commit', '-m', message])
  if (!commit.ok) return { ok: false, error: 'git commit falló: ' + commit.err, message }

  // 5) push (opcional)
  let pushed = false
  let pushDetails = ''
  if (opts.push) {
    const remote = opts.remote || 'origin'
    const push = await git(repo, ['push', remote, st.branch || 'HEAD'])
    pushed = push.ok
    pushDetails = push.ok ? 'Push completado.' : 'Commit hecho, pero el push falló: ' + push.err
  }

  return {
    ok: true,
    blocked: false,
    committed: true,
    pushed,
    message,
    branch: st.branch,
    findings: scan.findings,
    details: pushDetails || 'Commit local realizado (sin push).',
  }
}
