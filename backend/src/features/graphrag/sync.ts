// ============================================
// DAYA IA — GraphRAG Sync: incrementally build graph from existing data
// Extracts entities from DocChunks and Memory, stores them in the knowledge graph.
// Runs as a background job or on-demand per user.
// ============================================
import { prisma } from '../../lib/prisma'
import { extractGraph, upsertEntities, upsertRelations } from './graph'

const db = prisma as any

// Process a single text block: extract entities + relations and store in graph
export async function processTextForGraph(
  userId: string,
  text: string,
  sourceId: string,
  _sourceType: string,
): Promise<{ entities: number; relations: number }> {
  if (!text || text.length < 100) return { entities: 0, relations: 0 }

  const { entities, relations } = await extractGraph(text.slice(0, 4000))
  if (!entities.length) return { entities: 0, relations: 0 }

  // Upsert entities and build name→id map
  const storedEntities = await upsertEntities(userId, entities, sourceId)
  const entityMap = new Map<string, string>()
  for (let i = 0; i < entities.length; i++) {
    if (storedEntities[i]) entityMap.set(entities[i].name, storedEntities[i])
  }

  // Upsert relations
  await upsertRelations(userId, relations, entityMap, sourceId)

  return { entities: storedEntities.length, relations: relations.length }
}

// Sync all DocChunks for a user into the graph (incremental)
export async function syncDocChunksToGraph(userId: string): Promise<{ processed: number; entities: number; relations: number }> {
  const chunks = await db.docChunk.findMany({
    where: { userId },
    select: { id: true, text: true, source: true },
    take: 200,
  })

  let processed = 0
  let totalEntities = 0
  let totalRelations = 0

  for (const chunk of chunks) {
    const result = await processTextForGraph(userId, chunk.text, chunk.id, 'document')
    if (result.entities > 0) {
      processed++
      totalEntities += result.entities
      totalRelations += result.relations
    }
  }

  return { processed, entities: totalEntities, relations: totalRelations }
}

// Sync memories into the graph (incremental)
export async function syncMemoriesToGraph(userId: string): Promise<{ processed: number; entities: number; relations: number }> {
  const memories = await prisma.memory.findMany({
    where: { userId },
    select: { id: true, content: true },
    take: 100,
  })

  let processed = 0
  let totalEntities = 0
  let totalRelations = 0

  for (const mem of memories) {
    const result = await processTextForGraph(userId, mem.content, mem.id, 'memory')
    if (result.entities > 0) {
      processed++
      totalEntities += result.entities
      totalRelations += result.relations
    }
  }

  return { processed, entities: totalEntities, relations: totalRelations }
}

// Full sync for a user
export async function syncUserGraph(userId: string): Promise<{ docs: any; memories: any }> {
  const docs = await syncDocChunksToGraph(userId)
  const memories = await syncMemoriesToGraph(userId)
  return { docs, memories }
}
