// Acceso genérico a DayaSystemConfig como almacén de JSON.
// Centraliza el patrón findUnique → JSON.parse / upsert → JSON.stringify
// que antes estaba duplicado en 5+ módulos.

import { prisma } from '../lib/prisma'

const db = prisma as any

/** Carga un array de T desde la clave dada. Devuelve [] si no existe o hay error. */
export async function loadConfig<T>(key: string): Promise<T[]> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key } })
    if (!row?.value) return []
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

/** Guarda un array de T en la clave dada. */
export async function saveConfig<T>(key: string, items: T[]): Promise<void> {
  const value = JSON.stringify(items)
  await db.dayaSystemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

/** Carga un objeto único T desde la clave dada. Devuelve null si no existe o hay error. */
export async function loadConfigObj<T>(key: string): Promise<T | null> {
  try {
    const row = await db.dayaSystemConfig.findUnique({ where: { key } })
    if (!row?.value) return null
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

/** Guarda un objeto único T en la clave dada. */
export async function saveConfigObj<T>(key: string, obj: T): Promise<void> {
  const value = JSON.stringify(obj)
  await db.dayaSystemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}
