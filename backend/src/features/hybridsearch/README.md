# hybridsearch — Hybrid search

Combines **vector** search (semantic: understands meaning) with **lexical**
search (BM25: exact terms, names, acronyms, codes) and **fuses them with
RRF**. It is the direct improvement for your RAG (`docrag`) and your memory (`memory`), which
today do one or the other separately.

## Why hybrid wins
- Vector search understands intent but fails with rare/exact terms.
- Lexical search nails exact matches but does not understand synonyms or intent.
- Fusing them with RRF takes the best of both without requiring their scores to be
  comparable. This is what modern search engines do.

## Pieces
- **`bm25.ts`** — BM25 lexical ranking (saturated TF + IDF + normalization).
- **`rrf.ts`** — `rrfFuse` (ranking fusion) + `VectorIndex` (in-memory
  vector search, with optional approximate mode for many vectors).
- **`hybridSearch.ts`** — ties it all together: vector + BM25 + RRF.

## Usage (recalculates missing embeddings)
```ts
import { hybridSearch } from './features/hybridsearch/hybridSearch'
const hits = await hybridSearch('OAuth login error', docs, { topK: 8 })
```

## Optimal usage (you already have the embeddings, e.g. DocChunk/Memory)
```ts
import { hybridSearchPrecomputed } from './features/hybridsearch/hybridSearch'
import { embedText } from './services/embeddings'

const qv = await embedText(query)
const hits = await hybridSearchPrecomputed(query, qv, docChunks /* {id,text,vector} */, { topK: 6 })
```
This does NOT recalculate anything: it uses the vectors you already stored.

## Endpoints (all JSON)
- `POST /api/hybridsearch  { query, docs:[{id,text,vector?,meta?}], topK?, weights?, approximate? }`
- `POST /api/hybridsearch/rerank { query, items:[{id,text}], topK? }` → BM25 only (fast, no embeddings)

`weights` = `[vectorWeight, lexicalWeight]` (default `[1.2, 1.0]`).
`approximate: true` enables ANN index by cells (useful with thousands of vectors).

## Direct improvement to RAG (recommended)
In `features/docrag/service.ts` → `retrieveRelevant`, today you do vector
search. Replace it with `hybridSearchPrecomputed` passing the `DocChunk`
(with their `embedding`) of the user: you get better results when the query mixes
meaning with exact terms. Same pattern applies to `memory.ts`.

## Note on LanceDB
LanceDB is an engine in Rust with its own storage format: it is NOT
reimplemented in a few files, and besides DAYA already stores embeddings in Postgres
(Memory/DocChunk). That is why we only take the most valuable and portable IDEA
—hybrid search with RRF + BM25— as new TypeScript code, without migrations
or new infrastructure. Inspiration: LanceDB (Apache-2.0); own code.
