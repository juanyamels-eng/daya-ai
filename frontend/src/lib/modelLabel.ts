// Del id de OpenRouter ('anthropic/claude-sonnet-4', 'openai/gpt-4o'…) al nombre
// que reconoce una persona. Daya enruta cada mensaje al modelo que mejor le va,
// así que el indicador de escritura dice cuál está respondiendo ahora mismo.
//
// Open-source: cualquier modelo de OpenRouter puede aparecer aquí.
export function modelLabel(id?: string | null): string {
  if (!id) return ''
  const s = id.toLowerCase()
  if (s.includes('deepseek')) return 'DeepSeek'
  if (s.includes('qwen')) return 'Qwen'
  if (s.includes('glm') || s.startsWith('z-ai/')) return 'GLM'
  if (s.includes('kimi') || s.startsWith('moonshotai/')) return 'Kimi'
  if (s.includes('minimax')) return 'MiniMax'
  if (s.includes('hunyuan') || s.startsWith('tencent/')) return 'Hunyuan'
  if (s.includes('ernie') || s.startsWith('baidu/')) return 'ERNIE'
  if (s.startsWith('bytedance')) return 'Seed'
  if (s.startsWith('stepfun/')) return 'Step'
  if (s.includes('claude') || s.startsWith('anthropic/')) return 'Claude'
  if (s.includes('gpt') || s.startsWith('openai/')) return 'GPT'
  if (s.includes('gemini') || s.startsWith('google/')) return 'Gemini'
  if (s.includes('grok') || s.startsWith('x-ai/')) return 'Grok'
  if (s.includes('llama')) return 'Llama'
  if (s.includes('mistral')) return 'Mistral'
  return ''
}
