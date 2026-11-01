# Deployment Guide

## Overview

Family Organizer runs as two Docker containers managed by Docker Compose:

```
┌──────────────────────────────────────────────────────┐
│  Host machine                                        │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  frontend  (nginx 1.27)                        │  │
│  │  :80  → app            (HTTP mode, default)    │  │
│  │  :80  → 301 to HTTPS   (HTTPS mode)            │  │
│  │  :443 → app            (HTTPS mode)            │  │
│  │  • serves the React SPA                        │  │
│  │  • proxies /api/* and /ws → backend:3000       │  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │ internal network            │
│  ┌──────────────────────▼─────────────────────────┐  │
│  │  backend   (:3000, not published)              │  │
│  │  • Express API + in-process scheduler          │  │
│  │  • Prisma + SQLite (WAL)                       │  │
│  │  • runs migrations on start                    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Volumes: sqlite_data  uploads_data                  │
│  Bind mounts: /etc/tailscale/certs (ro),             │
│               recipe upload/output dirs              │
└──────────────────────────────────────────────────────┘
```

The frontend nginx container handles SPA routing, static asset caching, gzip, security headers, and proxies `/api/` to the backend (12 MB request bodies, 120 s timeouts for recipe-photo extraction). No separate proxy service is required.

The backend runs its own scheduler (a 60-second ticker): reminder delivery, overdue-task escalation every 15 min, Google Calendar sync every 30 min, a daily digest after 08:00, and task cleanup at 03:00 (server `TZ`). No external cron is needed.

---

## Prerequisites

