# worker — Background Worker (proactive execution)

DAYA is no longer reactive: it runs background tasks and leaves notifications.

Included jobs:
- **inbox-scan** → checks unread emails (uses your email IMAP feature) and notifies.
- **task-due** → notifies about tasks that are due soon or already overdue.
- **watcher** → monitors a URL and notifies if its content changes or a number crosses
  a threshold (`mode: 'content' | 'number'`, `direction: 'above' | 'below'`).

No migrations: jobs and notifications are stored in `DayaSystemConfig` (JSON).
Each job is isolated: if one fails, it does not affect others or the server.

## Key integration (1 line)
In `services/scheduler.ts`, inside the `setInterval` that runs every minute, add:
```ts
import { runWorkerTick } from '../features/worker/backgroundWorker'
// … inside the setInterval:
await runWorkerTick()
```
The worker only checks users who have jobs (internal index), so it is
cheap even with many users.

## Endpoints
- `GET    /api/worker/jobs` · `POST /api/worker/jobs` · `PATCH /api/worker/jobs/:id` · `DELETE /api/worker/jobs/:id`
- `GET    /api/worker/notifications`
- `POST   /api/worker/notifications/:id/read`
- `DELETE /api/worker/notifications`

Create a price watcher (example body):
```json
{ "kind": "watcher", "intervalMin": 60, "label": "Dollar",
  "config": { "url": "https://…", "mode": "number", "direction": "below", "threshold": 17 } }
```

## Registration in index.ts
```ts
import workerRoutes from './features/worker/route'
app.use('/api/worker', workerRoutes)
```
