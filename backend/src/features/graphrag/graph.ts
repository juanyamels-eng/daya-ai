// ============================================
// DAYA IA — GraphRAG: Knowledge Graph + Vector hybrid retrieval
// Extracts entities and relationships from documents/conversations,
// stores them as a knowledge graph in PostgreSQL, and provides
// hybrid retrieval combining graph traversal + vector similarity.
// Uses raw SQL in a dedicated schema (like docrag) to avoid Prisma conflicts.
// ============================================
import { prisma } from '../../lib/prisma'
import { embedText } from '../../services/embeddings'
import { chatSingle } from '../../services/openrouter'

const db = prisma as any
const GRAPH_SCHEMA = 'daya_graph'

// ── Entity and Relation types ──
export interface GraphEntity {
  id: string
  name: string
  type: string
  description: string
  userId: string
  sourceId?: string
  embedding?: number[]
}

export interface GraphRelation {
  id: string
  fromId: string
  toId: string
  type: string
  description: string
  weight: number
  userId: string
  sourceId?: string
}

export interface GraphQueryResult {
  entity: GraphEntity
  relations: GraphRelation[]
  relatedEntities: GraphEntity[]
  score: number
}

// ── Schema initialization ──
let _schemaReady: Promise<boolean> | null = null

async function ensureSchema(): Promise<boolean> {
  if (!_schemaReady) _schemaReady = (async () => {
    try {
      await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${GRAPH_SCHEMA}"`)

      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${GRAPH_SCHEMA}"."GraphEntity" (
        "id" text PRIMARY KEY,
        "userId" text NOT NULL,
        "name" text NOT NULL,
        "type" text NOT NULL,
        "description" text DEFAULT '',
        "sourceId" text,
        "embedding" vector(1536),
        "createdAt" timestamptz DEFAULT now()
      )`)

      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${GRAPH_SCHEMA}"."GraphRelation" (
        "id" text PRIMARY KEY,
        "userId" text NOT NULL,
        "fromId" text NOT NULL,
        "toId" text NOT NULL,
        "type" text NOT NULL,
        "description" text DEFAULT '',
        "weight" double precision DEFAULT 1.0,
        "sourceId" text,
        "createdAt" timestamptz DEFAULT now()
      )`)

      // Indexes
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GraphEntity_userId_idx" ON "${GRAPH_SCHEMA}"."GraphEntity" ("userId")`)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GraphEntity_name_idx" ON "${GRAPH_SCHEMA}"."GraphEntity" ("userId", "name")`)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GraphRelation_userId_idx" ON "${GRAPH_SCHEMA}"."GraphRelation" ("userId")`)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GraphRelation_fromId_idx" ON "${GRAPH_SCHEMA}"."GraphRelation" ("fromId")`)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GraphRelation_toId_idx" ON "${GRAPH_SCHEMA}"."GraphRelation" ("toId")`)

      // HNSW index for vector similarity
      try {
        await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GraphEntity_embedding_idx" ON "${GRAPH_SCHEMA}"."GraphEntity" USING hnsw ("embedding" vector_cosine_ops)`)
      } catch { /* hnsw may not be available */ }

      return true
    } catch (e: unknown) {
      console.warn('[graphrag] Schema init failed:', e instanceof Error ? e.message : String(e))
      return false
    }
  })()
  return _schemaReady
}

// ── Entity extraction from text ──
const EXTRACT_PROMPT = `Extract entities and relationships from the following text.
Return ONLY valid JSON with this structure:
{
  "entities": [{ "name": "entity name", "type": "person|organization|concept|location|technology|event|product", "description": "brief description" }],
  "relations": [{ "from": "source entity name", "to": "target entity name", "type": "works_at|uses|created_by|related_to|part_of|depends_on|located_in", "description": "brief description", "weight": 0.8 }]
}

Rules:
- Only extract clearly stated entities and relationships
- Use exact names from the text
- Weight: 0.0-1.0 (strength of the relationship)
- Max 20 entities and 30 relations
- If no extractable entities, return {"entities":[],"relations":[]}`

export async function extractGraph(text: string): Promise<{ entities: Array<{ name: string; type: string; description: string }>; relations: Array<{ from: string; to: string; type: string; description: string; weight: number }> }> {
  const result = await chatSingle(
    [{ role: 'user', content: `${EXTRACT_PROMPT}\n\nText:\n${text.slice(0, 6000)}` }],
    'chat',
  )
  try {
    const cleaned = result.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const json = JSON.parse(cleaned)
    return {
      entities: Array.isArray(json.entities) ? json.entities.slice(0, 20) : [],
      relations: Array.isArray(json.relations) ? json.relations.slice(0, 30) : [],
    }
  } catch {
    return { entities: [], relations: [] }
  }
}

