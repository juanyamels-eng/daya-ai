# 🏗️ Architecture Documentation

## System Overview

Daya-AI is a full-stack AI platform with three main components:

```
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                     │
│  ┌────────────┬──────────────┬──────────────┬────────────┐   │
│  │   Chat    │   Studio    │  Code View   │   Admin     │   │
│  │ Interface │  (Images)   │ (Daya Code)  │   Panel     │   │
│  └────────────┴──────────────┴──────────────┴────────────┘   │
└─────────────────────────┬──────────────────────────────────┘
                          │ REST API + WebSocket (Streaming)
┌─────────────────────────┴──────────────────────────────────┐
│                   Backend (Express.js)                      │
│  ┌──────────────┬──────────────┬──────────────┬──────────┐   │
│  │   Chat      │   AI Router  │   Document  │ Payment  │   │
│  │  Engine     │ (OpenRouter) │    RAG      │ Handler  │   │
│  │ (Streaming) │              │ (Embeddings)│          │   │
│  └──────────────┴──────────────┴──────────────┴──────────┘   │
│                                                               │
│  ┌──────────────┬──────────────┬──────────────┬──────────┐   │
│  │   Coding    │   Actions    │    Tools    │  Admin    │   │
│  │   Agent     │   Engine     │   Executor  │  Routes   │   │
│  │ (Daya Code) │ (Caching)    │  (Web API)  │           │   │
│  └──────────────┴──────────────┴──────────────┴──────────┘   │
└─────┬──────────────────┬──────────────────┬──────────────┬───┘
      │                  │                  │              │
      ↓                  ↓                  ↓              ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐
│ PostgreSQL   │ │ External API │ │ Cache Layer  │ │  Auth   │
│ + Prisma ORM │ │ (OpenRouter, │ │   (Redis)    │ │(Supabase)
│              │ │ Pollinations,│ │              │ │ + JWT   │
│              │ │ fal.ai, etc) │ │              │ │         │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────┘
```

## Core Layers

### 1. Frontend Layer (Next.js 14)

**Location:** `/frontend`

**Key Technologies:**
- **Framework:** Next.js 14 with App Router
- **Styling:** Tailwind CSS + custom components
- **State Management:** Zustand (global state)
- **API Client:** Fetch with custom hooks
- **Real-time:** WebSocket for streaming responses

**Key Directories:**
```
frontend/src/
├── app/                    # App Router pages
│   ├── (auth)/            # Login, register, password reset
│   ├── chat/              # Main chat interface
│   ├── studio/            # Image generation
│   ├── code/              # Daya Code integration
│   └── admin/             # Admin dashboard
├── components/
│   ├── Chat/              # Chat UI components
│   ├── Studio/            # Image studio
│   ├── Layout/            # Navigation, sidebar
│   └── Admin/             # Admin components
├── lib/
│   ├── api.ts             # API client wrapper
│   ├── auth.ts            # Auth utilities
│   └── config.ts          # App configuration
├── store/                 # Zustand stores
│   ├── chatStore.ts       # Chat state
│   ├── userStore.ts       # User state
│   └── appStore.ts        # Global state
└── types/                 # TypeScript interfaces
    ├── chat.ts
    ├── user.ts
    └── api.ts
```

**Key Features:**
- Real-time streaming chat responses
- Image generation and gallery
- File upload for RAG
- Dark/light mode
- Mobile responsive

### 2. Backend Layer (Express.js)

**Location:** `/backend`

**Key Technologies:**
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL + Prisma ORM
- **API Style:** RESTful with WebSocket for streaming
- **Auth:** JWT tokens + Supabase OAuth

**Core Modules:**

#### Chat Engine (`/features/chat`)
```typescript
// Responsibilities:
// - Receive user message + context
// - Call AI model via OpenRouter
// - Stream response to client
// - Save to database
// - Handle tool invocations

POST /api/chat          # Create new message
POST /api/chat/stream   # Stream response
GET /api/messages/:id   # Get message history
```

#### AI Router (`/features/ai`)
- Route tasks to best model based on:
  - Task complexity
  - Cost vs. quality tradeoff
  - User plan level
- Supports 200+ models via OpenRouter
- Fallback logic if primary model fails

#### Document RAG (`/features/docrag`)
```typescript
// Workflow:
// 1. User uploads document
// 2. Split into chunks
// 3. Generate embeddings (OpenAI API)
// 4. Store in PostgreSQL (pgvector)
// 5. On query: retrieve relevant chunks
// 6. Include in context for AI

POST /api/documents/upload
GET /api/documents/:id
POST /api/documents/:id/query
```

#### Daya Code Agent (`/features/agent`)
- Handles file operations (read, write, edit)
- Executes shell commands with safety checks
- Manages project context (git, dependencies)
- Streaming agent thinking/planning
- Vision mode for UI fixes

#### Actions Engine (`/features/actions`)
**Key Concept:** Cache + Self-Heal
```typescript
// First run: AI discovers the "how" → cache plan
// Subsequent runs: execute plan without AI
// If fails: AI re-plans (self-heal)

POST /api/actions/extract  # Extract data with schema
POST /api/actions/act      # Execute cached actions
GET /api/actions/tools     # List available tools
```

**Example:**
```typescript
// First call: Uses AI to discover extraction path
const result = await extract(jsonData, {
  price: { type: 'number', required: true },
  currency: { type: 'string' }
}, { sourceKind: 'coingecko' })
// result: { data, usedAI: true, fromCache: false }

// Second call: Uses cached plan, no AI
const result = await extract(jsonData, {...}, { sourceKind: 'coingecko' })
// result: { data, usedAI: false, fromCache: true }
```

