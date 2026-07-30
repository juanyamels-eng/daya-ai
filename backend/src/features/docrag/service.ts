// ============================================
// DAYA IA — Feature: RAG de documentos ("chatea con tus documentos")
// Trocea los documentos del usuario, los embebe y recupera los fragmentos más
// relevantes durante el chat.
//
// Recuperación en 2 niveles:
//   1. pgvector (SQL): si la BD tiene la extensión, la búsqueda por similitud se hace
//      en Postgres (escala, indexada con HNSW, sin el tope de 500 filas).
//   2. Fallback híbrido en memoria (BM25 + coseno en JS) de siempre, si no hay pgvector.
// ============================================
import { prisma } from '../../lib/prisma'
import { embedText } from '../../services/embeddings'
import { hybridSearchPrecomputed, HybridDoc } from '../hybridsearch/hybridSearch'

const db = prisma as any

const RAG_HEADER = 'Fragmentos relevantes de los documentos del usuario (úsalos si responden a su pregunta, y cita el nombre del archivo):'

// Trocea un texto en fragmentos de ~900 caracteres con solape, respetando párrafos.
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = (text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]
  const chunks: string[] = []
  let i = 0
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length)
    // intenta cortar en un salto de párrafo o punto cercano
    if (end < clean.length) {
      const slice = clean.slice(i, end)
      const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '))
      if (cut > size * 0.5) end = i + cut + 1
    }
    chunks.push(clean.slice(i, end).trim())
    i = end - overlap
    if (i < 0) i = 0
    if (end >= clean.length) break
  }
  return chunks.filter(c => c.length > 30)
}

// ── pgvector (búsqueda vectorial en SQL) ──
// Tabla auxiliar "DocChunkVec" gestionada por SQL CRUDO en un SCHEMA PROPIO (daya_rag),
// FUERA de `public`. Motivo crítico: `prisma db push` (que corre en cada deploy) trata
// `public` como suyo — una tabla desconocida ahí puede hacer que el push pida
// --accept-data-loss y ABORTE el arranque. En daya_rag es invisible para Prisma.
// Es un CACHÉ derivado de DocChunk.embedding: si se pierde, se reconstruye solo
// (backfill). Si la BD no tiene pgvector, todo cae con gracia al híbrido en memoria.
const VEC_TABLE = `"daya_rag"."DocChunkVec"`
let _pgInit: Promise<boolean> | null = null
const vecLit = (v: number[]) => `[${v.join(',')}]`

async function ensurePgVector(): Promise<boolean> {
  if (!_pgInit) _pgInit = (async () => {
    try {
      await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`)
      await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "daya_rag"`)
      // Si una versión anterior llegó a crear la tabla en public, se elimina de ahí:
      // es un caché (se reconstruye), y en public es una bomba para prisma db push.
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "public"."DocChunkVec"`).catch(() => {})
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${VEC_TABLE} (
        "chunkId" text PRIMARY KEY,
        "userId" text NOT NULL,
        "docId" text NOT NULL,
        "source" text NOT NULL,
        "text" text NOT NULL,
        "embedding" vector(1536) NOT NULL
      )`)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DocChunkVec_userId_idx" ON ${VEC_TABLE} ("userId")`)
      // HNSW acelera la búsqueda por coseno (pgvector >= 0.5). Si no está, seguimos sin índice.
      try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DocChunkVec_embedding_idx" ON ${VEC_TABLE} USING hnsw ("embedding" vector_cosine_ops)`) } catch {}
      // Backfill / self-heal: reconstruye el caché desde los fragmentos ya indexados.
      await db.$executeRawUnsafe(`INSERT INTO ${VEC_TABLE} ("chunkId","userId","docId","source","text","embedding")
        SELECT c."id", c."userId", c."docId", c."source", c."text",
               ('[' || array_to_string(c."embedding", ',') || ']')::vector
        FROM "DocChunk" c
        WHERE array_length(c."embedding", 1) = 1536
          AND NOT EXISTS (SELECT 1 FROM ${VEC_TABLE} v WHERE v."chunkId" = c."id")
        ON CONFLICT ("chunkId") DO NOTHING`)
      return true
    } catch (e: any) {
      console.warn('[docrag] pgvector no disponible; usando búsqueda en memoria:', e?.message || e)
      return false
    }
  })()
  return _pgInit
}

