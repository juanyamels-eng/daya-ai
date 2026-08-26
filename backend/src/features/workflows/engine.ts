// ============================================
// DAYA IA — Workflow Engine
// Execute declarative JSON workflows (DAG of tool calls).
// Each step can depend on previous step outputs.
// ============================================
import { runTool } from '../agent/tools/registry'
import { runMcpTool } from '../mcp/registry'

export interface WorkflowStep {
  id: string
  tool: string
  args: Record<string, unknown>
  dependsOn?: string[]    // step IDs whose output is available as {{stepId.output}}
  condition?: string     // JS expression evaluated with step outputs (skip if false)
  retry?: number
  timeoutMs?: number
}

export interface Workflow {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: number
  userId: string
}

export interface StepResult {
  stepId: string
  success: boolean
  output: string
  durationMs: number
  skipped?: boolean
}

export interface WorkflowResult {
  workflowId: string
  results: StepResult[]
  success: boolean
  totalDurationMs: number
}

function resolveArgs(args: Record<string, unknown>, context: Record<string, string>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      let v = value
      for (const [stepId, output] of Object.entries(context)) {
        v = v.replace(new RegExp(`\\{\\{${stepId}\\.output\\}\\}`, 'g'), output)
      }
      resolved[key] = v
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

function evaluateCondition(condition: string, context: Record<string, string>): boolean {
  try {
    const fn = new Function(...Object.keys(context), `return ${condition}`)
    return Boolean(fn(...Object.values(context)))
  } catch {
    return true // if condition fails to parse, execute the step
  }
}

export async function executeWorkflow(userId: string, workflow: Workflow): Promise<WorkflowResult> {
  const startTime = Date.now()
  const results: StepResult[] = []
  const context: Record<string, string> = {}

  // Topological sort: respect dependsOn
  const executed = new Set<string>()
  const sorted = topologicalSort(workflow.steps)

  for (const step of sorted) {
    // Check dependencies
    if (step.dependsOn?.some(d => !executed.has(d))) {
      results.push({ stepId: step.id, success: false, output: 'Dependency not met', durationMs: 0, skipped: true })
      continue
    }

    // Evaluate condition
    if (step.condition && !evaluateCondition(step.condition, context)) {
      results.push({ stepId: step.id, success: true, output: 'Skipped by condition', durationMs: 0, skipped: true })
      context[step.id] = 'SKIPPED'
      executed.add(step.id)
      continue
    }

    const stepStart = Date.now()
    let output: string
    let success = true

    try {
      const resolvedArgs = resolveArgs(step.args, context)
      if (step.tool.startsWith('mcp__')) {
        output = await runMcpTool(step.tool, resolvedArgs)
      } else {
        output = await runTool(userId, step.tool, resolvedArgs)
      }
      if (output.startsWith('ERROR') || output.startsWith('La herramienta')) success = false
    } catch (e) {
      output = `ERROR: ${e instanceof Error ? e.message : String(e)}`
      success = false
    }

    const durationMs = Date.now() - stepStart
    results.push({ stepId: step.id, success, output: output.slice(0, 2000), durationMs })
    context[step.id] = output
    if (success) executed.add(step.id)
  }

  return {
    workflowId: workflow.id,
    results,
    success: results.every(r => r.success || r.skipped),
    totalDurationMs: Date.now() - startTime,
  }
}

function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  const map = new Map(steps.map(s => [s.id, s]))
  const visited = new Set<string>()
  const sorted: WorkflowStep[] = []

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const step = map.get(id)
    if (step?.dependsOn) {
      for (const dep of step.dependsOn) visit(dep)
    }
    if (step) sorted.push(step)
  }

  for (const step of steps) visit(step.id)
  return sorted
}
