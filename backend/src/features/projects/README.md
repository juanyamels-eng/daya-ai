# projects — Project management with AI

Brings structure to your tasks. Today `Task` is a flat list; this adds the
management layer: **projects** that group **issues** with **status**,
**priority**, **labels**, and **cycles** (sprints), plus **progress** — and, importantly, the AI
does the heavy lifting.

## What the AI does (what makes it special)
- **`extractIssuesFromText`** — converts free text or meeting minutes into
  structured issues (title, priority, labels, assignee, date).
- **`importIssuesIntoProject`** — the above, saving them directly into the project.
- **`suggestPriorities`** — proposes priority for unclassified issues.
- **`statusSummary`** — project status summary in natural language.
- **`detectBlockers`** — deterministic bottleneck analysis: blocked
  issues, stalled "in progress" (>10 days), overloaded assignees.

## Structure
- Statuses: `backlog | todo | in_progress | done | cancelled`
- Priorities: `urgent | high | medium | low | none`
- Issues with: labels, assignee, due date, dependencies (`blockedBy`)
- Cycles (sprints) with dates and goal
- `computeProgress`: % complete, count by status/priority, overdue, blocked

## Endpoints (all JSON)
Projects: `GET /api/projects`, `POST /api/projects`, `GET/DELETE /api/projects/:id`
Issues: `POST/PATCH/DELETE /api/projects/:id/issues[/:issueId]`
Cycles: `POST /api/projects/:id/cycles`
AI: `POST /api/projects/extract`, `POST /api/projects/:id/import`,
`GET /api/projects/:id/suggest-priorities`, `/summary`, `/blockers`

## Connects with your features
- **audiointel**: meeting minutes → `import` → automatic issues.
- **flow**: a workflow "transcribe → extract issues → prioritize".
- **worker**: notifications for overdue issues (task-due job, already exists).
- Your `Task` model remains intact; this is a new layer on top.

## No migrations
Everything is stored in `DayaSystemConfig` (JSON per user). When with Claude Code
you want formal tables, at the end of `projectStore.ts` the Prisma models
`Project`/`Issue`/`Cycle` are ready to paste.

## Registration in index.ts
```ts
import projectsRoutes from './features/projects/route'
app.use('/api/projects', projectsRoutes)
```
