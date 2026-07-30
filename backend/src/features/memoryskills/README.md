# memoryskills — Memory consolidation + learned skills

**Complements** (does not replace) `services/memory.ts`. Adds what was missing:

1. **Audit / consolidation**: reviews ALL memories of a user and
   merges near-duplicates, corrects contradictions, and cleans up redundancies.
   Designed to run occasionally (e.g. from the scheduler), not on every
   message. Uses the existing `Memory` model → **zero migrations**.

2. **Skills**: detects stable user work patterns ("prefers
   bullet points", "programs in TypeScript") and saves them as reusable cards.
   Stored as JSON in `DayaSystemConfig` (existing model), keyed by
   `skills:<userId>` → also needs no migration to get started.

## Endpoints
- `POST   /api/memoryskills/audit` → consolidates the user's memory.
- `GET    /api/memoryskills/skills` → lists the skills.
- `DELETE /api/memoryskills/skills/:id` → deletes a skill.

## Usage from code
```ts
import { learnSkillFromExchange, buildSkillsPromptBlock } from '../memoryskills/memorySkills'

// After responding, learn patterns (alongside extractMemories):
await learnSkillFromExchange(userId, userMessage, aiResponse)

// When building the system prompt, add the skills block:
const extra = await buildSkillsPromptBlock(userId)   // string to CONCATENATE
// systemPrompt = (await buildSystemPrompt(userId, msg)) + extra
```

## Registration in index.ts
```ts
import memorySkillsRoutes from './features/memoryskills/route'
app.use('/api/memoryskills', memorySkillsRoutes)
```

## Periodic activation (optional)
In `services/scheduler.ts` you can call `auditMemories(userId)` for active
users once a day. It is not mandatory: the endpoints already allow triggering it
manually from Settings.

## Future (optional)
If you prefer a dedicated Prisma table for skills instead of JSON, at the end of
`memorySkills.ts` the `UserSkill` model is commented and ready to paste.
