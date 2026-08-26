import { describe, it, expect } from 'vitest'
import { getSandboxProvider, sandboxExecuteTool } from '../features/sandbox/registry'

describe('sandbox', () => {
  it('getSandboxProvider returns a provider', () => {
    const provider = getSandboxProvider()
    expect(provider).toBeTruthy()
    expect(typeof provider.exec).toBe('function')
  })

  it('sandboxExecuteTool is a valid DayaTool', () => {
    expect(sandboxExecuteTool.name).toBe('sandbox_execute')
    expect(typeof sandboxExecuteTool.description).toBe('string')
    expect(sandboxExecuteTool.description.length).toBeGreaterThan(10)
    expect(sandboxExecuteTool.parameters.type).toBe('object')
    expect(sandboxExecuteTool.parameters.properties).toBeTruthy()
    expect(sandboxExecuteTool.parameters.properties.code).toBeTruthy()
    expect(sandboxExecuteTool.parameters.properties.language).toBeTruthy()
  })

  it('sandboxExecuteTool schema has required fields', () => {
    const props = sandboxExecuteTool.parameters.properties
    expect(props.code.type).toBe('string')
    expect(props.language.type).toBe('string')
  })
})
