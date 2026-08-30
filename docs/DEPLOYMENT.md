# 🚀 Deployment Guide

This guide covers deploying Daya-AI to production using **Vercel** (frontend) and **Railway** (backend).

## Prerequisites

- GitHub account (for OAuth during deployment)
- Vercel account ([vercel.com](https://vercel.com))
- Railway account ([railway.app](https://railway.app))
- PostgreSQL database (Railway provides this)
- API keys for external services (OpenRouter, Supabase, etc.)

---

## 1️⃣ Backend Deployment (Railway)

### Step 1: Push Code to GitHub
```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### Step 2: Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize GitHub
5. Select `kenii748k-cloud/daya-ai` repository
6. Choose `backend` as the root directory

### Step 3: Add PostgreSQL Database
1. In Railway dashboard, click "+New"
2. Select "Database"
3. Choose "PostgreSQL"
4. Railway automatically sets `DATABASE_URL` environment variable

### Step 4: Configure Environment Variables

In Railway dashboard, go to **Variables** tab and add:

```env
NODE_ENV=production
JWT_SECRET=your-production-secret-key-32-chars-min
JWT_EXPIRES_IN=7d
OPENROUTER_API_KEY=sk-or-v1-your-production-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-production-anon-key
PAYPAL_CLIENT_ID=your-paypal-id
PAYPAL_CLIENT_SECRET=your-paypal-secret
FAL_AI_KEY=your-fal-ai-key
FRONTEND_URL=https://your-domain.vercel.app
```

### Step 5: Deploy
1. Click "Deploy" button
2. Railway builds and deploys automatically
3. You'll get a backend URL like: `https://daya-backend-prod.railway.app`

### Step 6: Run Database Migrations

In Railway, open the **Terminal** and run:
```bash
npx prisma migrate deploy
```

---

## 2️⃣ Frontend Deployment (Vercel)

### Step 1: Connect to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import GitHub repository
3. Select `kenii748k-cloud/daya-ai`
4. Set root directory to `frontend`

### Step 2: Configure Environment Variables

In Vercel project settings:

```env
NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

### Step 3: Deploy
1. Click "Deploy"
2. Vercel builds and deploys automatically
3. You'll get a frontend URL like: `https://daya-ai.vercel.app`

### Step 4: Custom Domain (Optional)
1. In Vercel, go to **Settings → Domains**
2. Add your custom domain (e.g., `daya-ai.com`)
3. Update DNS records in your domain provider
4. Wait for verification (usually 24-48 hours)

---

## 3️⃣ Database Backup & Maintenance

### Automatic Backups

Railway PostgreSQL includes automatic daily backups.

**Access backups:**
1. In Railway, select PostgreSQL database
2. Go to "Backups" tab
3. Download or restore from backup

### Manual Backup

```bash
# Export database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql
```

### Database Monitoring

```bash
# Connect to production database
psql $DATABASE_URL

# Useful queries
SELECT * FROM "User" LIMIT 10;
SELECT COUNT(*) FROM "Message";
SELECT * FROM "Document";
```

---

## 4️⃣ Monitoring & Logging

### Railway Logs

1. Open Railway dashboard
2. Select the backend service
3. Click "Logs" tab
4. View real-time logs

### Vercel Logs

1. Open Vercel dashboard
2. Select project
3. Click "Logs" tab
4. Filter by function/edge logs

### Error Tracking (Recommended)

Set up **Sentry** for error tracking:

```bash
# In backend
npm install @sentry/node

# In frontend
npm install @sentry/react
```

---

## 5️⃣ CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      # Backend tests
      - name: Backend Tests
        run: |
          cd backend
          npm install
          npm test
      
      # Frontend tests
      - name: Frontend Tests
        run: |
          cd frontend
          npm install
          npm test
      
      # Linting
      - name: Lint
        run: |
          cd backend && npm run lint
          cd ../frontend && npm run lint
```

---

## 6️⃣ Scaling Considerations

### Horizontal Scaling

**Backend:**
- Railway: Use "Deploy on PR" to test changes
- Scale CPU/RAM in Railway settings
- Load balancing: Use Railway's built-in load balancing

**Frontend:**
- Vercel: Automatically scales
- Use CDN for static assets
- Edge functions for API routes

### Database Optimization

```sql
-- Add indexes for better performance
CREATE INDEX idx_messages_user_id ON "Message"("userId");
CREATE INDEX idx_documents_user_id ON "Document"("userId");
CREATE INDEX idx_chunks_document_id ON "Chunk"("documentId");

-- Check index usage
SELECT * FROM pg_stat_user_indexes;
```

### Caching Strategy

```typescript
// Backend: Redis caching
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache user data
const getCachedUser = async (userId: string) => {
  const cached = await redis.get(`user:${userId}`);
  if (cached) return JSON.parse(cached);
  
  const user = await db.user.findUnique({ where: { id: userId } });
  await redis.set(`user:${userId}`, JSON.stringify(user), 'EX', 3600);
  return user;
};
```

---

## 7️⃣ Security Checklist

- [ ] All API keys in environment variables
- [ ] HTTPS enabled (automatic on Vercel/Railway)
- [ ] CORS configured properly
- [ ] Rate limiting enabled
- [ ] SQL injection protection (Prisma handles this)
- [ ] XSS protection enabled (React's default)
- [ ] CSRF tokens in forms
- [ ] Secrets not in version control
- [ ] Database backups configured
- [ ] API authentication required for all endpoints
- [ ] Admin endpoints protected by role-based access

---

## 🆘 Troubleshooting

### Backend won't start
```bash
# Check logs
railway logs

# Common issues:
# 1. Missing environment variables → Add to Railway dashboard
# 2. Database migration failed → Run: npx prisma migrate deploy
# 3. Port conflicts → Railway uses PORT env variable
```

### Frontend build fails
```bash
# Check build logs in Vercel
# Common issues:
# 1. Missing env variables → Check Next.js uses NEXT_PUBLIC_ prefix
# 2. API URL incorrect → Verify NEXT_PUBLIC_API_URL
# 3. Type errors → Run: npm run type-check locally
```

### Database connection issues
```bash
# Verify connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT version();"

# Check if Prisma migrations are up to date
npx prisma migrate status
```

---

## 📊 Performance Monitoring

### Vercel Analytics
1. Dashboard → Settings → Analytics
2. View Web Vitals (CLS, LCP, FID)
3. Monitor performance

### Backend Performance
```bash
# Log API response times
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${duration}ms`);
  });
  next();
});
```

---

## 🔄 Rollback Strategy

### Vercel
1. Go to Deployments tab
2. Click on previous deployment
3. Click "Promote to Production"

### Railway
1. Go to Deployments
2. Select previous deployment
3. Click "Deploy"

---

## 📞 Support

- **Railway Docs:** [railway.app/docs](https://railway.app/docs)
- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)
- **PostgreSQL Docs:** [postgresql.org/docs](https://www.postgresql.org/docs/)

---

**Your app is now in production! 🎉**
