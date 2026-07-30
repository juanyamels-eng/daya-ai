# searchrank — Search re-ranking (hybrid)

Reorders the results already returned by `services/webSearch.ts` by a
combined score: **title·0.45 + snippet·0.25 + domain·0.20 + recency·0.10**.

Does not touch `webSearch.ts`: it is an optional layer on top. If something fails, it returns
the original order (never breaks).

## Usage from code
```ts
import { searchAndRank } from '../searchrank/ranking'
const sources = await searchAndRank('Spain inflation 2026', 5)
// sources[0] is the best according to relevance + authority + freshness
```

Also `rankResults(query, results)` if you already have the raw results.

## Endpoint (optional)
`POST /api/searchrank  { query, maxResults?, withBreakdown? }`

## Registration in index.ts
```ts
import searchRankRoutes from './features/searchrank/route'
app.use('/api/searchrank', searchRankRoutes)
```

## How to extend it
- Adjust weights in `DEFAULT_WEIGHTS` or pass them via `opts.weights`.
- Expand `TRUSTED_NEWS` / `LOW_VALUE` with domains of your interest.
- If your sources include a publication date, set it in `result.publishedAt`
  (ISO) and recency activates automatically.