// Indexa un documento: lo trocea, embebe cada fragmento y los guarda.
// Es tolerante a fallos: si algo falla, no rompe la subida del documento.
export async function indexDocument(userId: string, docId: string, source: string, text: string): Promise<number> {
  const chunks = chunkText(text)
  if (!chunks.length) return 0
  const pg = await ensurePgVector()
  let stored = 0
  for (const chunk of chunks.slice(0, 80)) { // tope de seguridad por documento
    const embedding = await embedText(chunk).catch(() => [] as number[])
    try {
      const created = await db.docChunk.create({ data: { userId, docId, source, text: chunk, embedding } })
      // Espejo en la tabla vectorial (si hay pgvector y el embedding es válido).
      if (pg && embedding.length === 1536) {
        await db.$executeRawUnsafe(
          `INSERT INTO ${VEC_TABLE} ("chunkId","userId","docId","source","text","embedding")
           VALUES ($1,$2,$3,$4,$5,$6::vector) ON CONFLICT ("chunkId") DO NOTHING`,
          created.id, userId, docId, source, chunk, vecLit(embedding)
        ).catch(() => {})
      }
      stored++
    } catch { /* continúa con el siguiente */ }
  }
  return stored
}

// Borra los fragmentos de un documento (al eliminarlo de la biblioteca).
export async function removeDocumentChunks(userId: string, docId: string): Promise<void> {
  await db.docChunk.deleteMany({ where: { userId, docId } }).catch(() => {})
  await db.$executeRawUnsafe(`DELETE FROM ${VEC_TABLE} WHERE "userId" = $1 AND "docId" = $2`, userId, docId).catch(() => {})
}

// Devuelve un bloque de contexto con los fragmentos más relevantes (o '' si nada relevante).
export async function retrieveRelevant(userId: string, query: string, k = 4): Promise<string> {
  if (!query || !query.trim()) return ''
  const qVec = await embedText(query).catch(() => [] as number[])

  // 1) pgvector: búsqueda por similitud en SQL (rápida, indexada, sin tope de filas).
  if (qVec.length === 1536 && await ensurePgVector()) {
    try {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT "source", "text", 1 - ("embedding" <=> $1::vector) AS score
         FROM ${VEC_TABLE}
         WHERE "userId" = $2
         ORDER BY "embedding" <=> $1::vector
         LIMIT $3`,
        vecLit(qVec), userId, k
      )
      // Umbral de relevancia (coseno): descarta fragmentos poco parecidos.
      const relevant = (rows || []).filter((r: any) => Number(r.score) >= 0.2)
      if (relevant.length) {
        const blocks = relevant.map((r: any) => `[${r.source}] ${r.text}`).join('\n\n')
        return `\n\n${RAG_HEADER}\n${blocks}\n`
      }
      // Si pgvector no dio nada (p. ej. caché aún vacío), continúa al fallback.
    } catch (e: any) {
      console.warn('[docrag] búsqueda pgvector falló, usando memoria:', e?.message || e)
    }
  }

  // 2) Fallback: híbrido en memoria de siempre (BM25 + coseno en JS, tope 500 filas).
  const chunks = await db.docChunk.findMany({ where: { userId }, take: 500 }).catch(() => [])
  if (!chunks.length) return ''

  const docs: HybridDoc[] = chunks.map((c: any) => ({
    id: c.id,
    text: c.text,
    vector: (qVec.length && Array.isArray(c.embedding) && c.embedding.length) ? c.embedding : undefined,
    meta: { source: c.source },
  }))

  const hits = await hybridSearchPrecomputed(query, qVec, docs, { topK: k })
  const relevant = hits.filter(h => h.vectorScore === undefined || h.vectorScore >= 0.2)
  if (!relevant.length) return ''

  const blocks = relevant.map(h => `[${h.meta?.source}] ${h.text}`).join('\n\n')
  return `\n\n${RAG_HEADER}\n${blocks}\n`
}
