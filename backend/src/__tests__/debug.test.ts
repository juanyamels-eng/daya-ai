import { it, beforeAll } from 'vitest'

beforeAll(() => {
  console.log('LOCAL_LLM_MODEL=', process.env.LOCAL_LLM_MODEL)
  console.log('OPENROUTER_API_KEY=', process.env.OPENROUTER_API_KEY ? 'set' : 'empty')
})

it('debug', async () => {
  const { detectTaskType, detectComplexity, isExpert } = await import('../services/modelSelector')
  console.log('capitalismo ->', detectTaskType('qué es el capitalismo'))
  console.log('capital de Perú ->', detectTaskType('cuál es la capital de Perú'))
  console.log('traduce ->', detectTaskType('traduce hola al inglés'))
  console.log('expert 120 letras ->', isExpert('a'.repeat(120)))
  console.log('complex a*61 ->', detectComplexity('a'.repeat(61)))
})