import { describe, it, expect } from 'vitest'
import { BROWSER_TOOLS, browsePageTool, screenshotTool, clickElementTool, fillFormTool, autonomousBrowseTool } from '../features/browser/tools'
import { executeBrowserAction } from '../features/browser/browser'

describe('Browser', () => {
  it('BROWSER_TOOLS is an array of 5 tools', () => {
    expect(Array.isArray(BROWSER_TOOLS)).toBe(true)
    expect(BROWSER_TOOLS.length).toBe(5)
  })

  it('all browser tools are valid DayaTools', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.description).toBe('string')
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.parameters.type).toBe('object')
      expect(tool.parameters.properties).toBeTruthy()
    }
  })

  it('browser tool names are unique', () => {
    const names = BROWSER_TOOLS.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('individual tool exports exist', () => {
    expect(browsePageTool.name).toBe('browse_page')
    expect(screenshotTool.name).toBe('browser_screenshot')
    expect(clickElementTool.name).toBe('browser_click')
    expect(fillFormTool.name).toBe('browser_fill')
    expect(autonomousBrowseTool.name).toBe('autonomous_browse')
  })

  it('executeBrowserAction is a function', () => {
    expect(typeof executeBrowserAction).toBe('function')
  })
})
