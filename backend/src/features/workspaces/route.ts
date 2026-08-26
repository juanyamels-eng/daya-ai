import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireOrgAccess } from './rbac'

// Includes con relaciones ausentes en el schema generado: se mantiene el acceso dinámico histórico.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const router = Router()

// ============================================
// ORGANIZATIONS
// ============================================

// Create organization
router.post('/orgs', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { name, slug } = req.body

  if (!name || !slug) {
    return res.status(400).json({ error: 'name y slug requeridos' })
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug solo puede contener minúsculas, números y guiones' })
  }

  const existing = await db.organization.findUnique({ where: { slug } })
  if (existing) {
    return res.status(409).json({ error: 'Ese slug ya está en uso' })
  }

  const org = await db.organization.create({
    data: {
      name,
      slug,
      ownerId: userId,
      members: {
        create: { userId, role: 'OWNER' },
      },
      settings: {
        create: {},
      },
    },
    include: { members: true, settings: true },
  })

  res.json({ org })
})

// List user's organizations
router.get('/orgs', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId

  const memberships = await db.membership.findMany({
    where: { userId },
    include: { org: { include: { _count: { select: { members: true, teams: true } } } } },
  })

  const orgs = memberships.map((m: any) => ({
    ...m.org,
    myRole: m.role,
    memberCount: m.org._count.members,
    teamCount: m.org._count.teams,
  }))

  res.json({ orgs })
})

// Get organization details
router.get('/orgs/:slug', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { slug } = req.params

  const org = await db.organization.findUnique({
    where: { slug },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
      teams: true,
      settings: true,
      _count: { select: { members: true, teams: true, projects: true } },
    },
  })

  if (!org) {
    return res.status(404).json({ error: 'Organización no encontrada' })
  }

  const membership = await db.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId } },
  })

  if (!membership) {
    return res.status(403).json({ error: 'No eres miembro de esta organización' })
  }

  res.json({ org: { ...org, myRole: membership.role } })
})

// Update organization
router.put('/orgs/:orgId', requireAuth, requireOrgAccess('ADMIN'), async (req: Request, res: Response) => {
  const { orgId } = req.params
  const { name, logoUrl, defaultModel } = req.body

  const org = await db.organization.update({
    where: { id: orgId },
    data: {
      ...(name && { name }),
      ...(logoUrl !== undefined && { logoUrl }),
    },
  })

  if (defaultModel) {
    await db.orgSettings.update({
      where: { orgId },
      data: { defaultModel },
    })
  }

  res.json({ org })
})

// Delete organization (OWNER only)
router.delete('/orgs/:orgId', requireAuth, requireOrgAccess('OWNER'), async (req: Request, res: Response) => {
  const { orgId } = req.params

  await db.organization.delete({ where: { id: orgId } })
  res.json({ ok: true })
})

// ============================================
// MEMBERS
// ============================================

// Invite member
router.post('/orgs/:orgId/members', requireAuth, requireOrgAccess('ADMIN'), async (req: Request, res: Response) => {
  const { orgId } = req.params
  const { email, role = 'MEMBER' } = req.body

  if (!email) {
    return res.status(400).json({ error: 'email requerido' })
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado con ese email' })
  }

  const existing = await db.membership.findUnique({
    where: { orgId_userId: { orgId, userId: user.id } },
  })

  if (existing) {
    return res.status(409).json({ error: 'El usuario ya es miembro' })
  }

  const membership = await db.membership.create({
    data: { orgId, userId: user.id, role },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  })

  res.json({ membership })
})

// Update member role
router.put('/orgs/:orgId/members/:userId', requireAuth, requireOrgAccess('ADMIN'), async (req: Request, res: Response) => {
  const { orgId, userId: targetUserId } = req.params
  const { role } = req.body
  const currentUserId = req.userId

  // Can't change your own role if you're the owner
  if (currentUserId === targetUserId) {
    const membership = await db.membership.findUnique({
      where: { orgId_userId: { orgId, userId: currentUserId } },
    })
    if (membership?.role === 'OWNER') {
      return res.status(400).json({ error: 'El owner no puede cambiar su propio rol' })
    }
  }

  const membership = await db.membership.update({
    where: { orgId_userId: { orgId, userId: targetUserId } },
    data: { role },
  })

  res.json({ membership })
})

// Remove member
router.delete('/orgs/:orgId/members/:userId', requireAuth, requireOrgAccess('ADMIN'), async (req: Request, res: Response) => {
  const { orgId, userId: targetUserId } = req.params
  const currentUserId = req.userId

  // Can't remove the owner
  const target = await db.membership.findUnique({
    where: { orgId_userId: { orgId, userId: targetUserId } },
  })
  if (target?.role === 'OWNER') {
    return res.status(400).json({ error: 'No se puede eliminar al owner' })
  }

  // Admins can't remove other admins (only owner can)
  if (target?.role === 'ADMIN') {
    const current = await db.membership.findUnique({
      where: { orgId_userId: { orgId, userId: currentUserId } },
    })
    if (current?.role !== 'OWNER') {
      return res.status(403).json({ error: 'Solo el owner puede eliminar a otro admin' })
    }
  }

  await db.membership.delete({
    where: { orgId_userId: { orgId, userId: targetUserId } },
  })

  res.json({ ok: true })
})

