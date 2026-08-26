// ============================================
// DAYA IA — selfimprove: verificación
// --------------------------------------------------------------------------
// "Mirar si lo hace bien": dos puertas obligatorias antes de que una mejora
// llegue a un PR.
//   1. MECÁNICA: `npm run typecheck` + `npm run test` en el repo.
//   2. JUICIO: un modelo revisor senior evalúa el diff contra criterios.
// Si alguna falla, la mejora se descarta. No hay atajos.
// ============================================

import { exec } from 'child_process'
import path from 'path'
import { chatJSON } from '../../services/openrouter'

export interface CmdResult { code: number | null; output: string }

// Ejecuta un comando de shell con timeout y captura salida (truncada).
export function runShell(cmd: string, cwd: string, timeoutMs = 300_000): Promise<CmdResult> {
  return new Promise((resolve) => {
    exec(cmd, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      env: process.env,
    }, (err, stdout, stderr) => {
      const output = (String(stdout || '') + '\n' + String(stderr || '')).slice(-12000)
      resolve({ code: err ? (err as any).code ?? 1 : 0, output })
    })
  })
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export interface VerifyStep { name: string; ok: boolean; output: string }
export interface VerificationReport { ok: boolean; steps: VerifyStep[] }

// Corre typecheck + tests en el subdirectorio de trabajo del repo (backend/).
export async function verifyRepo(repoDir: string, workDir = 'backend'): Promise<VerificationReport> {
  const target = path.join(repoDir, workDir)
  const typecheck = await runShell(`${npm} run typecheck`, target)
  const tests = await runShell(`${npm} run test`, target)
  const steps: VerifyStep[] = [
    { name: 'typecheck', ok: typecheck.code === 0, output: typecheck.output },
    { name: 'tests', ok: tests.code === 0, output: tests.output },
  ]
  return { ok: steps.every(s => s.ok), steps }
}

export interface ReviewVerdict { approved: boolean; feedback: string }

// Juez IA sobre el diff: no aprueba solo porque compile — mira requisitos,
// casos borde y que el cambio sea mínimamente correcto y verificado.
export async function reviewChanges(goal: string, diff: string, report: VerificationReport): Promise<ReviewVerdict> {
  const verdict = await chatJSON(
    `OBJETIVO DE LA MEJORA:
${goal}

VERIFICACIÓN MECÁNICA (ya ejecutada):
${report.steps.map(s => `- ${s.name}: ${s.ok ? 'OK' : 'FALLO'}`).join('\n')}

DIFF PROPUESTO (puede estar truncado):
${diff.slice(0, 30000)}

Eres un revisor senior. Decide SOLO con JSON:
{ "approved": true|false, "feedback": "1-2 frases concretas" }`,
    'Eres un revisor de código senior y exigente. Apuebas SOLO si: el diff cumple el objetivo, no rompe nada visible, está verificado y no mete datos sensibles o deuda innecesaria. Si la verificación mecánica falló, rechazas. Respondes SOLO en JSON.'
  )
  return {
    approved: verdict?.approved === true,
    feedback: String(verdict?.feedback || 'Sin feedback.'),
  }
}
