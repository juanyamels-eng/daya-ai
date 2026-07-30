# flow — Workflow engine as state graph

Transforms DAYA from a "linear agent loop" into a **workflow orchestrator**:
you define a graph of steps with branching, shared state, durable execution
and pauses for human approval.

## Pieces
- **`stateGraph.ts`** — the engine: nodes, edges, conditional edges,
  state with reducer, and interrupts (`Interrupt`).
- **`checkpointer.ts`** — durable execution: saves state at each step
  (in `DayaSystemConfig`, no migrations) → survives restarts.
- **`runner.ts`** — `startRun` / `resumeRun`, graph registry by name.
- **`cragFlow.ts`** — example **CRAG** flow that connects your real features.

## The 3 key capabilities
1. **Full graph**: nodes + edges + conditional edges (branches, loops,
   retries) + shared state with reducers.
2. **Durable execution**: each step creates a checkpoint; if the server dies, it
   resumes with `GET /api/flow/:runId` and continues from the last node.
3. **Human-in-the-loop**: a node issues `Interrupt(payload, node)` to PAUSE;
   the frontend shows the decision to the user; `POST /:runId/resume { input }`
   injects the answer and continues.

## Example flow: CRAG (Corrective RAG)
```
START → retrieve → grade ─(sufficient)──────────→ generate → END
                      ├─(insufficient)→ web_search → generate → END
                      └─(sensitive)───→ ask_human ─(approve)→ web_search
                                            └────(reject)→ generate
```
- `retrieve` uses your `docrag`; `web_search` uses your `searchrank`; `grade` and
  `generate` use OpenRouter. `ask_human` pauses on sensitive topics (health/legal/
  finance) and asks for approval before searching external sources.
- Each node is defensive: if a feature is missing, it degrades instead of breaking.

## Endpoints (all JSON)
- `GET  /api/flow/graphs` → available graphs (`["crag"]`).
- `POST /api/flow/start   { graph: "crag", input: { question } }`
- `POST /api/flow/:runId/resume { input: "approve" | "reject" }`
- `GET  /api/flow/:runId` → current checkpoint (state, interrupt, steps).
- `GET  /api/flow` → user's runs.

When a call returns `status: "interrupted"`, the `interrupt.payload` field
contains what the human must decide; respond with `/resume`.

## Registration in index.ts
```ts
import flowRoutes from './features/flow/route'
app.use('/api/flow', flowRoutes)
```

## How to create your own flows
1. Write nodes (`NodeFn<S, C>`): receive state + context, return a patch.
2. Build the graph with `addNode` / `addEdge` / `addConditionalEdges`.
3. Register it with `registerGraph({ name, build, initState, buildCtx })`.
4. Start it by name from `/api/flow/start`.

Flow ideas that fit your features: multi-phase deep research
(`research2`), "verify this claim" (searchrank + grade), document
pipeline (oracle + generate), code review (codemap + generate).

## License
Conceptual inspiration from **LangGraph** (MIT). New TypeScript code
(clean-room): no Python code was copied. Remains under DAYA's license.
