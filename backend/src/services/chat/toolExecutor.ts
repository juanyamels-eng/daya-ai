import { Response } from 'express'

export interface ToolContextResult {
  context: string
  toolsUsed: string[]
}

export async function executeTools(
  userId: string,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  res: Response,
  clientGoneRef: { current: boolean }
): Promise<ToolContextResult> {
  const toolsUsed: string[] = []
  let context = ''

  try {
    const { gatherToolContext } = await import('../../features/agent/agent')
    const previo = history.slice(-4).map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
    const result = await gatherToolContext(userId, message, previo, (tool) => {
      if (!tool || clientGoneRef.current) return
      toolsUsed.push(tool)
      res.write(`data: ${JSON.stringify({ tool })}\n\n`)
      res.flush?.()
    })
    if (result.context) context = result.context
  } catch { /* sin herramientas, pero con respuesta */ }

  return { context, toolsUsed }
}

export function formatToolsLine(toolsUsed: string[]): string {
  if (!toolsUsed.length) return ''
  const unicas = Array.from(new Set(toolsUsed))
  return `\n\n_Herramientas usadas: ${unicas.join(' → ')}_`
}