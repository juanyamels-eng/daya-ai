import { describe, it, expect } from 'vitest'
import { safeFileName, toMarkdown, type ExportMessage } from '@/lib/chatExport'

describe('safeFileName', () => {
  it('normalizes unicode and spaces', () => {
    expect(safeFileName('¡Hola Mundo!')).toBe('Hola-Mundo')
  })
  it('truncates at 60 chars', () => {
    const long = 'a'.repeat(100)
    expect(safeFileName(long)).toHaveLength(60)
  })
  it('returns fallback for empty', () => {
    expect(safeFileName('')).toBe('conversacion')
    expect(safeFileName('   ')).toBe('conversacion')
  })
  it('strips special chars', () => {
    expect(safeFileName('chat #1 (v2)')).toBe('chat-1-v2')
  })
})

describe('toMarkdown', () => {
  const msgs: ExportMessage[] = [
    { role: 'user', content: 'Hola', createdAt: '2025-01-15T10:00:00Z' },
    { role: 'assistant', content: 'Hola! Como puedo ayudar?', createdAt: '2025-01-15T10:00:01Z' },
  ]

  it('includes title as heading', () => {
    const md = toMarkdown('Mi Chat', msgs)
    expect(md).toContain('# Mi Chat')
  })
  it('labels user as "Tu" by default', () => {
    const md = toMarkdown('Test', msgs)
    expect(md).toContain('## Tú')
  })
  it('labels assistant as "Daya"', () => {
    const md = toMarkdown('Test', msgs)
    expect(md).toContain('## Daya')
  })
  it('filters internal messages', () => {
    const withInternal: ExportMessage[] = [
      { role: 'user', content: '__DOC__some_data' },
      { role: 'assistant', content: 'Real response' },
    ]
    const md = toMarkdown('Test', withInternal)
    expect(md).not.toContain('__DOC__')
    expect(md).toContain('Real response')
  })
  it('respects custom userLabel', () => {
    const md = toMarkdown('Test', msgs, 'Carlos')
    expect(md).toContain('## Carlos')
  })
})
