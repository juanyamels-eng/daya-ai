# lifecontext — Life Context Agent

Consolidates the user's "live context" and injects it for hyper-personalized
responses: profile, location, **current weather**, time/day period,
**active projects** (from your conversations) and "facts" that the user sets.

No migrations: the context is stored in `DayaSystemConfig` (existing model),
with lazy refresh (TTL 30 min). Weather uses **Open-Meteo** (free, no key).

## Endpoints
- `GET    /api/lifecontext` → current context.
- `POST   /api/lifecontext/location  { city?, region?, country?, lat?, lon? }`
- `POST   /api/lifecontext/fact      { key, value }`
- `DELETE /api/lifecontext/fact/:key`

## Key integration (1 line, optional)
In `services/memory.ts` → at the end of `buildSystemPrompt`, concatenate the block:
```ts
import { buildLifeContextBlock } from '../features/lifecontext/lifeContextAgent'
// …
return basePrompt + (await buildLifeContextBlock(userId))
```
This adds real-time context to the prompt without replacing anything of yours.

## Registration in index.ts
```ts
import lifeContextRoutes from './features/lifecontext/route'
app.use('/api/lifecontext', lifeContextRoutes)
```

## Frontend
Send the browser's location with `POST /api/lifecontext/location` (use the
client's geolocation). The rest is automatic.
