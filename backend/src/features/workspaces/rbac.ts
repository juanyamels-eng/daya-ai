import { Request, Response, NextFunction } from 'express'
import { prisma } from '../../lib/prisma'

const db = prisma

// Role hierarchy: OWNER > ADMIN > MEMBER > VIEWER
const ROLE_HIERARCHY: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
}

export interface OrgContext {
  orgId: string
  orgRole: string
}

// Extract orgId from header or query and validate membership
export function requireOrgAccess(minRole: string = 'VIEWER') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    const orgId = req.headers['x-org-id'] as string || req.query.orgId as string

    if (!orgId) {
      return res.status(400).json({ error: 'x-org-id header o orgId query requerido' })
    }

    const membership = await db.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    })

    if (!membership) {
      return res.status(403).json({ error: 'No eres miembro de esta organización' })
    }

    const userLevel = ROLE_HIERARCHY[membership.role] || 0
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0

    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: `Se requiere rol ${minRole} o superior` })
    }

    ;(req as any).orgContext = { orgId, orgRole: membership.role } as OrgContext
    next()
  }
}

// Check if user is member of a team
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const team = await db.team.findUnique({ where: { id: teamId } })
  if (!team) return false

  const membership = await db.membership.findUnique({
    where: { orgId_userId: { orgId: team.orgId, userId } },
  })
  return !!membership
}

// Get all org IDs where user has a specific role or higher
export async function getUserOrgIds(userId: string, minRole: string = 'VIEWER'): Promise<string[]> {
  const memberships = await db.membership.findMany({ where: { userId } })
  return memberships
    .filter((m: any) => (ROLE_HIERARCHY[m.role] || 0) >= (ROLE_HIERARCHY[minRole] || 0))
    .map((m: any) => m.orgId)
}
