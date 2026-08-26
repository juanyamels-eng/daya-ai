# ============================================
# DAYA IA — Backend Dockerfile (multi-stage)
# ============================================

# ── Stage 1: Build ──
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better cache)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --ignore-scripts

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY tsconfig.json ./
COPY src ./src/

# Build TypeScript
RUN npm run build

# ── Stage 2: Production ──
FROM node:22-alpine AS production

WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S daya && adduser -S daya -u 1001 -G daya

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy generated dist
COPY --from=builder /app/dist ./dist/

# Copy Prisma schema (needed for db push at runtime)
COPY prisma ./prisma/

# Create audio directory for TTS
RUN mkdir -p public/audio && chown -R daya:daya /app

USER daya

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
