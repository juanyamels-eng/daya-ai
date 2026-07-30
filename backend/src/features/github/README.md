# github — Advanced GitHub integrations

Three independent tools that return JSON. Built clean-room, in the
`features/` pattern, without touching your code and without migrations.

## 1) `githubGuardian.ts` — safe commits/push
Monitors a **local** repo, generates the commit message with AI and commits+pulls,
**but only if the secret scanner gives the green light**. If it detects high-severity
credentials (private keys, provider API keys, tokens, URLs with
credentials…), it **blocks the push** and tells you where the problem is.

- Requires `git` installed and filesystem access → runs on your machine/a runner,
  **not on Railway** (ephemeral filesystem).
- Uses `git` via `execFile` with arguments in array → no shell injection.
- The scanner (`secretScanner.ts`) is reusable separately.

Endpoints: `GET /api/github/status` · `POST /api/github/scan` · `POST /api/github/commit`
(supports `dryRun: true` to simulate without writing).

## 2) `githubScout.ts` — search and adapt OSS code
Searches repos by query (GitHub Search API), lists code files, retrieves the
content of one, and **adapts** a snippet to DAYA's stack (TS + Express +
Prisma) with AI. Each result includes the **detected license** and a
warning: adapting does not authorize reuse without respecting the source license.

- Works without an API key (with rate limiting). If you define `GITHUB_TOKEN` in the
  environment, it is used automatically for more quota (never exposed to the client).

Endpoints: `POST /api/github/search` · `/files` · `/file` · `/adapt`.

## 3) `githubDocAgent.ts` — automatic technical README
Scans the **local** repo, detects the stack, maps folders, extracts scripts and
dependencies from `package.json`, discovers environment variables (`process.env.X`)
and endpoints (`app.use('/api/...')`), and drafts a professional `README.md` with AI.
By default it does **not write** the file (returns the markdown for review); with
`write: true` it saves it as `README.generated.md`.

Endpoint: `POST /api/github/readme  { path, write?, fileName?, projectName? }`.

## Registration in index.ts
```ts
import githubRoutes from './features/github/route'
app.use('/api/github', githubRoutes)
```

## Security
- Guardian validates that the path is a real git repo before operating.
- The secret scanner obfuscates findings in the report (does not leak the full
  secret in plain text) and distinguishes placeholders/examples from real secrets.
- Scout and Doc Agent limit sizes and depth to avoid overflowing on large
  repos; Scout only reads, never writes.
