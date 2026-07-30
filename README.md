# Daya-ai

> **Vision**: A single place where all your AI tools work together, get smarter over time, and never make you jump from screen to screen.

> **Mission**: Build the open AI platform that centralizes chat, documents, images, code, research, and automation into a unified experience — where the AI chooses the best model for each task and the product improves itself without the user lifting a finger.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)
[![Join Community](https://img.shields.io/badge/Join-Community-5865F2)](https://github.com/GrupoSH/daya-ia/discussions)

</div>

---

> **Project Status**: Public release — open-source. Ready for the community.

## Showcase

| Landing Page | Login |
|:---:|:---:|
| ![Landing](screenshots/landing.png) | ![Login](screenshots/login.png) |
| **Register** | **Pricing** |
| ![Register](screenshots/register.png) | ![Pricing](screenshots/pricing.png) |
| **Daya Code** |
| ![Daya Code](screenshots/code.png) |

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Zustand |
| Backend | Node.js, Express, TypeScript, Prisma |
| Database | PostgreSQL |
| AI | OpenRouter API (multiple models) |
| Images | Pollinations (free) + fal.ai (premium) |
| Payments | PayPal + Payoneer |
| Auth | JWT + Supabase Auth (Google) |

## Quick start

```bash
# 1. Backend
cd backend
cp .env.example .env    # edit with your keys
npm install
npx prisma generate
npm run dev

# 2. Frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

### Backend (`.env`) — minimum
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DIRECT_URL` | Direct PostgreSQL connection |
| `JWT_SECRET` | Secret for signing tokens |
| `OPENROUTER_API_KEY` | API key from [OpenRouter](https://openrouter.ai) |

### Frontend (`.env.local`) — minimum
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` in development |

> See `.env.example` in each folder for the full list.

## Features

- **Smart chat** with streaming, automatic image detection, and tools
- **10 automatic tools**: search web, read URLs, RAG on documents, calculations, generate/view images, create tasks/notes/events/documents
- **Selective memory** with embeddings and RAG on user documents
- **Multiple models** via OpenRouter with automatic selection based on task
- **Image generation** with Pollinations (free, no API key needed)
- **Export** to PDF, Word, Excel, and presentations
- **Voice mode** with native dictation (Web Speech API)
- **Coding agent** (Daya Code) that runs in your terminal
- **Admin panel** at `/admin`

## Structure

```
daya-ia/
├── frontend/          # Next.js 14 (App Router)
│   └── src/
│       ├── app/           # Pages
│       ├── components/    # Chat, layout, studio, etc.
│       ├── lib/           # Utilities, API client, config
│       ├── store/         # Global state (Zustand)
│       └── types/         # TypeScript interfaces
├── backend/           # Node.js + Express API
│   └── src/
│       ├── config/        # Plans and configuration
│       ├── controllers/   # Endpoint logic
│       ├── features/      # Modules (agent, docrag, stock, etc.)
│       ├── middleware/    # Auth, rate limiting
│       ├── routes/        # Route definitions
│       └── services/      # OpenRouter, memory, embeddings
├── cli/               # Daya Code — terminal agent
├── LICENSE            # MIT
└── CONTRIBUTING.md    # Contribution guide
```

## Contributing

Check [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](LICENSE).
