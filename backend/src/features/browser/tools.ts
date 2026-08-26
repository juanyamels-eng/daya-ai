// ============================================
// DAYA IA — Browser Tools: DayaTool adapters for autonomous browsing
// ============================================
import { executeBrowserAction } from './browser'
import { autonomousBrowse } from './vision'
import { DayaTool } from '../agent/tools/types'

export const browsePageTool: DayaTool = {
  name: 'browse_page',
  description: 'Navigate to a URL and get the page content + screenshot. Use for reading web pages.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
    },
    required: ['url'],
  },
  meta: { tag: 'web', emoji: '🌐', author: 'daya' },
  async run(_userId: string, args: { url: string }): Promise<string> {
    const result = await executeBrowserAction({ type: 'navigate', url: args.url })
    const parts = [`URL: ${result.url}`, `Title: ${result.title}`]
    if (result.text) parts.push(`Content:\n${result.text.slice(0, 3000)}`)
    if (result.screenshot) parts.push(`[Screenshot captured: ${result.screenshot.length} chars base64]`)
    if (result.error) parts.push(`Error: ${result.error}`)
    return parts.join('\n\n')
  },
}

export const screenshotTool: DayaTool = {
  name: 'browser_screenshot',
  description: 'Take a screenshot of the current browser page. Use to see what is on screen.',
  parameters: {
    type: 'object',
    properties: {},
  },
  meta: { tag: 'web', emoji: '📸', author: 'daya' },
  async run(): Promise<string> {
    const result = await executeBrowserAction({ type: 'screenshot' })
    const parts = [`URL: ${result.url}`, `Title: ${result.title}`]
    if (result.text) parts.push(`Text visible:\n${result.text.slice(0, 2000)}`)
    if (result.screenshot) parts.push(`[Screenshot: ${result.screenshot.length} chars]`)
    return parts.join('\n\n')
  },
}

export const clickElementTool: DayaTool = {
  name: 'browser_click',
  description: 'Click an element on the current page using a CSS selector. Use button text, input names, etc.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector (e.g. "button[type=submit]", "#login-btn", "text=Sign Up")' },
    },
    required: ['selector'],
  },
  meta: { tag: 'web', emoji: '🖱️', author: 'daya' },
  async run(_userId: string, args: { selector: string }): Promise<string> {
    const result = await executeBrowserAction({ type: 'click', selector: args.selector })
    return `Clicked "${args.selector}". Now at: ${result.url}\nTitle: ${result.title}${result.error ? '\nError: ' + result.error : ''}`
  },
}

export const fillFormTool: DayaTool = {
  name: 'browser_fill',
  description: 'Fill an input field with text using a CSS selector.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector for the input field' },
      value: { type: 'string', description: 'Text to type into the field' },
    },
    required: ['selector', 'value'],
  },
  meta: { tag: 'web', emoji: '✏️', author: 'daya' },
  async run(_userId: string, args: { selector: string; value: string }): Promise<string> {
    const result = await executeBrowserAction({ type: 'fill', selector: args.selector, value: args.value })
    return `Filled "${args.selector}" with "${args.value}".${result.error ? ' Error: ' + result.error : ''}`
  },
}

export const autonomousBrowseTool: DayaTool = {
  name: 'autonomous_browse',
  description: 'Autonomously browse the web with vision AI to accomplish a task. Takes screenshots, analyzes them with vision, and navigates automatically.',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'What to accomplish by browsing' },
      start_url: { type: 'string', description: 'Starting URL' },
      max_steps: { type: 'number', description: 'Max navigation steps (default 8)' },
    },
    required: ['task', 'start_url'],
  },
  meta: { tag: 'web', emoji: '🤖', author: 'daya', pro: true },
  async run(_userId: string, args: { task: string; start_url: string; max_steps?: number }): Promise<string> {
    const result = await autonomousBrowse(args.task, args.start_url, args.max_steps || 8)
    const parts = [`Final URL: ${result.finalUrl}`]
    if (result.finalText) parts.push(`Page content:\n${result.finalText.slice(0, 4000)}`)
    parts.push(`\nSteps taken: ${result.steps.length}`)
    for (const step of result.steps) {
      parts.push(`  → ${step.action.type}(${JSON.stringify(step.action).slice(0, 100)}) — ${step.reasoning.slice(0, 150)}`)
    }
    return parts.join('\n')
  },
}

export const BROWSER_TOOLS = [browsePageTool, screenshotTool, clickElementTool, fillFormTool, autonomousBrowseTool]
