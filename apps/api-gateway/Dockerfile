# Multi-stage build for API Gateway
FROM node:18-alpine AS base

# Install dependencies needed for building native modules
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY pnpm-*.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY packages ./packages
COPY apps/api-gateway ./apps/api-gateway

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder

WORKDIR /app

# Build the types package first
RUN pnpm --filter @pgai/types build

# Build the API Gateway
RUN pnpm --filter @pgai/api-gateway build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory and user
WORKDIR /app
RUN addgroup -g 1001 -S nodejs
RUN adduser -S gateway -u 1001

# Copy built application
COPY --from=builder --chown=gateway:nodejs /app/apps/api-gateway/dist ./dist
COPY --from=builder --chown=gateway:nodejs /app/apps/api-gateway/package.json ./package.json

# Copy built packages
COPY --from=builder --chown=gateway:nodejs /app/packages/types/dist ./node_modules/@pgai/types/dist
COPY --from=builder --chown=gateway:nodejs /app/packages/types/package.json ./node_modules/@pgai/types/

# Install only production dependencies
COPY --from=builder /app/apps/api-gateway/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Create logs directory
RUN mkdir -p logs && chown gateway:nodejs logs

# Switch to non-root user
USER gateway

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => { process.exit(1); })"

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]