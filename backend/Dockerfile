# syntax=docker/dockerfile:1
### ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Native addons (bcrypt, sqlite3 via connect-sqlite3) require compilation tools on Alpine
RUN --mount=type=cache,id=apk-backend-build,target=/etc/apk/cache \
    apk add python3 make g++

# Install ALL deps (including devDependencies for tsc + prisma CLI)
COPY package.json package-lock.json* ./
RUN --mount=type=cache,id=npm-backend,target=/root/.npm \
    npm ci --no-audit --no-fund

# Generate Prisma client
COPY prisma ./prisma
RUN --mount=type=cache,id=prisma-engines,target=/root/.cache/prisma \
    npx prisma generate

# Compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# Strip devDependencies — keeps native addons (bcrypt, sqlite3) already compiled above
RUN npm prune --omit=dev

### ---- Production stage ----
FROM node:20-alpine AS production
WORKDIR /app

# OpenSSL is required by the Prisma schema engine (used during migrate deploy)
RUN --mount=type=cache,id=apk-backend-prod,target=/etc/apk/cache \
    apk add openssl

# Copy package.json so Node.js knows this is an ESM package ("type": "module")
COPY package.json ./

# Copy compiled node_modules from build stage — native addons already built for Alpine,
# and prisma CLI is included (needed for migrate deploy in the entrypoint)
COPY --from=build /app/node_modules ./node_modules

# Copy compiled code + Prisma schema (needed for migrate deploy)
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Create data & upload directories
RUN mkdir -p /data /app/uploads

# Copy entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
