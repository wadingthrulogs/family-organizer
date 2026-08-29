# Base images are pinned by digest so a rebuild can't silently pick up a
# different upstream image.
#
# Pin the multi-arch INDEX digest, not a per-platform manifest digest. Refresh with:
#   docker buildx imagetools inspect --format '{{.Manifest.Digest}}' <image>:<tag>
#
# `docker manifest inspect --verbose` returns one entry per platform; taking the
# first gives you linux/amd64, which pulls an unrunnable image on this arm64 Pi
# and fails at the first RUN with "exec format error".
# syntax=docker/dockerfile:1
### ---- Build stage ----
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN --mount=type=cache,id=npm-frontend,target=/root/.npm \
    npm ci --no-audit --no-fund

# Build the SPA — no VITE_API_BASE so axios uses relative "/api/v1"
COPY index.html ./
COPY tsconfig.json tsconfig.node.json ./
COPY vite.config.ts tailwind.config.js postcss.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

### ---- Production stage — nginx with /api reverse-proxy ----
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS production

# Remove default site
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built SPA
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 4173

CMD ["nginx", "-g", "daemon off;"]
