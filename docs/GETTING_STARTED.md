# 🚀 Getting Started with Daya-AI

Welcome to Daya-AI! This guide will help you set up the project locally and start contributing.

## Prerequisites

- **Node.js:** 18+ ([Download](https://nodejs.org/))
- **PostgreSQL:** 14+ ([Download](https://www.postgresql.org/))
- **Git:** Latest version ([Download](https://git-scm.com/))
- **npm or yarn:** Package manager

## 1️⃣ Clone Repository

```bash
git clone https://github.com/kenii748k-cloud/daya-ai.git
cd daya-ai
```

## 2️⃣ Backend Setup

### Install Dependencies
```bash
cd backend
npm install
```

### Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/daya_dev
DIRECT_URL=postgresql://user:password@localhost:5432/daya_dev

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars-long
JWT_EXPIRES_IN=7d

# OpenRouter (AI Models)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Supabase Auth (Optional)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# Environment
NODE_ENV=development
PORT=4000
```

### Initialize Database
```bash
# Generate Prisma client
npx prisma generate

# Create database and apply migrations
npx prisma migrate dev --name init

# (Optional) Seed database with sample data
npx prisma db seed
```

### Start Backend Server
```bash
npm run dev
```

✅ Backend running at `http://localhost:4000`

## 3️⃣ Frontend Setup

### Install Dependencies
```bash
cd frontend
npm install
```

### Configure Environment
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Start Frontend Server
```bash
npm run dev
```

✅ Frontend running at `http://localhost:3000`

## 4️⃣ Test the Application

### 1. Open Browser
Navigate to `http://localhost:3000`

### 2. Create Account
- Click "Register"
- Fill in email, password, and name
- Click "Create Account"

### 3. Try Chat
- Start a new conversation
- Type: "Hello, how are you?"
- Watch the response stream in real-time

### 4. Try Web Search
- Type: "What's the latest news about AI?"
- The agent will search the web automatically

### 5. Upload Document
- Go to "Documents" tab
- Upload a PDF or text file
- Ask questions about it (RAG)

## 5️⃣ Daya Code (CLI) Setup

### Install CLI Globally
```bash
cd cli
npm install -g .
```

### Authenticate
```bash
daya-code login
# Paste your API token from Settings → API Tokens
```

### Test CLI
```bash
cd ~/your-project
daya-code "add a login form"
```

## 📁 Project Structure

```
daya-ai/
├── 📂 frontend/                 # Next.js React app
│   ├── src/
│   │   ├── app/                # Pages (App Router)
│   │   ├── components/         # React components
│   │   ├── lib/                # Utilities
│   │   ├── store/              # Zustand state
│   │   └── types/              # TypeScript types
│   ├── package.json
│   └── .env.example
│
├── 📂 backend/                  # Express.js API
│   ├── src/
│   │   ├── controllers/        # Route handlers
│   │   ├── features/           # Feature modules
│   │   ├── middleware/         # Auth, validation
│   │   ├── routes/             # API routes
│   │   ├── services/           # External APIs
│   │   └── prisma/             # Database config
│   ├── package.json
│   └── .env.example
│
├── 📂 cli/                      # Terminal agent
│   ├── src/
│   └── package.json
│
├── 📄 README.md                 # Main documentation
├── 📄 CONTRIBUTING.md           # Contribution guide
├── 📄 LICENSE                   # MIT License
└── 📂 docs/
    ├── ARCHITECTURE.md          # System design
    ├── API.md                   # API reference
    ├── GETTING_STARTED.md       # This file
    └── DEPLOYMENT.md            # Deployment guide
```

## 🔧 Common Commands

### Backend
```bash
cd backend

# Start development server
npm run dev

# Run tests
npm test

# Check linting
npm run lint

# Format code
npm run format

# Generate Prisma types
npx prisma generate

# View database GUI
npx prisma studio
```

### Frontend
```bash
cd frontend

# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Format code
npm run format
```

## 🐛 Troubleshooting

### PostgreSQL Connection Error
```bash
# Check if PostgreSQL is running
# macOS (brew)
brew services start postgresql

# Linux (systemd)
sudo systemctl start postgresql

# Windows: Use PostgreSQL installer GUI
```

### Port Already in Use
```bash
# Find process using port 4000 (backend)
lsof -i :4000
# Kill it
kill -9 <PID>

# Or use a different port
PORT=5000 npm run dev
```

### Module Not Found
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Prisma Error
```bash
# Regenerate Prisma client
npx prisma generate

# Reset database (WARNING: Deletes all data)
npx prisma migrate reset
```

## 📝 Environment Variables Reference

### Backend `.env`
| Variable | Description | Example |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@localhost/daya` |
| `DIRECT_URL` | Direct DB connection | `postgresql://user:pass@localhost/daya` |
| `JWT_SECRET` | Token signing secret | `your-secret-key-32-chars-min` |
| `OPENROUTER_API_KEY` | AI models API key | `sk-or-v1-...` |
| `NODE_ENV` | Environment | `development` \| `production` |
| `PORT` | Backend port | `4000` |

### Frontend `.env.local`
| Variable | Description | Example |
|----------|-------------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API endpoint | `http://localhost:4000` |
| `NEXT_PUBLIC_APP_URL` | App URL | `http://localhost:3000` |

## 🚀 Next Steps

1. **Read the Architecture** → See `docs/ARCHITECTURE.md`
2. **Explore the Code** → Check `frontend/src` and `backend/src`
3. **Make a Change** → Try fixing a bug or adding a feature
4. **Submit a PR** → Follow `CONTRIBUTING.md` guidelines
5. **Join Community** → Discussions tab on GitHub

## 💬 Need Help?

- **Issues:** [GitHub Issues](https://github.com/kenii748k-cloud/daya-ai/issues)
- **Discussions:** [GitHub Discussions](https://github.com/GrupoSH/daya-ia/discussions)
- **Email:** support@daya-ai.com

---

**Happy coding! 🎉**
