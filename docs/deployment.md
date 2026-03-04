# Deployment Guide

## Overview

Family Organizer runs as two Docker containers managed by Docker Compose:

```
┌─────────────────────────────────────────┐
│  Host machine (port 80)               │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  frontend  (nginx :80)         │   │
│  │  • serves React SPA              │   │
│  │  • proxies /api/* → backend:3000 │   │
│  └───────────────┬──────────────────┘   │
│                  │ internal network      │
│  ┌───────────────▼──────────────────┐   │
│  │  backend   (:3000, internal)     │   │
│  │  • Express API                   │   │
│  │  • Prisma + SQLite               │   │
│  │  • runs migrations on start      │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Volumes: sqlite_data  uploads_data     │
└─────────────────────────────────────────┘
```

The frontend nginx container handles SPA routing, static asset caching, gzip compression, and proxies all `/api/` requests to the backend. No separate proxy service is required.

---

## Prerequisites

- **Docker Engine 24+** and **Docker Compose Plugin** (`docker compose` — not `docker-compose`)
- A machine with at least 512 MB free RAM (1 GB recommended)
- Ports: `80` available on the host (configurable via `APP_PORT`)
- Optional: a domain name or local hostname for reverse proxy / TLS setup

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-org/family-organizer.git
cd family-organizer
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in the required values (see [Environment Variable Reference](#environment-variable-reference) below).

**Minimum required values to change:**

```bash
SESSION_SECRET=   # generate below
ENCRYPTION_KEY=   # generate below
APP_BASE_URL=http://localhost:80
```

### 3. Generate secrets

```bash
# SESSION_SECRET (random 32-char string)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ENCRYPTION_KEY (base64-encoded 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the outputs into `backend/.env`.

### 4. Start the app

```bash
docker compose up -d --build
```

The first run builds both images and may take 2–3 minutes. Subsequent starts are fast.

### 5. Create your admin account

Open **http://localhost:80/register** and create the first account. The first registered user should be given the `ADMIN` role (or update the role directly via `PATCH /api/v1/users/:id/role` with an admin session).

---

## Environment Variable Reference

All variables live in `backend/.env`. The `docker-compose.yml` mounts this as `env_file` for the backend container.

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Runtime mode | `production` |
| `PORT` | No | Backend listen port (internal) | `3000` |
| `APP_BASE_URL` | Yes | Public-facing URL (used for OAuth callbacks) | `https://family.local` |
| `SESSION_SECRET` | Yes | Secret for signing session cookies (≥16 chars) | *(generated)* |
| `DATABASE_URL` | Yes | Prisma DB connection string | `file:/data/app.db` |
| `SQLITE_PATH` | Yes | Absolute path to SQLite file in container | `/data/app.db` |
| `ENCRYPTION_KEY` | Yes | Base64-encoded 32-byte key for encrypting OAuth tokens | *(generated)* |
| `TZ` | No | Container timezone | `America/New_York` |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth app client ID | `123....apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth app client secret | `GOCSPX-...` |
| `GOOGLE_REDIRECT_URL` | Optional | Must match Google Console exactly | `https://family.local/api/v1/integrations/google/callback` |
| `SMTP_HOST` | Optional | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | Optional | SMTP port | `587` |
| `SMTP_USER` | Optional | SMTP username / email | `you@gmail.com` |
| `SMTP_PASS` | Optional | SMTP password or app password | *(app password)* |
| `SMTP_FROM` | Optional | From address for outgoing emails | `Family Organizer <you@gmail.com>` |
| `PUSH_VAPID_PUBLIC_KEY` | Optional | VAPID public key for web push | *(generated)* |
| `PUSH_VAPID_PRIVATE_KEY` | Optional | VAPID private key for web push | *(generated)* |
| `OPENWEATHER_API_KEY` | Optional | OpenWeatherMap API key for weather widget | *(from openweathermap.org)* |
| `APP_PORT` | No | Host port for the frontend container (default: 80) | `8080` |

> `DATABASE_URL` and `SQLITE_PATH` are set automatically by `docker-compose.yml` — you only need to set them if doing a manual install.

---

## Changing the Port

By default the app runs on port `80`. To use a different port, set `APP_PORT` in `backend/.env` or pass it inline:

```bash
APP_PORT=8080 docker compose up -d --build
```

---

## Reverse Proxy Setup

The built-in nginx container is sufficient for LAN use. For external access or custom domains, put a reverse proxy in front of it.

### Caddy (recommended for automatic HTTPS)

Install Caddy on the host and create a `Caddyfile`:

```
family.local {
    tls internal          # LAN self-signed cert (use real cert for internet-facing)
    reverse_proxy localhost:80
}
```

```bash
caddy run --config Caddyfile
```

For a public domain with automatic Let's Encrypt:

```
organizer.yourdomain.com {
    reverse_proxy localhost:80
}
```

### Nginx (host-level)

```nginx
server {
    listen 80;
    server_name family.local;

    location / {
        proxy_pass         http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

For HTTPS, add your SSL cert blocks and set `APP_BASE_URL` in `.env` to the HTTPS URL.

### Traefik

Add labels to the `frontend` service in `docker-compose.yml`:

```yaml
frontend:
  build:
    context: ./frontend
  restart: unless-stopped
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.organizer.rule=Host(`family.local`)"
    - "traefik.http.services.organizer.loadbalancer.server.port=80"
```

---

## Google Calendar Integration

Each person or family that self-hosts Family Organizer must create their **own** Google Cloud project and OAuth app. Do not share credentials between deployments — Google's Terms of Service prohibit distributing OAuth client secrets, and keeping credentials per-deployment means your calendar data is only visible to your own registered app.

> **Good news:** Because this is a private family app, you can stay in **Testing** mode permanently. You never need Google's verification process, a public privacy policy, or a security assessment.

### Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click the project dropdown at the top → **New Project**
3. Give it a name (e.g. `Family Organizer`) and click **Create**
4. Make sure the new project is selected in the dropdown before continuing

### Step 2 — Enable the Google Calendar API

1. In the left sidebar go to **APIs & Services → Library**
2. Search for **Google Calendar API** and click it
3. Click **Enable**

### Step 3 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** as the user type and click **Create**
3. Fill in the required fields:
   - **App name:** `Family Organizer` (or whatever you like)
   - **User support email:** your email address
   - **Developer contact information:** your email address
4. Click **Save and Continue** through the Scopes screen (no changes needed — scopes are requested at runtime)
5. On the **Test users** screen, click **Add Users** and enter the Google account email addresses for everyone in your family who will connect their calendar. Only these addresses will be allowed to authorize the app.
6. Click **Save and Continue**, then **Back to Dashboard**
7. **Leave the app in Testing mode** — do not click "Publish App". Testing mode + explicit test users is the correct permanent configuration for a self-hosted family app.

### Step 4 — Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Set **Application type** to **Web application**
4. Give it a name (e.g. `Family Organizer Web`)
5. Under **Authorized redirect URIs**, click **Add URI** and enter your callback URL exactly:
   ```
   https://your-domain/api/v1/integrations/google/callback
   ```
   Replace `your-domain` with your actual domain or IP. This must match `GOOGLE_REDIRECT_URL` in your `.env` character-for-character — no trailing slash, correct scheme (`http` vs `https`).
6. Click **Create**
7. Copy the **Client ID** and **Client Secret** from the popup (you can always retrieve them later from the Credentials page)

### Step 5 — Add Credentials to Your Environment

Open `backend/.env` and set:

```
GOOGLE_CLIENT_ID=123....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URL=https://your-domain/api/v1/integrations/google/callback
```

> Keep `GOOGLE_CLIENT_SECRET` out of version control. Verify it is listed in `.gitignore`.

### Step 6 — Restart and Connect

```bash
docker compose restart backend
```

Then in the app go to **Settings → Integrations → Google Calendar** and click **Connect Google Account**. Each family member signs in with their own Google account (they must be in the test users list from Step 3).

### Troubleshooting

| Problem | Likely cause |
|---------|-------------|
| `redirect_uri_mismatch` error | The URI in Google Console doesn't exactly match `GOOGLE_REDIRECT_URL` in `.env` |
| `Access blocked: app not verified` | The signing-in Google account is not in the Test Users list — add them in the OAuth consent screen |
| Calendar syncs but shows no events | Check that the connected account owns or is shared on those calendars in Google Calendar |
| Events stop updating | Trigger a manual sync: `POST /api/v1/integrations/google/:accountId/sync` or check logs for token errors |

---

## Email Notifications

Set the SMTP variables in `backend/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Family Organizer <you@gmail.com>
```

For Gmail, generate an **App Password** (requires 2FA enabled) at myaccount.google.com → Security → App passwords.

---

## Web Push Notifications

Generate VAPID keys (one-time setup):

```bash
npx web-push generate-vapid-keys
```

Copy the output into `backend/.env`:

```
PUSH_VAPID_PUBLIC_KEY=BN...
PUSH_VAPID_PRIVATE_KEY=...
```

Restart the backend, then subscribe to notifications in the app under **Settings → Notifications**.

---

## Data Persistence

Docker volumes store all persistent data:

| Volume | Contents | Default location on host |
|--------|----------|--------------------------|
| `sqlite_data` | SQLite database (`app.db`) | Docker-managed |
| `uploads_data` | File attachments | Docker-managed |

To find the actual path on disk:

```bash
docker volume inspect organizer_sqlite_data
```

---

## Database Backups

### Manual backup

```bash
# Copy the live database to a local file
docker compose exec backend sqlite3 /data/app.db ".backup '/data/backup-$(date +%F).db'"
docker compose cp backend:/data/backup-$(date +%F).db ./backups/
```

### Automated nightly backup (cron)

Add to your crontab (`crontab -e`):

```cron
0 2 * * * cd /path/to/family-organizer && docker compose exec -T backend sqlite3 /data/app.db ".backup '/data/app-$(date +\%F).db'" && docker compose cp backend:/data/app-$(date +%F).db /backups/ 2>&1 >> /var/log/organizer-backup.log
```

### Restore from backup

```bash
# Stop the backend first to avoid DB lock
docker compose stop backend

# Copy backup into the volume
docker compose cp ./backups/app-2026-01-01.db backend:/data/app.db

# Restart
docker compose start backend
```

---

## Upgrading

```bash
# Pull latest code
git pull

# Rebuild and restart (migrations run automatically on container start)
docker compose up -d --build
```

That's it. The `docker-entrypoint.sh` runs `prisma migrate deploy` before starting the server, so schema changes are applied automatically.

---

## Manual (Non-Docker) Install

For running directly on the host without Docker.

### Backend

```bash
cd backend
cp .env.example .env       # configure for local paths
npm install
npm run build
npx prisma migrate deploy  # apply migrations to prod DB
node dist/index.js
```

**systemd service** (`/etc/systemd/system/organizer-backend.service`):

```ini
[Unit]
Description=Family Organizer Backend
After=network.target

[Service]
Type=simple
User=organizer
WorkingDirectory=/opt/family-organizer/backend
EnvironmentFile=/opt/family-organizer/backend/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now organizer-backend
```

### Frontend

```bash
cd frontend
npm install
npm run build              # outputs to frontend/dist
```

Serve `frontend/dist` with Nginx:

```nginx
server {
    listen 80;
    server_name family.local;
    root /opt/family-organizer/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Raspberry Pi / ARM64 Notes

The Dockerfiles use `node:20-alpine` and `nginx:alpine`, both of which have ARM64 variants. Docker on a Raspberry Pi 4 (64-bit OS) or NAS running ARM64 will pull the correct architecture automatically.

Build times on Pi are slower (~5–10 min on first build). Consider building on an x86 machine and pushing to a registry, or use `docker buildx` for multi-platform builds.

SQLite performs well on SD card/USB storage but use a USB SSD for better write endurance and speed if running long-term.

---

## Troubleshooting

### App won't load — `connection refused` on port 80

The frontend container may still be starting. Check:

```bash
docker compose ps
docker compose logs frontend
```

The backend must pass its health check before the frontend starts (`depends_on: condition: service_healthy`).

### Backend health check failing

```bash
docker compose logs backend
```

Common causes:
- `SESSION_SECRET` or `ENCRYPTION_KEY` not set (server exits immediately)
- DB migration failed (check for schema errors in logs)
- Port 3000 conflict inside the container (rare)

### Database locked (`SQLITE_BUSY`)

SQLite only supports one writer at a time. If you see this in logs:
- Ensure only one backend container is running (`docker compose ps`)
- The DB file uses WAL mode by default — confirm with: `docker compose exec backend sqlite3 /data/app.db "PRAGMA journal_mode;"`

### Google Calendar not syncing

- Confirm all three `GOOGLE_*` variables are set and the redirect URI matches exactly (no trailing slash)
- Trigger a manual sync: `POST /api/v1/integrations/google/:accountId/sync`
- Check logs: `docker compose logs backend | grep -i google`

### Push notifications not arriving

- Confirm `PUSH_VAPID_PUBLIC_KEY` and `PUSH_VAPID_PRIVATE_KEY` are set
- The browser must grant notification permission
- Notifications are processed on-demand via `POST /api/v1/notifications/process` — in production, call this on a schedule (cron or external scheduler)

### `401 Unauthorized` on every request

- The session cookie isn't being sent — check `APP_BASE_URL` matches the URL you're accessing the app from
- If behind a reverse proxy, ensure `X-Forwarded-Proto` is set correctly so the session cookie `secure` flag works

### Weather widget is blank

- Set `OPENWEATHER_API_KEY` in `.env` and restart the backend
- Set `weatherLocation` in **Settings → Household** (city name or `lat,lon`)
