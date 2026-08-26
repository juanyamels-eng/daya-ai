// ============================================
// DAYA IA — Sandbox Provider: interface for isolated code execution
// All execution backends implement this interface.
// ============================================
export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export interface SandboxProvider {
  name: string
  exec(code: string, language: string, timeoutMs?: number): Promise<SandboxResult>
  cleanup?(): Promise<void>
}

// Supported languages and their Docker images / runtimes
export const LANGUAGE_MAP: Record<string, { image?: string; ext: string; run: string }> = {
  python: { image: 'python:3.12-slim', ext: '.py', run: 'python' },
  javascript: { image: 'node:22-slim', ext: '.js', run: 'node' },
  typescript: { image: 'node:22-slim', ext: '.ts', run: 'npx tsx' },
  bash: { image: 'bash:5', ext: '.sh', run: 'bash' },
}
