# daya-ai

<div align="center">

![Daya-AI Logo](https://img.shields.io/badge/Daya-AI-blue?style=for-the-badge&logo=robot)

**A single place where all your AI tools work together, get smarter over time, and never make you jump from screen to screen.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue?logo=postgresql)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)
[![Join Community](https://img.shields.io/badge/Join-Community-5865F2)](https://github.com/juanyamels-eng/daya-ai/discussions)
[![Website](https://img.shields.io/badge/Website-daya--ai.com-00a8e8)](https://daya-ai.com)

**[🌐 Visit Website](https://daya-ai.com)** • **[📖 Documentation](https://docs.daya-ai.com)** • **[💬 Discussions](https://github.com/juanyamels-eng/daya-ai/discussions)** • **[🤝 Contributing](CONTRIBUTING.md)**

</div>

---

## 📋 Table of Contents

- [✨ Vision & Mission](#-vision--mission)
- [🎯 Key Features](#-key-features)
- [📸 Screenshots](#-screenshots)
- [🛠️ Tech Stack](#️-tech-stack)
- [🚀 Quick Start](#-quick-start)
- [⚙️ Configuration](#️-configuration)
- [📦 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Vision & Mission

### 🎯 Vision
A unified AI platform where chat, documents, images, code, research, and automation converge into one seamless experience—without juggling multiple tools.

### 🚀 Mission
Build the open-source AI ecosystem that centralizes intelligent workflows, self-heals when APIs change, and lets the AI choose the best model for each task.

**Status**: 🟢 Public Release — Open-source and production-ready.

---

## 🎯 Key Features

### 💬 **Smart Chat & Context**
- Real-time streaming responses with automatic model selection
- Selective memory with embeddings-based RAG on user documents
- 10 automatic tools integrated (web search, URL reading, file analysis, etc.)
- Voice mode with native Web Speech API

### 🧠 **Intelligent Tools**
- **Web Search & Summarization** — retrieve and understand real-time information
- **Document RAG** — extract knowledge from your uploaded files
- **Image Analysis & Generation** — Pollinations (free) + fal.ai (premium)
- **Export Suite** — PDF, Word, Excel, presentations
- **Task Management** — create tasks, notes, events, and documents on the fly

### 💻 **Daya Code** — Terminal AI Agent
- Runs **on your machine**, **in your project**
- Reads, searches, edits, and writes files with precision
- Executes real commands with safety guards
- Parallel exploration agents for faster analysis
- Vision mode to understand screenshots and mockups
- Plan mode for approval before changes
- Self-healing: retries and adapts when things break

### 🔌 **Model Context Protocol (MCP)**
- Expose Daya's tools to any MCP client (Claude Desktop, OpenCode, etc.)
- Connect external services via `~/.daya/mcp.json`
- Compatible with Cline, Continue, Zed, and Aider

### 📊 **Admin Panel**
- Manage users, usage, and subscriptions
- Monitor performance and feature flags
- Access at `/admin`

---

## 📸 Screenshots

<div align="center">

| Feature | Preview |
|:-------:|:--------:|
| **🏠 Landing Page** | ![Landing](screenshots/landing.png) |
| **🔐 Login** | ![Login](screenshots/login.png) |
| **📝 Register** | ![Register](screenshots/register.png) |
| **💳 Pricing** | ![Pricing](screenshots/pricing.png) |
| **💻 Daya Code** | ![Daya Code](screenshots/code.png) |

</div>

---

## 🛠️ Tech Stack

<table>
  <tr>
    <th>Layer</th>
    <th>Technology</th>
    <th>Purpose</th>
  </tr>
  <tr>
    <td><strong>Frontend</strong></td>
    <td>Next.js 14, TypeScript, Tailwind CSS, Zustand</td>
    <td>Modern React SSR with global state management</td>
  </tr>
  <tr>
    <td><strong>Backend</strong></td>
    <td>Node.js, Express, TypeScript</td>
    <td>RESTful API with streaming support</td>
  </tr>
  <tr>
    <td><strong>Database</strong></td>
    <td>PostgreSQL + Prisma ORM</td>
    <td>Relational data with type-safe queries</td>
  </tr>
  <tr>
    <td><strong>AI Models</strong></td>
    <td>OpenRouter API (multi-model support)</td>
    <td>Access to 200+ models with automatic routing</td>
  </tr>
  <tr>
    <td><strong>Image Generation</strong></td>
    <td>Pollinations (free) + fal.ai (premium)</td>
    <td>Text-to-image with quality tiers</td>
  </tr>
  <tr>
    <td><strong>Payments</strong></td>
    <td>PayPal + Payoneer</td>
    <td>Global payment processing</td>
  </tr>
  <tr>
    <td><strong>Authentication</strong></td>
    <td>JWT + Supabase Auth (Google OAuth)</td>
    <td>Secure token-based auth with social login</td>
  </tr>
  <tr>
    <td><strong>Deployment</strong></td>
    <td>Railway, Vercel</td>
    <td>Production hosting and CI/CD</td>
  </tr>
</table>

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+
- **PostgreSQL** 14+
- **Git**

### Installation

#### 1️⃣ **Backend Setup**
```bash
cd backend
cp .env.example .env    # Edit with your API keys
npm install
npx prisma generate
npx prisma migrate dev   # Apply database schema
npm run dev             # Runs on http://localhost:4000
```

#### 2️⃣ **Frontend Setup**
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev             # Runs on http://localhost:3000
```

#### 3️⃣ **Daya Code (Optional)**
```bash
cd cli
npm install -g .
daya-code login         # Paste token from Settings → API Tokens
daya-code "your task here"
```

✅ **Open** [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Configuration

### Backend Environment Variables (`.env`)

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@localhost/daya` | PostgreSQL connection |
| `DIRECT_URL` | ✅ | `postgresql://user:pass@localhost/daya` | Direct connection (no pooling) |
| `JWT_SECRET` | ✅ | `your-secret-key-min-32-chars` | Token signing secret |
| `OPENROUTER_API_KEY` | ✅ | `sk-or-v1-...` | OpenRouter API key |
| `SUPABASE_URL` | ❌ | `https://xxx.supabase.co` | Supabase project URL |
| `SUPABASE_KEY` | ❌ | `eyJa...` | Supabase anon key |
| `PAYPAL_CLIENT_ID` | ❌ | `AeS...` | PayPal sandbox/production |
| `PAYPAL_CLIENT_SECRET` | ❌ | `EG...` | PayPal secret |
| `FAL_AI_KEY` | ❌ | `fal_...` | fal.ai premium images |
| `NODE_ENV` | ❌ | `development` | `development`, `production` |

See `.env.example` for the complete list.

### Frontend Environment Variables (`.env.local`)

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | `http://localhost:4000` | Backend API endpoint |

---

## 📦 Project Structure

```
daya-ai/
│
├── 📂 frontend/                    # Next.js 14 (App Router)
│   └── src/
│       ├── app/                    # Pages & layouts
│       ├── components/             # React components
│       │   ├── Chat/               # Chat interface
│       │   ├── Studio/             # Image generator
│       │   └── Layout/             # Navigation, sidebar
│       ├── lib/                    # Utilities
│       │   ├── api.ts              # API client
│       │   └── config.ts           # App config
│       ├── store/                  # Zustand global state
│       └── types/                  # TypeScript interfaces
│
├── 📂 backend/                     # Node.js + Express
│   └── src/
│       ├── config/                 # Plans, constants
│       ├── controllers/            # Request handlers
│       ├── features/               # Feature modules
│       │   ├── chat/               # Chat logic
│       │   ├── docrag/             # Document RAG
│       │   ├── images/             # Image generation
│       │   ├── agent/              # Coding agent (Daya Code)
│       │   ├── actions/            # Cached actions
│       │   └── oracle/             # Web search, APIs
│       ├── middleware/             # Auth, rate limiting
│       ├── routes/                 # API endpoints
│       ├── services/               # External APIs
│       └── prisma/                 # Database schema
│
├── 📂 cli/                         # Daya Code CLI
│   └── src/
│       ├── agent.ts                # Main agent loop
│       ├── tools.ts                # File/command tools
│       └── mcp.ts                  # MCP integration
│
├── 📄 CONTRIBUTING.md              # Contribution guidelines
├── 📄 CODE_OF_CONDUCT.md           # Community standards
├── 📄 LICENSE                      # MIT License
└── 📄 .github/
    └── workflows/                  # CI/CD pipelines

```

---

## 🔄 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│   Chat UI → Studio (Images) → Code Interface → Admin        │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API + WebSocket
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Express)                          │
│  ┌──────────────┬──────────────┬──────────────┬────────────┐ │
│  │ Chat Engine  │ AI Router    │ Document RAG │ Payments   │ │
│  │ (Streaming)  │(OpenRouter)  │(Embeddings)  │(PayPal)    │ │
│  └──────────────┴──────────────┴──────────────┴────────────┘ │
└─────┬──────────────────────────┬─────────────────────────┬───┘
      │                          │                         │
      ↓                          ↓                         ↓
┌──────────────┐      ┌──────────────────┐    ┌──────────────┐
│ PostgreSQL   │      │ External APIs    │    │   CLI Agent  │
│ (Prisma)     │      │ (OpenRouter,     │    │ (Daya Code)  │
│              │      │  Pollinations,   │    │              │
│              │      │  fal.ai, etc.)   │    │              │
└──────────────┘      └──────────────────┘    └──────────────┘
```

---

## 📚 Feature Breakdown

### Chat Module
- Multi-turn conversations with context preservation
- Automatic tool invocation (web search, file reading, calculations)
- Streaming responses for real-time feedback
- Image understanding via vision models

### Document RAG
- Upload PDFs, Word docs, text files
- Embed documents into vector database
- Retrieval-augmented generation for Q&A

### Daya Code (Terminal Agent)
- Full file system access (read, edit, write)
- Regex-based file search across projects
- Command execution with safety guards
- Vision mode to fix UI bugs from screenshots
- Parallel exploration for large projects

### Actions Engine
- **Cached actions**: discover patterns once, execute without AI
- **Self-healing**: if an API changes, re-plan automatically
- Applies to data extraction, API calls, and complex workflows

### Admin Panel
- User management and quotas
- Plan configuration (free, pro, enterprise)
- Usage analytics and billing
- Feature flags

---

## 🤝 Contributing

We welcome contributions! Please see:

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Development guidelines, PR process
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — Community standards

### Quick Contribution Steps
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 🐛 Issues & Feedback

Found a bug? Want to suggest a feature?
- **[GitHub Issues](https://github.com/juanyamels-eng/daya-ai/issues)** — Report bugs and request features
- **[Discussions](https://github.com/juanyamels-eng/daya-ai/discussions)** — Ask questions and share ideas

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [OpenRouter](https://openrouter.ai) for multi-model access
- [Supabase](https://supabase.com) for auth infrastructure
- [Prisma](https://prisma.io) for type-safe database access
- [Next.js](https://nextjs.org) for the React framework
- The open-source community for inspiration and support

---

<div align="center">

**Made with ❤️ by the Daya-AI team**

[🌐 Visit Website](https://daya-ai.com) • [🐦 Twitter](https://twitter.com/daya_ai) • [💼 LinkedIn](https://linkedin.com/company/daya-ai)

</div>
