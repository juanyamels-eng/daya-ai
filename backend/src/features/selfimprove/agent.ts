// ============================================
// DAYA IA — selfimprove: el agente editor
// --------------------------------------------------------------------------
// El núcleo de la auto-mejora. Ciclo por mejora:
//   1. Rama dedicada `daya/improve/<tema>` (nunca toca la rama base).
//   2. Agente con herramientas de edición (read/edit/write/search/run) que
//      implementa el objetivo (arreglar un fallo o crear una herramienta nueva).
//   3. VERIFICA: typecheck + tests + revisor IA sobre el diff.
//   4. Si aprueba → commit + push + PR automático (gh CLI). Si no → descarta.
//
// SEGURIDAD: solo opera si SELFIMPROVE_ENABLED=1 y DAYA_REPO_PATH apunta a un
// clon del repo con el árbol de trabajo LIMPIO (si hay cambios sin commitear,
// aborta para no pisarlos). Los cambios viven SOLO en la rama; el merge a
// producción queda protegido por el PR + CI.
// ============================================

import { promises as fs, readdirSync, readFileSync } from 'fs'
import path from 'path'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import getClient, { MODELS } from '../../services/openrouter'
import { runShell, verifyRepo, reviewChanges, VerificationReport, CmdResult } from './verifier'
import { listIssues, updateIssue } from './issues'

// ── Config (solo mediante env; inerte por defecto) ───────────────────────────

export function isSelfImproveEnabled(): boolean {
  return process.env.SELFIMPROVE_ENABLED === '1'
}

export function repoPath(): string | null {
  const p = (process.env.DAYA_REPO_PATH || '').trim()
  return p || null
}

export function workDir(): string {
  return (process.env.SELFIMPROVE_WORKDIR || 'backend').trim()
}

function baseBranch(): string {
  return (process.env.SELFIMPROVE_BRANCH || 'main').trim()
}

// ── Utilidades ──────────────────────────────────────────────────────────────

const IGNORED_DIRS = /node_modules|\.git|dist|\.next|\.cache|coverage|build/i
const CODE_FILES = /\.(ts|tsx|js|mjs|cjs|json|prisma|md|css|scss|html|yml|yaml|env\.example)$/i

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'mejora'
}

function listCodeFilesSync(dir: string, depth = 0, out: string[] = []): string[] {
  if (depth > 10) return out
  let entries: import('fs').Dirent[] = []
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (IGNORED_DIRS.test(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) listCodeFilesSync(full, depth + 1, out)
    else if (CODE_FILES.test(e.name)) out.push(full)
  }
  return out
}

// ── Herramientas del ejecutor local (sobre el repo) ─────────────────────────

export interface ExecCtx { cwd: string; repoRoot: string }
export interface ExecTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (args: Record<string, unknown>, ctx: ExecCtx) => Promise<string> | string
}

