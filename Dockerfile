# Multi-stage build for production optimization
FROM node:22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and npm configuration
COPY package*.json .npmrc ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# --- lms-rag build stage (separate pnpm workspace, compiled to plain JS) ---
FROM node:22-alpine AS rag-builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app/lms-rag
COPY lms-rag/ ./
RUN pnpm install --frozen-lockfile && pnpm run build

# Production stage
FROM node:22-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Install runtime dependencies
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs . .

# Copy lms-rag's installed deps + compiled output (overwrites the plain
# source copy above with the built version, node_modules included)
COPY --from=rag-builder --chown=nextjs:nodejs /app/lms-rag ./lms-rag

# Create logs directory
RUN mkdir -p logs && chown nextjs:nodejs logs

USER nextjs

EXPOSE 8006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8006/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
