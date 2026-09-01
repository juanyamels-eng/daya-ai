// ============================================
// DAYA IA — Feature: Comparar modelos (a ciegas)
// Lanza el mismo prompt a DOS modelos y devuelve sus respuestas como A y B,
// sin revelar cuál es cuál hasta que el usuario vota. Reusa chatBattle.
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { chatBattle, MODELS, ModelKey } from '../../services/openrouter'

const router = Router()
router.use(requireAuth)

// Conjunto curado de modelos aptos para chat general (para una pelea justa)
const POOL: ModelKey[] = ['claude', 'gpt4', 'flash', 'chat', 'reasoning']

function pickTwo(): [ModelKey, ModelKey] {
  const shuffled = [...POOL].sort(() => Math.random() - 0.5)
  return [shuffled[0], shuffled[1]]
}

// Nombre legible y corto del modelo (para el "reveal")
function pretty(key: ModelKey): string {
  const id = MODELS[key]
  // toma la última parte del id y la limpia un poco
  const tail = id.split('/').pop() || id
  return tail.replace(/-instruct|-001|:free/gi, '').replace(/-/g, ' ')
}

router.post('/', async (req: Request, res: Response) => {
  const { prompt } = req.body as { prompt?: string }
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Falta el prompt.' })

  const [keyA, keyB] = pickTwo()
  try {
    const battle = await chatBattle(prompt.trim(), keyA, keyB)
    // Mezcla aleatoria de A/B para que ni el orden delate al modelo
    const flip = Math.random() < 0.5
    const left = flip ? battle.b : battle.a
    const right = flip ? battle.a : battle.b
    res.json({
      a: { response: left.response, model: left.model, name: pretty(left.model as ModelKey) },
      b: { response: right.response, model: right.model, name: pretty(right.model as ModelKey) },
    })
  } catch (e: unknown) {
    res.status(500).json({ error: (e instanceof Error && e.message) || 'No se pudo comparar.' })
  }
})

export default router
