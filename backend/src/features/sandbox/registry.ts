// ============================================
// DAYA IA — Sandbox Registry: manages providers + exposes as DayaTool
// Auto-detects Docker availability; falls back to local.
// ============================================
import { SandboxProvider, SandboxResult } from './provider'
import { DockerSandbox } from './docker'
import { LocalSandbox } from './local'
import { DayaTool } from '../agent/tools/types'
import { logger } from '../../services/logger'

let provider: SandboxProvider | null = null

async function detectProvider(): Promise<SandboxProvider> {
  try {
    const { execSync } = await import('child_process')
    execSync('docker info', { stdio: 'pipe', timeout: 5000 })
    return new DockerSandbox()
  } catch {
    logger.info('[sandbox] Docker not available, using local sandbox')
    return new LocalSandbox()
  }
}

export async function initSandbox(): Promise<void> {
  provider = await detectProvider()
  logger.info(`[sandbox] Using ${provider.name} provider`)
}

export function getSandboxProvider(): SandboxProvider {
  if (!provider) provider = new LocalSandbox()
  return provider
}

export function setSandboxProvider(p: SandboxProvider): void {
  provider = p
}

// ── DayaTool adapter: sandbox_execute ──
export const sandboxExecuteTool: DayaTool = {
  name: 'sandbox_execute',
  description: 'Execute code in an isolated sandbox environment. Supports python, javascript, typescript, and bash. Returns stdout, stderr, and exit code.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'The code to execute' },
      language: { type: 'string', enum: ['python', 'javascript', 'typescript', 'bash'], description: 'Programming language' },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
    },
    required: ['code', 'language'],
  },
  quotaKey: 'document',
  safeForAct: true,
  meta: { tag: 'code', emoji: '🐳', author: 'daya' },
  async run(_userId: string, args: { code: string; language: string; timeout_ms?: number }): Promise<string> {
    const sandbox = getSandboxProvider()
    const result: SandboxResult = await sandbox.exec(
      args.code,
      args.language,
      args.timeout_ms || 30_000,
    )

    const parts: string[] = []
    if (result.stdout) parts.push(`STDOUT:\n${result.stdout.slice(0, 4000)}`)
    if (result.stderr) parts.push(`STDERR:\n${result.stderr.slice(0, 2000)}`)
    parts.push(`Exit code: ${result.exitCode} (${result.durationMs}ms)`)

    return parts.join('\n\n')
  },
}
