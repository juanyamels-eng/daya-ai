# actions — Cacheable and self-healing actions

Gives DAYA something no other feature has: **memory of how to do
things**, not just what it knows. The AI discovers the "how" once, it gets
**cached**, and subsequent runs execute **without AI** (fast, cheap, repeatable). If the environment
changes and it breaks, it **self-heals** by re-planning with AI.

No browser (Stagehand depends on Playwright, heavy and not suitable for Railway):
here we transfer the GEM of the pattern —cache + self-healing + "code vs natural
language"— to the realm of data and APIs, which is where DAYA needs it.

## Pieces
- **`actionEngine.ts`** — the engine: planner (AI) + executor (deterministic) +
  verifier, with plan cache (in `DayaSystemConfig`, no migrations) and
  self-healing.
- **`extract.ts`** — structured extraction with schema (like `extract()`).
- **`act.ts`** — natural language action that chains tools (like `act()`).

## `extract` primitive
```ts
import { extract } from './features/actions/extract'

const r = await extract(jsonString, {
  price: { type: 'number', description: 'current price', required: true },
  currency: { type: 'string' },
}, { sourceKind: 'coingecko' })   // sourceKind groups equivalent sources → share plan
// r.data = { price: 64231, currency: 'usd' }, r.usedAI=false if from cache
```
The first time the AI discovers the paths/regex; afterwards they are reused without AI.

## `act` primitive
```ts
import { act } from './features/actions/act'

const r = await act('find the price of bitcoin and give me only the number', [
  myWebSearchTool, myExtractTool,   // deterministic tools
])
// The sequence of steps is cached by goal: repeating does not use AI again.
```

## Endpoints (all JSON)
- `POST /api/actions/extract  { source, schema, format?, sourceKind?, forceReplan? }`
- `POST /api/actions/act      { goal, initialVars?, forceReplan? }`  (uses integrated tools)
- `GET  /api/actions/tools` → integrated tools for `act`
- `POST /api/actions/cache/clear { name, cacheKey? }`

The integrated tools for `act` wrap existing features:
`web_search` (→ searchrank), `query_api` (→ oracle), `extract_fields` (→ extract).

## Why it matters for DAYA
- **Token savings**: repeated extractions and flows stop invoking the AI.
- **Speed**: the cached path is deterministic and instant.
- **Robustness**: if an API or JSON changes shape, it self-heals without you
  touching anything.
- Fits as a layer over `oracle`, `worker` and `flow`: any repeatable step
  can become a cached action.

## Useful response fields
`usedAI` (was the AI called?), `fromCache` (was the plan reused?), `healed` (was it
self-healed?). Useful for measuring how much you are saving.

## Registration in index.ts
```ts
import actionsRoutes from './features/actions/route'
app.use('/api/actions', actionsRoutes)
```

## License
Conceptual inspiration from **Stagehand** (MIT). New code in TypeScript
(clean-room): its code was not copied. Remains under DAYA's license.