function relativeSafe(cwd: string, p: string): string {
  const abs = path.resolve(cwd, String(p || ''))
  const root = path.resolve(cwd)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Ruta fuera del repo: ${p}`)
  }
  return abs
}

export function searchInRepo(query: string, startDir: string, maxResults = 200): string {
  let re: RegExp
  try { re = new RegExp(query, 'i') } catch { re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
  const files = listCodeFilesSync(startDir)
  const hits: string[] = []
  for (const f of files) {
    if (hits.length >= maxResults) break
    let text = ''
    try { text = readSync(f) } catch { continue }
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length && hits.length < maxResults; i++) {
      if (re.test(lines[i])) {
        const rel = f.replace(startDir + path.sep, '')
        hits.push(`${rel}:${i + 1}: ${lines[i].slice(0, 180)}`)
      }
    }
  }
  return hits.length ? hits.join('\n').slice(0, 12000) : 'Sin coincidencias.'
}

function readSync(p: string): string {
  return readFileSync(p, 'utf8')
}

export function buildExecutorTools(): ExecTool[] {
  return [
    {
      name: 'read_file',
      description: 'Lee un archivo del repo y devuelve líneas numeradas (offset 0-index, limit máximo 400).',
      parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['path'] },
      async run(args, ctx) {
        const file = relativeSafe(ctx.cwd, String(args.path || ''))
        let text = ''
        try { text = await fs.readFile(file, 'utf8') } catch (e) { return `No pude leer: ${e instanceof Error ? e.message : e}` }
        const lines = text.split(/\r?\n/)
        const offset = Math.max(0, Number(args.offset) || 0)
        const limit = Math.min(Math.max(1, Number(args.limit) || 400), 400)
        const slice = lines.slice(offset, offset + limit)
        return slice.map((l, i) => `${offset + i + 1}: ${l}`).join('\n') || '(archivo vacío o fuera de rango)'
      },
    },
    {
      name: 'edit_file',
      description: 'Edita un archivo EXISTENTE reemplazando old_text (texto EXACTO) por new_text. Con all=true reemplaza todas las apariciones.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' }, all: { type: 'boolean' } }, required: ['path', 'old_text', 'new_text'] },
      async run(args, ctx) {
        const file = relativeSafe(ctx.cwd, String(args.path || ''))
        let text = ''
        try { text = await fs.readFile(file, 'utf8') } catch (e) { return `No pude leer: ${e instanceof Error ? e.message : e}` }
        const oldText = String(args.old_text ?? '')
        if (!oldText) return 'Falta old_text.'
        const occurrences = text.split(oldText).length - 1
        if (occurrences === 0) return 'old_text no encontrado en el archivo. Verifica el texto EXACTO (espacios y saltos).'
        const next = args.all ? text.split(oldText).join(String(args.new_text ?? '')) : text.replace(oldText, String(args.new_text ?? ''))
        await fs.writeFile(file, next, 'utf8')
        return `✓ Editado ${file.replace(ctx.cwd + path.sep, '')}: ${occurrences} aparición(es) reemplazada(s).`
      },
    },
    {
      name: 'write_file',
      description: 'Crea un archivo NUEVO (o sobreescribe entero si hace falta). Crea las carpetas intermedias.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
      async run(args, ctx) {
        const file = relativeSafe(ctx.cwd, String(args.path || ''))
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, String(args.content ?? ''), 'utf8')
        return `✓ Archivo escrito: ${file.replace(ctx.cwd + path.sep, '')}`
      },
    },
    {
      name: 'list_dir',
      description: 'Lista archivos y carpetas de una ruta del repo.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async run(args, ctx) {
        const dir = relativeSafe(ctx.cwd, String(args.path || '.'))
        let entries: string[] = []
        try { entries = readdirSync(dir) } catch (e) { return `No pude listar: ${e instanceof Error ? e.message : e}` }
        return entries.slice(0, 300).join('\n')
      },
    },
    {
      name: 'search_files',
      description: 'Busca un texto o regex en los archivos del repo (ignora node_modules/.git/dist). Devuelve archivo:línea: contenido.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string', description: 'Carpeta desde la que buscar (raíz del repo si no se indica)' } }, required: ['query'] },
      run(args, ctx) {
        const base = args.path ? relativeSafe(ctx.cwd, String(args.path)) : ctx.cwd
        return searchInRepo(String(args.query || ''), base)
      },
    },
    {
      name: 'run_command',
      description: 'Ejecuta un comando de shell en el directorio de trabajo del repo (backend/) y devuelve stdout+stderr y código de salida. Úsalo para instalar, compilar, probar y verificar.',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      async run(args, ctx) {
        const cmd = String(args.command || '').slice(0, 500)
        if (!cmd) return 'Falta el comando.'
        const r: CmdResult = await runShell(cmd, ctx.cwd, 180_000)
        return `$ ${cmd}\n(exit ${r.code})\n${r.output}`
      },
    },
  ]
}

// ── El loop del agente ───────────────────────────────────────────────────────

const EXECUTOR_TOOLS = buildExecutorTools()
const EXECUTOR_SCHEMAS: ChatCompletionTool[] = EXECUTOR_TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))

const IMPROVE_SYSTEM = `Eres DAYA Auto-Mejora: un agente de programación senior que mejora el repositorio de DAYA por su cuenta.
Monorepo: backend/ (Express + TypeScript + Prisma), frontend/ (Next.js 14), cli/.
Contexto del trabajo: estás en una RAMA dedicada; los cambios solo se aplicarán si typecheck + tests pasan y un revisor aprueba el diff.

Método:
1. EXPLORA antes de tocar: search_files para localizar, read_file antes de editar.
2. CAMBIOS QUIRÚRGICOS: edit_file con texto exacto; write_file solo para archivos nuevos.
3. Para CREAR UNA HERRAMIENTA NUEVA del agente, sigue el patrón establecido:
   - Nuevo archivo backend/src/features/agent/tools/<nombre>.ts exportando un DayaTool { name, description, parameters, run(userId, args) } (mira tools/types.ts y una tool existente para el contrato exacto).
   - Añade AL PROPIO DayaTool el metadato meta: { author: 'daya-auto', tag: '<categoría: web|imagen|documentos|productividad|voz|automatizacion|utilidades>', emoji: '<un emoji representativo>' } para que aparezca en el catálogo público de la comunidad.
   - Regístrala en backend/src/features/agent/tools/registry.ts (ALL_TOOLS).
   - Añade un test en backend/src/__tests__/tools.test.ts.
4. VERIFICA SIEMPRE al final: corre "npm run typecheck" y "npm run test" en backend/. Si fallan, lee el error y corrige la causa raíz.
5. No introduzcas secretos, no borres features, no reformatees código ajeno.`

export interface ImproveRun {
  ok: boolean
  branch?: string
  prUrl?: string
  message?: string
  steps?: string[]
  report?: VerificationReport
  reviewFeedback?: string
}

// Lanza el agente sobre el repo (ya posicionado en la rama dedicada).
export async function runImproveAgent(goal: string, repoDir: string, maxSteps = 24): Promise<{ diff: string; report: VerificationReport; trace: string[] }> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: IMPROVE_SYSTEM },
    { role: 'user', content: `OBJETIVO DE ESTA MEJORA:\n${goal}` },
  ]
  const ctx: ExecCtx = { cwd: path.join(repoDir, workDir()), repoRoot: repoDir }
  const trace: string[] = []

  for (let i = 0; i < maxSteps; i++) {
    const res = await getClient().chat.completions.create({
      model: MODELS.codePro,
      messages,
      tools: EXECUTOR_SCHEMAS,
      tool_choice: 'auto',
      max_tokens: 1500,
    })
    const msg = res.choices?.[0]?.message
    if (!msg) break
    const toolCalls = msg.tool_calls
    if (!toolCalls?.length) break

    messages.push(msg)
    for (const tc of toolCalls) {
      const name = tc.function?.name
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
      const tool = EXECUTOR_TOOLS.find(t => t.name === name)
      let output: string
      if (!tool) {
        output = 'Herramienta desconocida.'
      } else {
        try { output = await tool.run(args, ctx) } catch (e) { output = `ERROR: ${e instanceof Error ? e.message : e}` }
      }
      trace.push(`${name}(${JSON.stringify(args).slice(0, 120)})`)
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(output).slice(0, 4000) })
    }
  }

  // Un último intento de corregir si la verificación falla.
  let report = await verifyRepo(repoDir, workDir())
  if (!report.ok) {
    const failBlock = report.steps.map(s => `## ${s.name} ${s.ok ? 'OK' : 'FALLO'}\n${s.output.slice(0, 3000)}`).join('\n\n')
    messages.push({ role: 'user', content: `La verificación falló. Corrige la causa raíz:\n\n${failBlock}` })
    for (let i = 0; i < 4; i++) {
      const res = await getClient().chat.completions.create({
        model: MODELS.codePro,
        messages,
        tools: EXECUTOR_SCHEMAS,
        tool_choice: 'auto',
        max_tokens: 1500,
      })
      const msg = res.choices?.[0]?.message
      if (!msg) break
      const toolCalls = msg.tool_calls
      if (!toolCalls?.length) break
      messages.push(msg)
      for (const tc of toolCalls) {
        const name = tc.function?.name
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
        const tool = EXECUTOR_TOOLS.find(t => t.name === name)
        let output: string
        if (!tool) output = 'Herramienta desconocida.'
        else { try { output = await tool.run(args, ctx) } catch (e) { output = `ERROR: ${e instanceof Error ? e.message : e}` } }
        trace.push(`${name}(${JSON.stringify(args).slice(0, 120)})`)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: String(output).slice(0, 4000) })
      }
    }
    report = await verifyRepo(repoDir, workDir())
  }

  const diffRes = await runShell(`git -C "${repoDir}" diff`, repoDir, 60_000)
  return { diff: diffRes.output, report, trace }
}

