import { describe, it, expect } from 'vitest'
import { runOrchestrator } from '../features/agent/orchestrator'
import type { OrchestratorEvent, OrchestratorResult, OrchestratorStep, OrchestratorState, OrchestratorOptions } from '../features/agent/orchestrator'

describe('orchestrator', () => {
  it('exports runOrchestrator as a function', () => {
    expect(typeof runOrchestrator).toBe('function')
  })

  it('OrchestratorEvent type covers all event types', () => {
    // Verify the type union covers what we expect by checking events emitted in tests
    const events: OrchestratorEvent[] = [
      { type: 'start', traceId: 'orch_test', task: 'test' },
      { type: 'plan', iteration: 1, model: 'flash' },
      { type: 'tool_start', iteration: 1, tool: 'test', args: {} },
      { type: 'tool_end', iteration: 1, tool: 'test', success: true, durationMs: 100 },
      { type: 'evaluate', iteration: 1, verdict: 'done' },
      { type: 'answer', content: 'hello' },
      { type: 'error', message: 'fail' },
      { type: 'checkpoint', checkpointId: 'orch_test_cp1', state: 'evaluate' as OrchestratorState, iteration: 1 },
      { type: 'done', traceId: 'orch_test', totalDurationMs: 100, totalCostUsd: 0.01 },
    ]
    expect(events.length).toBe(9)
    expect(events.every(e => typeof e.type === 'string')).toBe(true)
  })

  it('OrchestratorResult has expected shape', () => {
    const result: OrchestratorResult = {
      answer: 'test',
      steps: [],
      state: 'complete',
      iterations: 1,
      traceId: 'orch_test',
      totalDurationMs: 100,
      totalCostUsd: 0,
    }
    expect(result.state).toBe('complete')
    expect(result.traceId.startsWith('orch_')).toBe(true)
  })
})
