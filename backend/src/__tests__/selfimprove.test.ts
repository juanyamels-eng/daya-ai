import { describe, it, expect, beforeEach, vi } from 'vitest'

// Store en memoria para no depender de PostgreSQL en los tests (configStore
// usa Prisma contra Supabase, inalcanzable aquí).
const { mem } = vi.hoisted(() => {
  const mem = new Map<string, string>()
  return { mem }
})

vi.mock('../services/configStore', () => ({
  loadConfigObj: async <T>(key: string) => {
    const v = mem.get(key)
    return v ? (JSON.parse(v) as T) : null
  },
  saveConfigObj: async <T>(key: string, obj: T) => {
    mem.set(key, JSON.stringify(obj))
  },
}))

import { listIssues, reportIssue, updateIssue, addManualRequest, pickTopIssue } from '../features/selfimprove/issues'
import { slugify, isSelfImproveEnabled, buildExecutorTools } from '../features/selfimprove/agent'
import { verifyRepo } from '../features/selfimprove/verifier'

beforeEach(() => mem.clear())

describe('almacén de issues de auto-mejora', () => {
  it('reporta una issue y la recupera', async () => {
    await reportIssue({
      kind: 'tool_failure',
      title: 'La herramienta «x» falla',
      detail: 'detalle',
      signature: 'tool_failure:x',
    })
    const issues = await listIssues()
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('tool_failure')
    expect(issues[0].status).toBe('open')
  })

  it('deduplica por firma y suma el contador', async () => {
    await reportIssue({ kind: 'tool_failure', title: 'a', detail: 'd1', signature: 's:1' })
    await reportIssue({ kind: 'tool_failure', title: 'a', detail: 'd2', signature: 's:1' })
    const issues = await listIssues()
    expect(issues).toHaveLength(1)
    expect(issues[0].count).toBe(2)
  })

  it('updateIssue cambia el estado', async () => {
    const issue = await addManualRequest('Hacer algo')
    await updateIssue(issue.id, { status: 'done', prUrl: 'https://github.com/x/y/pull/1' })
    const issues = await listIssues()
    expect(issues[0].status).toBe('done')
    expect(issues[0].prUrl).toContain('github.com')
  })

  it('pickTopIssue devuelve solo la primera abierta', async () => {
    await addManualRequest('Uno')
    await addManualRequest('Dos')
    const top = await pickTopIssue()
    expect(top).toBeTruthy()
    expect(top!.status).toBe('open')
    expect(top!.title).toBe('Dos')
  })
})

describe('utilidades del agente', () => {
  it('slugify normaliza el tema de la rama', () => {
    expect(slugify('Arreglar: ¡el OCR se rompe!')).toBe('arreglar-el-ocr-se-rompe')
  })

  it('las herramientas del ejecutor son un set de nombres único', () => {
    const tools = buildExecutorTools()
    const names = tools.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('read_file')
    expect(names).toContain('edit_file')
    expect(names).toContain('run_command')
    expect(names).toContain('search_files')
  })

  it('las herramientas rechazan rutas fuera del repo', async () => {
    const tools = buildExecutorTools()
    const read = tools.find(t => t.name === 'read_file')!
    // Rutas de prueba válidas para cada plataforma: las de estilo Windows
    // solo disparan el chequeo "fuera del repo" en Windows; en Linux se usan
    // rutas POSIX absolutas fuera de la raíz del repo.
    const isWin = process.platform === 'win32'
    const outside = isWin ? 'C:\\Windows\\system32' : '/etc/hostname'
    const cwd = isWin ? 'C:\\repo\\backend' : '/tmp/daya-repo/backend'
    const repoRoot = isWin ? 'C:\\repo' : '/tmp/daya-repo'
    const res = await read.run({ path: outside }, { cwd, repoRoot }).catch((e: unknown) => String(e?.message || e))
    expect(String(res)).toMatch(/fuera del repo/)
  }, 20000)

  it('search_files devuelve sin romper', () => {
    const tools = buildExecutorTools()
    const search = tools.find(t => t.name === 'search_files')!
    const needle = 'zzz_' + 'no_existe_' + String(Date.now())
    const res = search.run({ query: needle, path: '.' }, { cwd: '.', repoRoot: '.' })
    expect(String(res)).toMatch(/Sin coincidencias/)
  })
})

describe('verifier', () => {
  it('verifyRepo devuelve reporte con steps (falla sin repo)', async () => {
    const report = await verifyRepo('C:\\ruta\\inexistente', 'backend')
    expect(Array.isArray(report.steps)).toBe(true)
    expect(report.ok).toBe(false)
  })
})

describe('seguridad del modo', () => {
  it('sin env la auto-mejora está inerte', () => {
    expect(isSelfImproveEnabled()).toBe(false)
  })
})
