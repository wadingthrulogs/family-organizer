# syntax=docker/dockerfile:1
### ---- Build stage ----
FROM node:20-alpine AS build
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
FROM nginx:1.27-alpine AS production

# Remove default site
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built SPA
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 4173

CMD ["nginx", "-g", "daemon off;"]
