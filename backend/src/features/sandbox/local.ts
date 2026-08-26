// ============================================
// DAYA IA — Local Sandbox: fallback execution using child_process
// Used when Docker is not available. Less isolated but zero-config.
// Same interface as DockerSandbox.
// ============================================
import { execSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SandboxProvider, SandboxResult, LANGUAGE_MAP } from './provider'

export class LocalSandbox implements SandboxProvider {
  name = 'local'

  async exec(code: string, language: string, timeoutMs = 30_000): Promise<SandboxResult> {
    const lang = LANGUAGE_MAP[language]
    if (!lang) return { stdout: '', stderr: `Unsupported language: ${language}`, exitCode: 1, durationMs: 0 }

    const id = crypto.randomBytes(8).toString('hex')
    const codeFile = path.join(os.tmpdir(), `daya_sandbox_${id}${lang.ext}`)
    const startTime = Date.now()

    try {
      fs.writeFileSync(codeFile, code, 'utf-8')
      const output = execSync(`${lang.run} ${codeFile}`, {
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: 'pipe',
        maxBuffer: 1024 * 1024,
      })
      return { stdout: output, stderr: '', exitCode: 0, durationMs: Date.now() - startTime }
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string; status?: number }
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message || 'Execution failed',
        exitCode: err.status || 1,
        durationMs: Date.now() - startTime,
      }
    } finally {
      try { fs.unlinkSync(codeFile) } catch { /* best effort */ }
    }
  }
}
