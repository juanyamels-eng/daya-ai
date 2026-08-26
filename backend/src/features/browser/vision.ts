// ============================================
// DAYA IA — Browser Vision: uses LLM vision to understand screenshots
// and decide what action to take next for autonomous navigation.
// ============================================
import getClient, { MODELS } from '../../services/openrouter'
import { executeBrowserAction, BrowserAction, BrowserResult } from './browser'

export interface VisionStep {
  action: BrowserAction
  result: BrowserResult
  reasoning: string
}

export interface VisionPlan {
  steps: string[] // natural language descriptions of what to do
}

// Analyze a screenshot and decide the next action
export async function analyzeScreenshot(
  screenshotBase64: string,
  task: string,
  history: VisionStep[],
): Promise<{ action: BrowserAction; reasoning: string }> {
  const historyContext = history.slice(-3).map((h, i) =>
    `Step ${i + 1}: ${h.action.type}(${JSON.stringify(h.action)}). Result: ${h.result.title} at ${h.result.url}${h.result.error ? ' ERROR: ' + h.result.error : ''}`
  ).join('\n')

  const prompt = `You are a web navigation agent. Analyze this screenshot and decide the NEXT action to accomplish the task.

Task: ${task}

${historyContext ? `\nPrevious steps:\n${historyContext}\n` : ''}
Current page title: ${history[history.length - 1]?.result?.title || 'unknown'}
Current URL: ${history[history.length - 1]?.result?.url || 'unknown'}

Respond with JSON:
{
  "reasoning": "what you see on the page and why you chose this action",
  "action": {
    "type": "navigate|click|fill|screenshot|scroll|wait|back",
    "url": "for navigate only",
    "selector": "CSS selector for click/fill",
    "value": "text to fill, or wait duration in ms",
    "scrollDirection": "up|down for scroll"
  }
}

Rules:
- Use specific CSS selectors (buttons by text, inputs by placeholder/name)
- For navigation, use full URLs
- Take a screenshot after important actions to verify
- If you see an error or wrong page, use "back" to retry
- If the task appears complete, still take a screenshot to confirm`

  const result = await getClient().chat.completions.create({
    model: MODELS.gpt4,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` } },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.2,
  })

  const content = result.choices?.[0]?.message?.content || '{}'
  try {
    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const json = JSON.parse(cleaned)
    return {
      action: json.action || { type: 'screenshot' },
      reasoning: json.reasoning || '',
    }
  } catch {
    return { action: { type: 'screenshot' }, reasoning: 'Failed to parse vision output' }
  }
}

// Run autonomous browser navigation with vision
export async function autonomousBrowse(
  task: string,
  startUrl: string,
  maxSteps = 10,
): Promise<{ finalUrl: string; finalText: string; steps: VisionStep[] }> {
  const steps: VisionStep[] = []

  // Navigate to start URL
  await executeBrowserAction({ type: 'navigate', url: startUrl })

  for (let i = 0; i < maxSteps; i++) {
    // Take screenshot
    const screenshotResult = await executeBrowserAction({ type: 'screenshot' })
    if (!screenshotResult.screenshot) break

    // Analyze with vision
    const { action, reasoning } = await analyzeScreenshot(
      screenshotResult.screenshot,
      task,
      steps,
    )

    // Execute the decided action
    const result = await executeBrowserAction(action)
    steps.push({ action, result, reasoning })

    // If we took a screenshot as the action, the task might be analyzing the page
    if (action.type === 'screenshot' && steps.length > 2) {
      const recentScreenshots = steps.filter(s => s.action.type === 'screenshot').length
      if (recentScreenshots >= 2) break // Done exploring
    }
  }

  const lastStep = steps[steps.length - 1]
  return {
    finalUrl: lastStep?.result.url || '',
    finalText: lastStep?.result.text || '',
    steps,
  }
}
