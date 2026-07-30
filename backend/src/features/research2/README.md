# research2 — Iterative Deep Research (with task registry)

Research engine that **plans → searches → reads → detects gaps → searches
again → drafts** a report with citations. Improves upon `services/deepResearch.ts`
(which is NOT touched) in three ways:

1. Multi-round LLM-in-the-loop cycle.
2. Uses `features/searchrank` to read the best sources.
3. **In-memory task registry**: the research runs in the background,
   survives page refreshes, and can be **canceled** or have its status queried.

## Endpoints
- `POST /api/research2/start  { topic, rounds? }` → SSE with live progress.
- `GET  /api/research2/:id` → current status (for reconnecting after refresh).
- `POST /api/research2/:id/cancel` → cancels.
- `GET  /api/research2` → list of the user's researches.
- `POST /api/research2/run  { topic, rounds? }` → synchronous version (no SSE).

## Usage from code (e.g. the agent)
```ts
import { runResearch } from '../research2/engine'
const report = await runResearch('lithium market 2026', { rounds: 3 })
```

## Registration in index.ts
```ts
import research2Routes from './features/research2/route'
app.use('/api/research2', research2Routes)
```

## Notes
- The task registry lives in memory and self-cleans after one hour. If you want
  persistence across restarts, that is the only point to change (Map → table).
- It coexists without conflict with the original `deepResearch.ts`; you can migrate
  when you want or keep both.
