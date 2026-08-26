// ============================================
// DAYA IA — Docker Sandbox: isolated code execution via Docker containers
// Runs code in ephemeral containers with strict resource limits:
//   --network none   (no network access)
//   --memory 256m    (memory cap)
//   --cpus 1         (CPU cap)
//   --read-only      (read-only filesystem)
//   --tmpfs /tmp     (writable tmp only)
// ============================================
import { execSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SandboxProvider, SandboxResult, LANGUAGE_MAP } from './provider'

export class DockerSandbox implements SandboxProvider {
  name = 'docker'

  async exec(code: string, language: string, timeoutMs = 30_000): Promise<SandboxResult> {
    const lang = LANGUAGE_MAP[language]
    if (!lang) return { stdout: '', stderr: `Unsupported language: ${language}`, exitCode: 1, durationMs: 0 }

    const id = crypto.randomBytes(8).toString('hex')
    const tmpDir = os.tmpdir()
    const codeFile = path.join(tmpDir, `daya_sandbox_${id}${lang.ext}`)
    const startTime = Date.now()

    try {
      fs.writeFileSync(codeFile, code, 'utf-8')

      const dockerRun = [
        'docker run --rm',
        '--network none',
        '--memory 256m',
        '--cpus 1',
        '--read-only',
        '--tmpfs /tmp:size=64m',
        `-v "${codeFile}:/sandbox/run${lang.ext}:ro"`,
        lang.image,
        `sh -c "timeout ${Math.floor(timeoutMs / 1000)} ${lang.run} /sandbox/run${lang.ext}"`,
      ].join(' ')

      const output = execSync(dockerRun, {
        timeout: timeoutMs + 10_000,
        encoding: 'utf-8',
        stdio: 'pipe',
        maxBuffer: 1024 * 1024,
      })

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
      }
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string; status?: number }
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message || 'Execution failed',
        exitCode: err.status || 1,
        durationMs: Date.now() - startTime,
      }
    } finally {
      try { fs.unlinkSync(codeFile) } catch { /* cleanup best effort */ }
    }
  }
}
