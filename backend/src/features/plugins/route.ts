// ============================================
// DAYA IA — Plugin Routes
// CRUD for user-defined plugin tools
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { createPlugin, listPlugins, removePlugin } from './service'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: Request, res: Response) => {
  const plugins = await listPlugins(req.userId)
  res.json({ plugins: plugins.map(p => ({ ...p, code: undefined })) }) // don't expose code in list
})

router.get('/:id', async (req: Request, res: Response) => {
  const plugins = await listPlugins(req.userId)
  const plugin = plugins.find(p => p.id === req.params.id)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  res.json({ plugin })
})

router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId
  const { name, description, parameters, code } = req.body || {}
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' })

  const plugin = await createPlugin(userId, {
    name, description: description || '',
    parameters: parameters || { type: 'object', properties: {} },
    code,
  })

  res.json({ plugin: { ...plugin, code: undefined } })
})

router.delete('/:id', async (req: Request, res: Response) => {
  await removePlugin(req.userId, req.params.id)
  res.json({ success: true })
})

export default router