// ── Ciclo completo: rama → editar → verificar → revisar → PR ────────────────

export interface CycleOpts {
  goal: string
  repoDir: string
  issueId?: string
}

export async function runImprovementCycle(opts: CycleOpts): Promise<ImproveRun> {
  const { goal, repoDir, issueId } = opts
  if (issueId) await updateIssue(issueId, { status: 'in_progress' })

  // 0. Seguridad: el árbol debe estar limpio (no pisar trabajo del usuario).
  const clean = await runShell(`git -C "${repoDir}" status --porcelain`, repoDir, 30_000)
  if (clean.code !== 0) return { ok: false, message: 'git no disponible en DAYA_REPO_PATH.' }
  if (clean.output.trim()) return { ok: false, message: 'El repo tiene cambios sin commitear; aborto para no pisarlos. Commitea o descarta y reintenta.' }

  const branch = `daya/improve/${slugify(goal)}`
  const checkout = await runShell(`git -C "${repoDir}" checkout -b "${branch}"`, repoDir, 30_000)
  if (checkout.code !== 0) return { ok: false, message: `No pude crear la rama ${branch}: ${checkout.output.slice(0, 400)}` }

  try {
    // 1. Edita.
    const { diff, report, trace } = await runImproveAgent(goal, repoDir)

    // 2. Juzga el diff.
    if (!diff.trim()) {
      await restoreBase(repoDir, branch)
      if (issueId) await updateIssue(issueId, { status: 'failed' })
      return { ok: false, branch, message: 'El agente no produjo cambios.', steps: trace, report }
    }
    const verdict = await reviewChanges(goal, diff, report)

    // 3. Si la revisión desaprueba o la verificación falló → descarta.
    if (!verdict.approved || !report.ok) {
      await restoreBase(repoDir, branch)
      if (issueId) await updateIssue(issueId, { status: 'failed' })
      return { ok: false, branch, message: 'Descartado: verificación o revisor no pasaron.', steps: trace, report, reviewFeedback: verdict.feedback }
    }

    // 4. Commit + push + PR.
    const base = baseBranch()
    const commit = await runShell(`git -C "${repoDir}" add -A && git -C "${repoDir}" commit -m "daya(improve): ${goal.slice(0, 100)}"`, repoDir, 60_000)
    if (commit.code !== 0) throw new Error(`commit falló: ${commit.output.slice(0, 400)}`)

    const push = await runShell(`git -C "${repoDir}" push -u origin "${branch}"`, repoDir, 90_000)
    let prUrl: string | undefined
    if (push.code === 0) {
      const remote = await runShell(`git -C "${repoDir}" remote get-url origin`, repoDir, 20_000)
      const repoSlug = extractRepoSlug(remote.output)
      if (repoSlug) {
        const pr = await runShell(`gh pr create --repo "${repoSlug}" --base "${base}" --head "${branch}" --title "daya(improve): ${goal.slice(0, 100)}" --body "**Auto-mejora de DAYA.**\n\nObjetivo: ${goal}\n\nVerificación: typecheck ${report.steps[0].ok ? 'OK' : 'FALLO'}, tests ${report.steps[1].ok ? 'OK' : 'FALLO'}.\nRevisor: ${verdict.feedback}\n\n*Creado automáticamente por el sistema de auto-mejora.*"`, repoDir, 90_000)
        const urlMatch = pr.output.match(/https:\/\/github\.com\/[^\s"']+/)
        if (urlMatch) prUrl = urlMatch[0]
      }
    }

    if (issueId) await updateIssue(issueId, { status: 'done', prUrl })
    return { ok: true, branch, prUrl, message: prUrl ? `PR creado: ${prUrl}` : 'Cambios commiteados en la rama (no pude crear el PR: revisa gh CLI y push).', steps: trace, report, reviewFeedback: verdict.feedback }
  } catch (e) {
    await restoreBase(repoDir, branch).catch(() => {})
    if (issueId) await updateIssue(issueId, { status: 'failed' })
    return { ok: false, branch, message: e instanceof Error ? e.message : 'error interno' }
  }
}

async function restoreBase(repoDir: string, branch: string): Promise<void> {
  await runShell(`git -C "${repoDir}" checkout -f "${baseBranch()}"`, repoDir, 30_000)
  await runShell(`git -C "${repoDir}" branch -D "${branch}"`, repoDir, 20_000).catch(() => {})
}

function extractRepoSlug(remote: string): string | null {
  const url = remote.trim().split(/\r?\n/)[0] || ''
  const m = url.match(/(?:github\.com[:/])([^/]+\/[^/.]+)(?:\.git)?$/)
  return m ? m[1] : null
}

// ── Punto de entrada general (lo llama la ruta y el scheduler) ──────────────

export async function runSelfImprove(goal?: string): Promise<ImproveRun> {
  if (!isSelfImproveEnabled()) {
    return { ok: false, message: 'Auto-mejora desactivada. Define SELFIMPROVE_ENABLED=1 y DAYA_REPO_PATH para activarla.' }
  }
  const dir = repoPath()
  if (!dir) return { ok: false, message: 'Falta DAYA_REPO_PATH (ruta al clon del repo).' }

  // Si no hay objetivo manual, toma la primera issue abierta.
  let issueId: string | undefined
  if (goal && goal.trim()) {
    const { addManualRequest } = await import('./issues')
    const issue = await addManualRequest(goal)
    issueId = issue.id
  } else {
    const issue = (await listIssues()).find(i => i.status === 'open')
    if (!issue) return { ok: false, message: 'No hay issues abiertas para mejorar. Usa un objetivo manual.' }
    goal = issue.detail || issue.title
    issueId = issue.id
  }

  return runImprovementCycle({ goal: goal!.trim(), repoDir: dir, issueId })
}

// Para el scheduler: corre si está habilitado, con espaciado por horas.
let lastImproveAt = 0
export async function maybeRunScheduledImprovement(): Promise<void> {
  if (!isSelfImproveEnabled() || !repoPath()) return
  const intervalMs = (Number(process.env.SELFIMPROVE_INTERVAL_H) || 6) * 60 * 60 * 1000
  if (Date.now() - lastImproveAt < intervalMs) return
  lastImproveAt = Date.now()
  await runSelfImprove().catch(() => {})
}