#### Tools (`/features/tools`)
- **Web Search** (via SearchRank)
- **Web Scraper** (read URLs)
- **Calculator** (evaluate expressions)
- **Image Generator** (Pollinations API)
- **File Converter** (to PDF, Excel, etc.)

#### Admin Features (`/features/admin`)
- User management
- Plan/quota configuration
- Usage analytics
- Feature flags
- System health monitoring

**Directory Structure:**
```
backend/src/
├── config/
│   ├── plans.ts          # Free, Pro, Enterprise
│   ├── models.ts         # Model configurations
│   └── constants.ts      # Global constants
├── controllers/          # Route handlers
├── features/            # Feature modules
│   ├── chat/
│   ├── docrag/
│   ├── agent/
│   ├── actions/
│   ├── admin/
│   ├── tools/
│   ├── payments/
│   └── auth/
├── middleware/
│   ├── auth.ts           # JWT verification
│   ├── rateLimiter.ts    # Rate limiting
│   └── errorHandler.ts   # Error handling
├── routes/              # API endpoints
├── services/            # External API wrappers
│   ├── openrouter.ts
│   ├── supabase.ts
│   ├── paypal.ts
│   └── embeddings.ts
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Migration files
└── types/               # TypeScript types
```

### 3. CLI Tool (Daya Code)

**Location:** `/cli`

**Key Features:**
- Runs on user's machine (not cloud)
- Full file system access (with permissions)
- Command execution with safety guards
- Parallel exploration agents
- Vision mode (screenshot understanding)
- MCP server integration

**Workflow:**
```
User: "daya-code 'fix the login bug'"
  ↓
Agent reads project structure (git, package.json)
  ↓
Agent searches for related files (regex, semantic)
  ↓
Agent analyzes code and understands the bug
  ↓
Agent creates a plan (presented to user)
  ↓
User approves (or rejects)
  ↓
Agent executes changes (with diffs shown)
  ↓
Agent runs tests to verify
  ↓
Summary of changes
```

## Data Models

### Core Tables (Prisma Schema)

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  password      String?
  name          String?
  avatar        String?
  plan          Plan      @relation(fields: [planId], references: [id])
  planId        String
  quotas        Quota[]
  messages      Message[]
  documents     Document[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Message {
  id          String    @id @default(cuid())
  user        User      @relation(fields: [userId], references: [id])
  userId      String
  role        String    // "user" | "assistant"
  content     String
  toolCalls   ToolCall[]
  embeddings  Bytes?
  createdAt   DateTime  @default(now())
}

model Document {
  id          String    @id @default(cuid())
  user        User      @relation(fields: [userId], references: [id])
  userId      String
  fileName    String
  content     String
  chunks      Chunk[]
  createdAt   DateTime  @default(now())
}

model Chunk {
  id          String    @id @default(cuid())
  document    Document  @relation(fields: [documentId], references: [id])
  documentId  String
  content     String
  embedding   Vector    // pgvector embedding
  index       Int
}

model Plan {
  id          String    @id @default(cuid())
  name        String    // "free" | "pro" | "enterprise"
  price       Float
  features    String[]
  quotas      Quota[]
}

model Quota {
  id          String    @id @default(cuid())
  user        User      @relation(fields: [userId], references: [id])
  userId      String
  feature     String    // "messages", "documents", "images"
  limit       Int
  used        Int
  resetAt     DateTime
}
```

## API Endpoints

### Chat API
```
POST   /api/chat              # Create message
POST   /api/chat/stream       # Stream response
GET    /api/messages          # Get chat history
DELETE /api/messages/:id      # Delete message
```

### Document RAG API
```
POST   /api/documents/upload  # Upload document
GET    /api/documents         # List documents
GET    /api/documents/:id     # Get document
DELETE /api/documents/:id     # Delete document
POST   /api/documents/:id/query # Query document
```

### Admin API
```
GET    /api/admin/users       # List users
GET    /api/admin/analytics   # Get analytics
POST   /api/admin/plans       # Configure plans
```

## Authentication Flow

```
1. User logs in via email/password or Google
   ↓
2. Backend generates JWT token
   ↓
3. Token stored in httpOnly cookie (secure)
   ↓
4. Frontend sends token in Authorization header
   ↓
5. Backend validates token on each request
   ↓
6. If expired: refresh token endpoint
   ↓
7. User auto-logged out after 30 days
```

## Deployment Architecture

### Development
```
Frontend: localhost:3000
Backend:  localhost:4000
Database: localhost:5432
```

### Production (Railway + Vercel)
```
Frontend:  Vercel (vercel.com)
Backend:   Railway (railway.app)
Database:  Railway PostgreSQL
```

## Performance Optimization

1. **Streaming:** Real-time response streaming via WebSocket
2. **Caching:**
   - Redis for session/token caching
   - Database query caching (Prisma)
   - Model embeddings cache for RAG
3. **Rate Limiting:** Per-user and per-IP
4. **Database Indexing:** On userId, messageId, documentId
5. **Vector DB:** pgvector for semantic search

## Security Measures

1. **Authentication:** JWT + Supabase OAuth
2. **Authorization:** Role-based access control (RBAC)
3. **Input Validation:** Sanitization + schema validation
4. **SQL Injection Prevention:** Prisma parameterized queries
5. **XSS Prevention:** React's built-in escaping
6. **CORS:** Configured per environment
7. **Rate Limiting:** Express middleware
8. **Secrets Management:** Environment variables (never in code)

## Scaling Considerations

### Database
- PostgreSQL with connection pooling (PgBouncer)
- Read replicas for analytics queries
- Partitioning on userId for large tables

### API
- Horizontal scaling (multiple instances)
- Load balancing via Railway/Vercel
- CDN for static assets

### Cache
- Redis cluster for distributed caching
- Session replication across instances

---

For more details, see the README.md and individual module documentation.