// ── Store entities and relations in the graph ──
export async function upsertEntities(
  userId: string,
  entities: Array<{ name: string; type: string; description: string }>,
  sourceId?: string,
): Promise<string[]> {
  if (!(await ensureSchema())) return []
  const ids: string[] = []

  for (const entity of entities) {
    const id = `${userId}_${entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60)}`
    const embedding = await embedText(`${entity.name} ${entity.description}`).catch(() => [])

    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "${GRAPH_SCHEMA}"."GraphEntity" ("id","userId","name","type","description","sourceId","embedding")
         VALUES ($1,$2,$3,$4,$5,$6,$7::vector)
         ON CONFLICT ("id") DO UPDATE SET "description" = EXCLUDED."description", "type" = EXCLUDED."type"`,
        id, userId, entity.name, entity.type, entity.description || '', sourceId || null,
        embedding.length === 1536 ? `[${embedding.join(',')}]` : null,
      )
      ids.push(id)
    } catch { /* continue */ }
  }

  return ids
}

export async function upsertRelations(
  userId: string,
  relations: Array<{ from: string; to: string; type: string; description: string; weight: number }>,
  entityMap: Map<string, string>,
  sourceId?: string,
): Promise<void> {
  if (!(await ensureSchema())) return

  for (const rel of relations) {
    const fromId = entityMap.get(rel.from)
    const toId = entityMap.get(rel.to)
    if (!fromId || !toId) continue

    const id = `${fromId}__${rel.type}__${toId}`
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "${GRAPH_SCHEMA}"."GraphRelation" ("id","userId","fromId","toId","type","description","weight","sourceId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT ("id") DO UPDATE SET "description" = EXCLUDED."description", "weight" = EXCLUDED."weight"`,
        id, userId, fromId, toId, rel.type, rel.description || '', rel.weight || 1.0, sourceId || null,
      )
    } catch { /* continue */ }
  }
}

// ── Query: hybrid graph + vector retrieval ──
export async function queryGraph(
  userId: string,
  query: string,
  topK = 5,
): Promise<GraphQueryResult[]> {
  if (!(await ensureSchema())) return []

  const qVec = await embedText(query).catch(() => [])
  if (qVec.length !== 1536) return []

  try {
    // Vector similarity search on entities
    const entityRows: any[] = await db.$queryRawUnsafe(
      `SELECT "id","name","type","description","sourceId",
              1 - ("embedding" <=> $1::vector) AS score
       FROM "${GRAPH_SCHEMA}"."GraphEntity"
       WHERE "userId" = $2 AND "embedding" IS NOT NULL
       ORDER BY "embedding" <=> $1::vector
       LIMIT $3`,
      `[${qVec.join(',')}]`, userId, topK * 2,
    )

    const relevantEntities = (entityRows || []).filter((r: any) => Number(r.score) >= 0.25).slice(0, topK)
    if (!relevantEntities.length) return []

    // For each relevant entity, get its relations and connected entities
    const results: GraphQueryResult[] = []
    const entityIds = relevantEntities.map((e: any) => e.id)

    // Get all relations involving these entities
    const relationRows: any[] = await db.$queryRawUnsafe(
      `SELECT * FROM "${GRAPH_SCHEMA}"."GraphRelation"
       WHERE "userId" = $1 AND ("fromId" = ANY($2) OR "toId" = ANY($2))`,
      userId, entityIds,
    )

    // Get connected entity IDs
    const connectedIds = new Set<string>()
    for (const r of relationRows || []) {
      if (!entityIds.includes(r.fromId)) connectedIds.add(r.fromId)
      if (!entityIds.includes(r.toId)) connectedIds.add(r.toId)
    }

    // Fetch connected entities
    let connectedEntities: any[] = []
    if (connectedIds.size > 0) {
      connectedEntities = await db.$queryRawUnsafe(
        `SELECT "id","name","type","description" FROM "${GRAPH_SCHEMA}"."GraphEntity"
         WHERE "id" = ANY($1)`,
        [...connectedIds],
      )
    }

    for (const entity of relevantEntities) {
      const rels = (relationRows || []).filter(
        (r: any) => r.fromId === entity.id || r.toId === entity.id,
      )
      const connE = connectedEntities.filter(
        (e: any) => rels.some((r: any) => r.fromId === e.id || r.toId === e.id),
      )

      results.push({
        entity: {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          description: entity.description,
          userId,
          sourceId: entity.sourceId,
        },
        relations: rels.map((r: any) => ({
          id: r.id,
          fromId: r.fromId,
          toId: r.toId,
          type: r.type,
          description: r.description,
          weight: r.weight,
          userId,
          sourceId: r.sourceId,
        })),
        relatedEntities: connE.map((e: any) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          userId,
        })),
        score: Number(entity.score),
      })
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK)
  } catch (e: unknown) {
    console.warn('[graphrag] Query failed:', e instanceof Error ? e.message : String(e))
    return []
  }
}

// ── Delete graph data for a user (or by source) ──
export async function deleteGraphData(userId: string, sourceId?: string): Promise<void> {
  if (!(await ensureSchema())) return
  if (sourceId) {
    await db.$executeRawUnsafe(`DELETE FROM "${GRAPH_SCHEMA}"."GraphRelation" WHERE "userId" = $1 AND "sourceId" = $2`, userId, sourceId)
    await db.$executeRawUnsafe(`DELETE FROM "${GRAPH_SCHEMA}"."GraphEntity" WHERE "userId" = $1 AND "sourceId" = $2`, userId, sourceId)
  } else {
    await db.$executeRawUnsafe(`DELETE FROM "${GRAPH_SCHEMA}"."GraphRelation" WHERE "userId" = $1`, userId)
    await db.$executeRawUnsafe(`DELETE FROM "${GRAPH_SCHEMA}"."GraphEntity" WHERE "userId" = $1`, userId)
  }
}
