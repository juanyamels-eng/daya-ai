// ============================================
// DAYA IA — GraphRAG Query: builds context from knowledge graph for the system prompt
// Combines graph traversal with existing vector RAG for deep context retrieval.
// ============================================
import { queryGraph, GraphQueryResult } from './graph'

const GRAPH_HEADER = 'Knowledge Graph context (entities and relationships relevant to this query):'

// Build a text block from graph query results for injection into the system prompt
export function formatGraphContext(results: GraphQueryResult[]): string {
  if (!results.length) return ''

  const lines: string[] = []
  for (const r of results) {
    const entity = r.entity
    lines.push(`• [${entity.type}] ${entity.name}: ${entity.description}`)

    for (const rel of r.relations) {
      const otherId = rel.fromId === entity.id ? rel.toId : rel.fromId
      const other = r.relatedEntities.find(e => e.id === otherId)
      const otherName = other?.name || otherId
      lines.push(`  → ${rel.type} → ${otherName}${rel.description ? ': ' + rel.description : ''}`)
    }
  }

  return `\n\n${GRAPH_HEADER}\n${lines.join('\n')}\n`
}

// Query the graph and format as context block
export async function getGraphContext(userId: string, query: string, topK = 5): Promise<string> {
  const results = await queryGraph(userId, query, topK)
  return formatGraphContext(results)
}

// Combined retrieval: GraphRAG + existing DocRAG + Memory
export async function getHybridContext(userId: string, query: string): Promise<string> {
  const parts: string[] = []

  // GraphRAG
  const graphCtx = await getGraphContext(userId, query, 3).catch(() => '')
  if (graphCtx) parts.push(graphCtx)

  // DocRAG (existing)
  try {
    const { retrieveRelevant } = await import('../docrag/service')
    const docCtx = await retrieveRelevant(userId, query, 4)
    if (docCtx) parts.push(docCtx)
  } catch { /* optional */ }

  // Memory (existing)
  try {
    const { getRelevantMemories } = await import('../../services/memory')
    const memCtx = await getRelevantMemories(userId, query, 6)
    if (memCtx) parts.push(memCtx)
  } catch { /* optional */ }

  return parts.join('\n')
}
