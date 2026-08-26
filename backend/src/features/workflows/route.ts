// ============================================
// DAYA IA — Workflow Routes
// POST /api/workflows/run — execute a workflow
// GET /api/workflows — list saved workflows
// POST /api/workflows — save a workflow
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import { heavyLimiter } from '../../middleware/rateLimiter'
import { executeWorkflow, Workflow } from './engine'
import { prisma } from '../../lib/prisma'

const db = prisma
const router = Router()
router.use(requireAuth)

router.get('/', async (req: Request, res: Response) => {
  const userId = req.userId
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `workflows:${userId}` } }).catch(() => null)
  const workflows = row ? JSON.parse(row.value) : []
  res.json({ workflows })
})

router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId
  const { name, description, steps } = req.body || {}
  if (!name || !Array.isArray(steps)) return res.status(400).json({ error: 'name and steps[] required' })

  const workflow: Workflow = {
    id: `wf_${Date.now().toString(36)}`,
    name, description: description || '', steps, createdAt: Date.now(), userId,
  }

  const row = await db.dayaSystemConfig.findUnique({ where: { key: `workflows:${userId}` } }).catch(() => null)
  const workflows: Workflow[] = row ? JSON.parse(row.value) : []
  workflows.push(workflow)

  await db.dayaSystemConfig.upsert({
    where: { key: `workflows:${userId}` },
    update: { value: JSON.stringify(workflows) },
    create: { key: `workflows:${userId}`, value: JSON.stringify(workflows) },
  })

  res.json({ workflow })
})

router.post('/run', heavyLimiter, async (req: Request, res: Response) => {
  const userId = req.userId
  const { workflow, workflowId } = req.body || {}

  let wf = workflow
  if (workflowId && !workflow) {
    const row = await db.dayaSystemConfig.findUnique({ where: { key: `workflows:${userId}` } }).catch(() => null)
    const workflows: Workflow[] = row ? JSON.parse(row.value) : []
    wf = workflows.find((w: Workflow) => w.id === workflowId)
    if (!wf) return res.status(404).json({ error: 'Workflow not found' })
  }

  if (!wf?.steps?.length) return res.status(400).json({ error: 'workflow with steps required' })

  const result = await executeWorkflow(userId, wf)
  res.json(result)
})

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId
  const row = await db.dayaSystemConfig.findUnique({ where: { key: `workflows:${userId}` } }).catch(() => null)
  if (row) {
    const workflows: Workflow[] = JSON.parse(row.value)
    const filtered = workflows.filter((w: Workflow) => w.id !== req.params.id)
    await db.dayaSystemConfig.upsert({
      where: { key: `workflows:${userId}` },
      update: { value: JSON.stringify(filtered) },
      create: { key: `workflows:${userId}`, value: JSON.stringify(filtered) },
    })
  }
  res.json({ success: true })
})

export default router