// Leave organization
router.post('/orgs/:orgId/leave', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId
  const { orgId } = req.params

  const membership = await db.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })

  if (!membership) {
    return res.status(404).json({ error: 'No eres miembro' })
  }

  if (membership.role === 'OWNER') {
    return res.status(400).json({ error: 'El owner no puede salir. Transfiere la propiedad primero.' })
  }

  await db.membership.delete({
    where: { orgId_userId: { orgId, userId } },
  })

  res.json({ ok: true })
})

// ============================================
// TEAMS
// ============================================

// Create team
router.post('/orgs/:orgId/teams', requireAuth, requireOrgAccess('ADMIN'), async (req: Request, res: Response) => {
  const { orgId } = req.params
  const { name } = req.body
  const userId = req.userId

  if (!name) {
    return res.status(400).json({ error: 'name requerido' })
  }

  const team = await db.team.create({
    data: {
      name,
      orgId,
      members: {
        create: { userId, role: 'LEAD' },
      },
    },
    include: { members: true },
  })

  res.json({ team })
})

// List teams in org
router.get('/orgs/:orgId/teams', requireAuth, requireOrgAccess('VIEWER'), async (req: Request, res: Response) => {
  const { orgId } = req.params

  const teams = await db.team.findMany({
    where: { orgId },
    include: {
      _count: { select: { members: true, projects: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })

  res.json({ teams })
})

// Add member to team
router.post('/teams/:teamId/members', requireAuth, async (req: Request, res: Response) => {
  const { teamId } = req.params
  const { userId: targetUserId, role = 'MEMBER' } = req.body

  const team = await db.team.findUnique({ where: { id: teamId } })
  if (!team) {
    return res.status(404).json({ error: 'Equipo no encontrado' })
  }

  // Verify requester is org admin
  const membership = await db.membership.findUnique({
    where: { orgId_userId: { orgId: team.orgId, userId: req.userId } },
  })
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    return res.status(403).json({ error: 'Se requiere rol admin en la organización' })
  }

  const teamMember = await db.teamMember.create({
    data: { teamId, userId: targetUserId, role },
  })

  res.json({ teamMember })
})

// ============================================
// PROJECTS
// ============================================

// Create project
router.post('/orgs/:orgId/projects', requireAuth, requireOrgAccess('ADMIN'), async (req: Request, res: Response) => {
  const { orgId } = req.params
  const { name, description } = req.body

  if (!name) {
    return res.status(400).json({ error: 'name requerido' })
  }

  const project = await db.workspaceProject.create({
    data: { name, description: description || '', orgId },
  })

  res.json({ project })
})

// List projects in org
router.get('/orgs/:orgId/projects', requireAuth, requireOrgAccess('VIEWER'), async (req: Request, res: Response) => {
  const { orgId } = req.params

  const projects = await db.workspaceProject.findMany({
    where: { orgId, status: { not: 'DELETED' } },
    include: {
      _count: { select: { tasks: true, teams: true } },
      teams: { include: { team: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ projects })
})

// ============================================
// TASKS
// ============================================

// Create task
router.post('/projects/:projectId/tasks', requireAuth, requireOrgAccess('MEMBER'), async (req: Request, res: Response) => {
  const { projectId } = req.params
  const { title, description, priority, assigneeId, dueDate } = req.body

  if (!title) {
    return res.status(400).json({ error: 'title requerido' })
  }

  const task = await db.workspaceTask.create({
    data: {
      title,
      description: description || '',
      priority: priority || 'normal',
      assigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
      projectId,
    },
  })

  res.json({ task })
})

// List tasks in project
router.get('/projects/:projectId/tasks', requireAuth, requireOrgAccess('VIEWER'), async (req: Request, res: Response) => {
  const { projectId } = req.params
  const { status } = req.query

  const tasks = await db.workspaceTask.findMany({
    where: {
      projectId,
      ...(status && { status: status as string }),
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  })

  res.json({ tasks })
})

// Update task
router.put('/tasks/:taskId', requireAuth, requireOrgAccess('MEMBER'), async (req: Request, res: Response) => {
  const { taskId } = req.params
  const { title, description, status, priority, assigneeId, dueDate } = req.body

  const task = await db.workspaceTask.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assigneeId !== undefined && { assigneeId }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    },
  })

  res.json({ task })
})

// Delete task
router.delete('/tasks/:taskId', requireAuth, requireOrgAccess('MEMBER'), async (req: Request, res: Response) => {
  const { taskId } = req.params

  await db.workspaceTask.delete({ where: { id: taskId } })
  res.json({ ok: true })
})

export default router
