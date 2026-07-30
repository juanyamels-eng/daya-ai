# Contributing to DAYA IA

Thank you for your interest in improving DAYA IA. Any contribution is welcome.

## How to contribute

1. **Fork** the repository.
2. Create a branch (`git checkout -b feature/my-improvement`).
3. Make your changes.
4. Make sure typecheck passes:
   ```bash
   cd backend && npx tsc --noEmit
   cd frontend && npx tsc --noEmit
   ```
5. If the frontend builds, also verify:
   ```bash
   cd frontend && npm run build
   ```
   The Google fonts minification warning is harmless.
6. Commit with a descriptive message in English or Spanish.
7. Push to your fork and open a Pull Request.

## Conventions

- **Surgical edits**: don't rewrite entire files. Edit only what's necessary.
- **Style**: code follows existing style (IBM Plex Mono typography, CSS variables color system, Tailwind + inline styles).
- **Language**: new comments can be in Spanish. Variables and functions in English.

## Reporting bugs

Use [GitHub Issues](https://github.com/GrupoSH/daya-ia/issues) with:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Zustand |
| Backend | Node.js, Express, TypeScript, Prisma |
| Database | PostgreSQL (Supabase) |
| AI | OpenRouter API |
| Auth | Supabase Auth + JWT |
| Payments | PayPal |

## Environment variables

Copy `.env.example` files to `.env` and fill in the values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### Backend — minimum for development
- `DATABASE_URL` — PostgreSQL connection string
- `DIRECT_URL` — direct PostgreSQL connection (no pooler)
- `JWT_SECRET` — any random string
- `OPENROUTER_API_KEY` — key from https://openrouter.ai

### Frontend — minimum
- `NEXT_PUBLIC_API_URL=http://localhost:4000`

## Questions

Open an issue or a PR with your question first.
