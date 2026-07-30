# smartmemory — Intelligent memory resolution

Transforms DAYA's memory from a "growing heap" to a "coherent and up-to-date state".
Instead of accumulating every fact, when new information arrives it **decides what to do**
by comparing it with what is already known.

## The problem it solves
Accumulative memory: the user says in January "I work at Google" and in June
"I started at Microsoft" → TWO contradictory facts remain, and DAYA might use
the old one. Smart Memory prevents this.

## The 4 operations (mem0's idea)
- **ADD** — new fact, not related → save.
- **UPDATE** — updates/contradicts an existing one → replace (Google→Microsoft).
- **DELETE** — the old fact is no longer valid → delete.
- **NONE** — we already knew it → do nothing (avoids duplicates).

## How it works
1. Extracts durable facts from the exchange.
2. For each fact, searches for **related** memories (by embeddings; lexical
   fallback if none).
3. The AI decides the operation (conservative: when in doubt, UPDATE over ADD).
4. Applies the change. If something fails, the safe behavior is to add.

Complements `services/memory.ts` (does not replace it) and relies on your embeddings.

## Endpoints (all JSON)
- `POST /api/smartmemory/remember { userMessage, aiResponse }` → extracts + resolves.
- `POST /api/smartmemory/resolve  { facts:[{content,category?}] }` → resolves given facts.

Response: `{ added, updated, deleted, skipped, decisions[] }` — each decision
explains the operation and why (transparency).

## Recommended integration
In `chatController.ts`, where today you call `extractMemories(...)` after responding,
you can instead use (or additionally use) `smartRemember(userId, message, fullResponse)`
so that memory stays coherent on every turn, not just in the periodic
consolidation of `memoryskills`.

```ts
import('../features/smartmemory/smartMemory').then(m =>
  m.smartRemember(userId, message, fullResponse).catch(() => {})
)
```

## Relationship with memoryskills
- **smartmemory**: resolves conflicts ON THE SPOT (add/update/delete per fact).
- **memoryskills**: PERIODIC bulk consolidation + learns "skills".
Together they keep memory clean both on the fly and in sweeps.

## On the other 3 tools you sent
- **AnythingLLM** (MIT) and **Open WebUI** are complete chat+RAG apps: DAYA already
  is that, they do not add new capability. Open WebUI also has its own restrictive
  license — better not to draw close inspiration.
- **Activepieces** was already used before for the `automations` module.
That is why only the improvement from mem0 was built, which does add something new.

## License
Conceptual inspiration from **mem0** (Apache-2.0). New TypeScript code: no
Python code was copied. Remains under DAYA's license.

## Registration in index.ts
```ts
import smartMemoryRoutes from './features/smartmemory/route'
app.use('/api/smartmemory', smartMemoryRoutes)
```
