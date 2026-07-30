import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

// Singleton de Prisma — evita múltiples conexiones en desarrollo (hot reload)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
