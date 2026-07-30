# automations — Zapier-style recipes

Allows the user to create **automations**: "WHEN X happens, DO Y, Z" —
connecting DAYA's features in recipes that run on their own. It is the "Zapier of
DAYA", built on top of what you already have.

## How it works
A **recipe** = a **trigger** + a sequence of **actions**. When the
trigger fires, the actions execute in order, passing data through a shared
"bus". Actions can use `{{variables}}` to read results from
previous steps (e.g. `{{researchTitle}}`).

## Integrated pieces (catalog)
**Triggers:** `manual`, `schedule` (scheduled), `new_email` (unread email),
`task_due_soon` (task about to expire).
**Actions:** `create_task`, `create_note`, `web_search` (→ searchrank),
`deep_research` (→ research2), `query_api` (→ oracle), `ai_generate`, `notify`.

Each action wraps an existing feature defensively: if the feature is missing,
the piece fails gracefully without crashing the recipe.

## Ready templates (one click)
- **Daily news summary** — researches a topic every day and saves it as a note.
- **Task due reminder** — notifies when something is about to expire.
- **Crypto price to note** — queries Bitcoin and saves it.

## Endpoints (all JSON)
- `GET  /api/automations/pieces` → catalog of triggers/actions (for the UI).
- `GET  /api/automations/templates` → pre-built templates.
- `GET  /api/automations` · `POST /api/automations` · `PATCH/DELETE /:id`
- `POST /api/automations/:id/run` → execute now (manual).
- `GET  /api/automations/logs` → recent executions.

Create a recipe (example body):
```json
{
  "name": "AI News every day",
  "intervalMin": 1440,
  "trigger": { "triggerId": "schedule", "config": {} },
  "steps": [
    { "actionId": "deep_research", "config": { "topic": "AI news" } },
    { "actionId": "create_note", "config": { "title": "{{researchTitle}}", "content": "{{researchMarkdown}}" } }
  ]
}
```

## Key integration (1 line, so they run automatically)
In `services/scheduler.ts`, inside the `setInterval` that runs every minute, add:
```ts
import { runDueAutomations } from '../features/automations/engine'
await runDueAutomations().catch(() => {})
```
This triggers scheduled/event-driven recipes whose interval has expired. (If you
already added `runWorkerTick()` from the worker module, put them together.)

## Difference with `flow`
- **flow**: AI processes with complex branching (a graph, for advanced cases).
- **automations**: linear recipes triggered by events (for the common user).
They are complementary.

## License
Activepieces is **MIT** at its core (its `ee/` folder is commercial and was NOT
looked at nor used). No code was copied here: only the trigger→action pattern.
Own code in TypeScript. Remains under DAYA's license.

## Registration in index.ts
```ts
import automationsRoutes from './features/automations/route'
app.use('/api/automations', automationsRoutes)
```