- **Docker Engine 24+** with the Compose plugin (`docker compose`). The `Makefile` and scripts fall back to standalone `docker-compose` if the plugin is missing, but `env_file` with `required: false` needs Compose **v2.24+**.
- At least 512 MB free RAM (1 GB recommended; first build on a Pi needs more)
- Host port `80` free (configurable via `HTTP_PORT`, which also accepts `ip:port`); `443` too if you enable HTTPS (`HTTPS_PORT`)
- Optional: [Tailscale](https://tailscale.com/) for free trusted HTTPS, or your own reverse proxy

---

## Quick Start (recommended)

```bash
git clone https://github.com/wadingthrulogs/family-organizer.git
cd family-organizer
bash setup.sh          # or: make setup
```

The wizard:
1. Generates `SESSION_SECRET` and `ENCRYPTION_KEY`
2. Asks for timezone and the URL people will use (`APP_BASE_URL`, defaulting to your LAN IP)
3. Writes the root `.env` (read by Compose) and `backend/.env` (loaded into the backend container)
4. Creates the recipe-photo host folders so Docker doesn't create them owned by root
5. Builds and starts the containers and polls `http://localhost:${HTTP_PORT}/healthz`

Running `bash setup.sh` again later is a **quick start**: it keeps your secrets, updates the root `.env` in place (your overrides survive), and rebuilds. `make reconfigure` re-runs the full wizard.

### Create your admin account

Open `http://<host>/register`. The **first** registered user becomes `ADMIN`; after that `/register` is disabled and admins add users under **Settings → Users**.

### Enable HTTPS (optional)

```bash
bash tailscale-setup.sh   # or: make tailscale-setup
```

See [HTTPS modes](#https-modes) and [Tailscale-guide.md](../Tailscale-guide.md).

---

## Manual Docker start (without the wizard)

If you'd rather not use `setup.sh`:

```bash
# Root .env — read by docker compose
cat > .env <<EOF
SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
APP_BASE_URL=http://192.168.1.50
SESSION_SECURE=false
TZ=America/New_York
EOF

mkdir -p ~/uploads ~/recipe-output   # recipe-photo folders (see below)
docker compose up -d --build
```

`backend/.env` is optional; create it from `backend/.env.example` if you want to configure integrations by file.

> If `SESSION_SECRET`/`ENCRYPTION_KEY` are missing, the backend entrypoint generates them on first boot and stores them in the data volume (`/data/.secrets.env`). Setting them explicitly is still recommended so they survive a volume reset — and **`ENCRYPTION_KEY` must never change** once secrets are stored, or they can't be decrypted.

---

## Configuration files

| File | Read by | Contains |
|------|---------|----------|
| `.env` (repo root) | Docker Compose (variable interpolation) | Secrets, URL, ports, TLS, recipe dirs — see table below |
| `backend/.env` | Backend container (`env_file`, optional) | Optional integrations: Google, SMTP, VAPID, OpenWeather, `WEBHOOK_URL` |

Precedence inside the backend container: values set in the `environment:` block of `docker-compose.yml` (fed from the root `.env`) **win** over `backend/.env`. On startup, values saved in **Settings → Server Configuration** override env values for Google, SMTP, VAPID, OpenWeather and the app base URL (CORS).

**Apply changes with `make up`.** `make restart` restarts the existing containers and does *not* re-read either env file.

---

## Environment Variable Reference

### Root `.env` (Compose)

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | *(generated)* | Signs session cookies. ≥16 chars. |
| `ENCRYPTION_KEY` | *(generated)* | AES-256-GCM key for secrets at rest. Must be **exactly 32 bytes**: 44-char base64 (`openssl rand -base64 32`) or a 32-character plain string. |
| `APP_BASE_URL` | `http://localhost:80` | URL people use to reach the app. Used for CORS and to derive the Google OAuth callback. |
| `SESSION_SECURE` | `false` | `true` marks the cookie `Secure` — required for HTTPS. |
| `TZ` | `UTC` | Server timezone; drives the digest (08:00) and cleanup (03:00) times. |
| `HTTP_PORT` | `80` | Host port mapped to nginx :80. Accepts `port` or `ip:port` — e.g. `127.0.0.1:8080` if another service on the host already owns :80 (Docker can't bind `0.0.0.0:80` then and the frontend won't start). |
| `HTTPS_PORT` | `443` | Host port mapped to nginx :443 (used only in HTTPS mode). |
| `TLS_HOSTNAME` | *(empty)* | Enables HTTPS using `/etc/tailscale/certs/<TLS_HOSTNAME>.crt` + `.key`. See [HTTPS modes](#https-modes). |
| `RECIPE_UPLOADS_HOST_DIR` | `${HOME}/uploads` | Host folder the recipe-photo watcher watches. |
| `RECIPE_OUTPUT_HOST_DIR` | `${HOME}/recipe-output` | Host folder the watcher writes results to. |
| `RECIPE_EXTRACT_TIMEOUT_MS` | `75000` | How long an upload waits for the watcher before returning 504. |

`APP_PORT` from older versions is ignored — rename it to `HTTP_PORT` (or drop it if it was `443`; HTTPS is now controlled by `TLS_HOSTNAME`/the certificate).

Set by `docker-compose.yml`, don't override: `NODE_ENV=production`, `DATABASE_URL=file:/data/app.db`, `SQLITE_PATH=/data/app.db`, `RECIPE_EXTRACT_UPLOAD_DIR`, `RECIPE_EXTRACT_OUTPUT_DIR`.

### `backend/.env` (optional integrations)

| Variable | Description | Also in Settings UI? |
|----------|-------------|---------------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client | Yes |
| `GOOGLE_REDIRECT_URL` | Leave unset — defaults to `<APP_BASE_URL>/api/v1/integrations/google/callback` | No |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email notifications | Yes |
| `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` | Web push (`npx web-push generate-vapid-keys`) | Yes |
| `OPENWEATHER_API_KEY` | Weather widget | Yes |
| `WEBHOOK_URL` | POST target for webhook notifications | **No — env only** |

Configured **only** in the Settings UI: Mapbox public token and home address (commute), task retention days, household name/timezone/quiet hours/theme/weather location.

Sensitive values saved in the UI are encrypted with `ENCRYPTION_KEY`; the UI shows a "configured" badge instead of the value.

---

## HTTPS modes

The nginx container decides its mode at startup (`frontend/docker-entrypoint.d/40-select-tls.sh`, which logs the choice — check with `docker compose logs frontend`):

1. If `TLS_HOSTNAME` is set and `/etc/tailscale/certs/<TLS_HOSTNAME>.crt` and `.key` exist → **HTTPS mode**.
2. Else, if `/etc/tailscale/certs/` holds exactly one `*.crt`/`*.key` pair → **HTTPS mode** with that hostname.
3. Otherwise → **HTTP mode**.

| | HTTP mode | HTTPS mode |
|---|---|---|
| Port 80 | Serves the app | `301` → `https://…` (except `/healthz`) |
| Port 443 | Not listening | Serves the app (TLS 1.2/1.3, HSTS) |
| Config template | `frontend/nginx/http.conf.template` | `frontend/nginx/https.conf.template` |

Both templates include `frontend/nginx/app-locations.conf` (headers, gzip, `/api/`, `/ws`, SPA fallback, caching; `index.html` is always revalidated so new builds reach wall displays).

When switching modes, also set `APP_BASE_URL` (http vs https) and `SESSION_SECURE` to match, then `make up`. Changes to the nginx templates are baked into the image, so they need a rebuild (`make up`), not `make restart`.

**Tailscale** is the supported way to get a certificate: `bash tailscale-setup.sh` issues it, sets `TLS_HOSTNAME`/`APP_BASE_URL`/`SESSION_SECURE`, and rebuilds. Full walkthrough: [Tailscale-guide.md](../Tailscale-guide.md).

**Your own certificate:** put `<host>.crt` and `<host>.key` in `/etc/tailscale/certs/` (the path is bind-mounted read-only), set `TLS_HOSTNAME=<host>`, and `make up`.

---

## Changing the Port

```bash
# root .env
HTTP_PORT=8080
APP_BASE_URL=http://192.168.1.50:8080
```

then `make up`. In HTTPS mode, set `HTTPS_PORT` instead (and include the port in `APP_BASE_URL` if it isn't 443).

---

## Reverse Proxy Setup

The built-in nginx is enough for LAN or Tailscale use. To put another proxy in front (custom domain, Let's Encrypt), leave the container in **HTTP mode**, move it off port 80, and proxy to it:

```bash
# root .env
HTTP_PORT=8080
APP_BASE_URL=https://organizer.yourdomain.com
SESSION_SECURE=true
```

The backend trusts one proxy hop (`trust proxy = 1`), so make sure your proxy sets `X-Forwarded-Proto`.

### Caddy

```
organizer.yourdomain.com {
    reverse_proxy localhost:8080
}
```

### Nginx (host-level)

```nginx
server {
    listen 443 ssl;
    server_name organizer.yourdomain.com;
    # ssl_certificate ...; ssl_certificate_key ...;

    client_max_body_size 12m;
    location / {
        proxy_pass         http://localhost:8080;
        proxy_http_version 1.1;
        proxy_read_timeout 120s;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

### Traefik

Add labels to the `frontend` service and remove its `ports:`:

```yaml
frontend:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.organizer.rule=Host(`organizer.yourdomain.com`)"
    - "traefik.http.services.organizer.loadbalancer.server.port=80"
```

---

## Google Calendar Integration

Each household that self-hosts must create its **own** Google Cloud project and OAuth client — don't share credentials between deployments. You can stay in **Testing** mode permanently; no verification is needed for a private family app.

### Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Project dropdown → **New Project** → name it (e.g. `Family Organizer`) → **Create**
3. Make sure the new project is selected

### Step 2 — Enable the Google Calendar API

**APIs & Services → Library** → search **Google Calendar API** → **Enable**

### Step 3 — Configure the OAuth Consent Screen

1. **APIs & Services → OAuth consent screen** → **External** → **Create**
2. Fill in app name, support email and developer contact
3. Skip the Scopes screen (the app requests `calendar.readonly` and `userinfo.email` at runtime)
4. **Test users / Audience** → add every Google account that will connect a calendar
5. **Leave the app in Testing mode** — don't publish

### Step 4 — Create OAuth 2.0 Credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type **Web application**
3. **Authorized redirect URIs** → add, character-for-character:
   ```
   <APP_BASE_URL>/api/v1/integrations/google/callback
   ```
   e.g. `http://192.168.1.50/api/v1/integrations/google/callback` or `https://familyorganizer.tail1234.ts.net/api/v1/integrations/google/callback`. No trailing slash; scheme must match.
4. **Create** and copy the Client ID and Client Secret

> **Settings → Server Configuration → Google Calendar** shows the exact redirect URI the backend is using.

### Step 5 — Add the Credentials

Either paste them into **Settings → Server Configuration → Google Calendar** (no restart), or add to `backend/.env`:

```
GOOGLE_CLIENT_ID=123....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

and run `make up`.

### Step 6 — Connect

**Settings → Google Calendar → Connect Google Account**. Each family member signs in with their own Google account (must be a test user).

Sync is incremental every 30 minutes, with an automatic full refresh once a day. Per account you can **Sync** now or **Force full re-sync** (`POST /api/v1/integrations/google/:accountId/full-sync`), which clears sync tokens and drops stale events. Accounts whose token is revoked show an error and are retried after a 24 h cool-down.

### Troubleshooting

| Problem | Likely cause |
|---------|-------------|
| `redirect_uri_mismatch` | The URI in Google Console doesn't exactly match `<APP_BASE_URL>/api/v1/integrations/google/callback`. If you changed `APP_BASE_URL`, change it in the root `.env` and `make up`. |
| `Access blocked: app not verified` | That Google account isn't a test user |
| Syncs but no events | The account doesn't own / isn't shared on those calendars |
| Events stale or duplicated | **Force full re-sync**; check `make logs` for `invalid_grant` (reconnect the account) |
| `409 SYNC_BUSY` | A sync is already running — wait and retry |

---

## Email Notifications

In **Settings → Server Configuration → Email**, or in `backend/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Family Organizer <you@gmail.com>
```

For Gmail, use an **App Password** (requires 2FA).

## Web Push Notifications

```bash
npx web-push generate-vapid-keys
```

Paste into **Settings → Server Configuration → Push Notifications** (or `PUSH_VAPID_*` in `backend/.env` + `make up`). Browsers only allow push on HTTPS (or `localhost`), so enable HTTPS first. Users then enable notifications from the **Notifications** page.

## Webhook Notifications

Set `WEBHOOK_URL` in `backend/.env` and `make up`. Reminders with the webhook channel POST a JSON payload there.

## Commute (Mapbox)

In **Settings → Commute**, enter a Mapbox **public** token (`pk.…`) and the household home address, then add routes (destination, travel mode, days, time window). The **Commute** widget shows live ETAs during each route's window, and calendar events with a location in the next 90 minutes get an automatic "leave by" time. Geocoding results are cached in the database for 30 days.

## Recipe-Photo Import (host watcher)

The **Upload recipe photo** button on the Inventory page needs the host watcher service ([tools/recipe-image-watcher](../tools/recipe-image-watcher/README.md)):

1. The backend writes the uploaded image (≤10 MB, JPG/PNG/WebP) into `RECIPE_UPLOADS_HOST_DIR` (mounted at `/host-recipe-uploads`) alongside a `.ctx.json` with your existing inventory categories.
2. The watcher (systemd, runs Claude Code headless on the host) writes `<image>.json` into `RECIPE_OUTPUT_HOST_DIR`.
3. The backend polls for the result for up to `RECIPE_EXTRACT_TIMEOUT_MS` and returns the items for review.

Both host folders must exist **before** `docker compose up` (setup.sh creates them); otherwise Docker creates them owned by root and the watcher can't write. If the watcher isn't running, uploads time out with `504 EXTRACTION_TIMEOUT`; the rest of the app is unaffected. The watcher only processes files that arrive while it is running.

---

## Data Persistence

| Volume | Contents |
|--------|----------|
| `<project>_sqlite_data` | SQLite database (`/data/app.db`), sessions DB, generated `.secrets.env` |
| `<project>_uploads_data` | Task attachments (`/app/uploads`) |

`<project>` is the Compose project name — the repo folder name by default (e.g. `family-organizer_sqlite_data`). Find the path on disk with `docker volume inspect family-organizer_sqlite_data`.

---

## Database Backups

### Make targets (recommended)

```bash
make backup                                    # stops backend, copies DB to ./backups/app-YYYYMMDD-HHMMSS.db, restarts
make restore FILE=./backups/app-20260101-120000.db   # asks you to type YES, then replaces the live DB
```

The backend image does not include the `sqlite3` CLI; the targets copy the file with `docker compose cp` while the backend is stopped, so the copy is consistent.

### Nightly backup (cron)

```cron
0 2 * * * cd /path/to/family-organizer && make backup >> /var/log/organizer-backup.log 2>&1
```

This stops the backend for a few seconds. Prune `./backups/` periodically.

### In-app export

Admins can download a JSON export under **Settings → Backup & Export** (`GET /api/v1/backup/export`). It covers users, tasks, chores, grocery, inventory, calendar events, reminders and settings, but **not** recipes, meal plans, commute routes, Google accounts, user preferences or attachments — use `make backup` for a complete copy.

---

## Upgrading

```bash
make update        # git pull + docker compose up -d --build
```

The backend entrypoint runs `prisma migrate deploy` before starting, so schema changes apply automatically. Take a `make backup` first.

---

## Manual (Non-Docker) Install

### Backend

```bash
cd backend
cp .env.example .env       # set SESSION_SECRET, ENCRYPTION_KEY, APP_BASE_URL, DATABASE_URL, SQLITE_PATH
npm ci
npm run build
npx prisma migrate deploy
node dist/index.js
```

Only `SESSION_SECRET` and `ENCRYPTION_KEY` are strictly required; everything else has a default (see `backend/src/config/env.ts`). Outside Docker, the backend reads `backend/.env` itself.

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

### Frontend

```bash
cd frontend
npm ci
npm run build              # outputs to frontend/dist
```

Serve `frontend/dist` with nginx; `frontend/nginx/app-locations.conf` is a good starting point (replace `http://backend:3000` with `http://localhost:3000`).

---

## Raspberry Pi / ARM64 Notes

The reference deployment runs on a **Raspberry Pi 5** (64-bit Raspberry Pi OS). The images (`node:20-alpine`, `nginx:1.27-alpine`) are multi-arch, so ARM64 is pulled automatically.

- First build takes ~5–10 minutes (native `bcrypt` compile); later builds use the BuildKit cache.
- Use a USB SSD rather than the SD card for better SQLite write endurance.
- The kiosk page (`/kiosk`) is designed for a wall-mounted screen in Chromium kiosk mode; it requests a screen wake lock and hides the cursor.

---

## Troubleshooting

### Browser can't connect / redirected to an HTTPS page that won't load

Check which mode nginx chose: `docker compose logs frontend | grep -i mode`.
- **HTTPS mode** but you expected HTTP: a certificate exists in `/etc/tailscale/certs/`. Remove it (or set up HTTPS properly) and `make up`.
- **HTTP mode** but you expected HTTPS: `TLS_HOSTNAME` doesn't match the cert file name, or the cert files are missing. Re-run `make tailscale-renew`.
- Is `HTTPS_PORT` free and not firewalled?

### App won't load — `connection refused`

```bash
make status
make logs
```

The frontend starts only after the backend passes its health check.

### Backend health check failing

`make logs`. Common causes:
- `ENCRYPTION_KEY` not exactly 32 bytes (e.g. a 40-char string) — the backend fails when it first encrypts/decrypts
- A migration failed (schema errors in logs)

### Settings in `backend/.env` don't take effect

Run `make up` (not `make restart`). Remember that a value saved in **Settings → Server Configuration** overrides the env file, and anything in the root `.env` overrides `backend/.env`.

### Database locked (`SQLITE_BUSY`)

SQLite allows one writer at a time; WAL mode is enabled automatically. Make sure only one backend container is running (`docker compose ps`) and no other process has the DB file open.

### Push notifications not arriving

- VAPID keys configured (Settings or `backend/.env`)?
- Site served over HTTPS and browser permission granted?
- Reminders are processed automatically every minute; check **Notifications → log** for delivery errors.

### `401 Unauthorized` on every request

- `APP_BASE_URL` must match the URL in the browser (CORS + cookies)
- `SESSION_SECURE=true` on plain HTTP means the browser drops the cookie — set it to `false` or enable HTTPS

### Weather widget is blank

Set the OpenWeather API key (Settings → Server Configuration) and the weather location (Settings → Household, city name or `lat,lon`).

### Recipe-photo upload fails

| Error | Meaning |
|-------|---------|
| `501 EXTRACTION_NOT_CONFIGURED` | Recipe dirs not mounted/configured |
| `504 EXTRACTION_TIMEOUT` | Watcher not running or too slow — `systemctl status recipe-image-watcher` |
| `422 EXTRACTION_PARSE_FAILED` | The watcher produced output that wasn't valid item JSON — check `RECIPE_OUTPUT_HOST_DIR/*.raw.txt` |
