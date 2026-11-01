# Architecture Overview

## High-Level Diagram (Textual)

```
 Browser / wall display (React SPA, Web Push)
        │  HTTP :80  or  HTTPS :443 (Tailscale cert)
        ▼
 ┌──────────────── frontend container (nginx 1.27-alpine) ────────────────┐
 │  static SPA  ·  /api/* → backend:3000  ·  /healthz → backend           │
 └────────────────────────────────────────────────────────────────────────┘
        │ Docker network (backend port is not published to the host)
        ▼
 ┌──────────────── backend container (Node 20, Express, Prisma) ──────────┐
 │  REST /api/v1  ·  sessions  ·  60 s in-process ticker                  │
 │  SQLite /data/app.db (+ sessions.db)  ·  uploads/                      │
 └──────┬────────────────────────────────┬────────────────────────────────┘
        │ outbound APIs                  │ bind-mounted host dirs
        ▼                                ▼
 Google Calendar · Mapbox ·      ~/uploads  ⇄  recipe-image-watcher (systemd, host)
 OpenWeatherMap · SMTP ·         ~/recipe-output     └─ runs `claude` CLI on the host
 Web Push · webhook
```

- **Client Layer**: React single-page app served by the nginx container. Push notifications via the browser Web Push API and a minimal service worker (`frontend/public/sw.js`, push + notification click only — no offline caching).
- **API Server**: Express server handling REST traffic, session auth, RBAC, Zod validation, and rate limiting. Runs as a single Node process — no separate worker or scheduler containers.
- **Domain Services** (`backend/src/services/`, all in the same process):
  - **Calendar sync** (`google-calendar.ts`, `background-sync.ts`): pulls Google events via OAuth into `FamilyEvent`. Triggered manually (`/integrations/google/:id/sync`, `/full-sync`, `/sync-all`) and by the ticker every 30 min. Accounts with auth errors are skipped for 24 h; once a day after 04:00 sync tokens are cleared so the next pass is a drift-correcting full sync. A sync lock returns `409 SYNC_BUSY` on overlap.
  - **Chore rotation** (`chore-rotation.ts`): generates assignments for ROUND_ROBIN / WEIGHTED / MANUAL chores. The next assignment is created when a non-manual chore is created and whenever an assignment is completed or skipped; `POST /chores/generate-all` or `/:id/generate` fill gaps. There is no time-based generation.
  - **Notification engine** (`notification-engine.ts`): push / email / webhook delivery, quiet hours, overdue-task escalations, daily digest, and the ticker (below).
  - **Task recurrence** (`task-recurrence.ts`): when a recurring task is marked `DONE`, creates the next instance.
  - **Task retention** (`task-retention.ts`): soft-deletes `DONE` tasks after `archiveDays`, hard-deletes after `hardDeleteDays`, prunes orphan recurrences. Also `POST /tasks/cleanup`.
  - **Commute** (`mapbox.ts`, `event-commutes.ts`): Mapbox geocoding (30-day DB cache) and Directions ETAs (2-min in-memory cache) for `CommuteRoute` rows, plus "leave-by" ETAs for calendar events with a location starting in the next 90 min (24 h negative geocode cache).
  - **Prepared meals** (`prepared-meal.ts`): mirrors inventory items flagged `isPreparedMeal` as single-ingredient recipes.
  - **Default user** (`default-user.ts`): seeds a disabled `household-admin` user, used only by the Google OAuth dev fallback.
- **Data Layer**: SQLite (WAL mode) via Prisma; AES-256-GCM encryption (`lib/secrets.ts`, Node `crypto`) for refresh tokens and secrets stored in settings; attachment files on disk.
- **Integrations**: Google Calendar API (OAuth2, `calendar.readonly` + `userinfo.email` scopes), Mapbox Directions + Geocoding, OpenWeatherMap, SMTP (Nodemailer), Web Push (`web-push`), generic outbound webhook, and the host-side recipe-image watcher (file bridge, see below).
- **Deployment**: Docker Compose with two services — `frontend` (nginx) and `backend` (Express + Prisma + SQLite).

## Background Ticker

`startNotificationTicker(60_000)` (called from `backend/src/index.ts`) is the only scheduler. Every tick:

| When | Job |
|------|-----|
| Every minute | Process due `ReminderTrigger` rows |
| Minute divisible by 15 | `checkEscalations` — overdue OPEN task assignments escalated to admins |
| Minute divisible by 30 | Background Google Calendar sync |
| First tick at/after 08:00 each day | Daily digest |
| 03:00 hour, once per day | Task retention sweep |

Times use the container's local time (`TZ`, default UTC). At startup the backend also runs a one-shot cleanup of orphaned `FamilyEvent` rows. No external cron is needed; `POST /notifications/process` and `/digest` (ADMIN) exist for manual runs.

## Component Responsibilities

### Frontend (React + Vite + Tailwind)
- Authentication views (login, bootstrap-only registration — only works while no active user exists).
- Calendar with day/week/month view and combined events/tasks/chores overlay.
- Task todo list (grouped, quick-add, All/Active/Done/Mine filters, assignees, recurrence, file attachments), grocery lists with shopping mode, chore planner, reminders/notifications page.
- Inventory page: pantry tracker, low-stock thresholds, text export, prepared-meal tag, natural-language bulk add, and **recipe photo upload** (photo → AI extraction → editable rows → bulk add).
- Meal plan page: weekly grid (Mon–Sun × meal type), recipe management, ingredient inventory check, recipe bulk import (paste text, or upload a JSON file that the browser converts to text), send-to-grocery flow.
- Commute widget: live ETAs and an inline Mapbox GL traffic map for routes in their active time window, plus leave-by suggestions for upcoming events with locations.
- Dashboard widget grid (react-grid-layout v2; separate saved layouts for landscape `lg` and portrait `md`); custom background photo with opacity and fit mode; configurable mobile bottom tab bar; kiosk full-screen mode (`/kiosk`, outside the app shell) with its own persisted config, wake lock, and cursor auto-hide.
- Data freshness via React Query (stale-while-revalidate, targeted polling on the kiosk). No WebSockets are used — nginx and Vite proxy `/ws`, but the backend has no WebSocket handler. Global RQ defaults: 30 s stale time, 10 min GC, `refetchOnWindowFocus: false` (perf-audit-2026-04 §5).
- Routes are lazy-loaded except Login, Dashboard, and Kiosk (perf-audit-2026-04 §2).
- Auth state lives in `AuthProvider` / `useAuth()` (`frontend/src/hooks/useAuth.tsx`).

### Backend API (Express)
- REST endpoints (JSON) organized by feature modules in `src/routes/`, mounted under `/api/v1`.
- Session auth via `express-session` with `connect-sqlite3` store (7-day cookie); no Passport, no JWT.
- RBAC middleware `requireRole` — mostly `ADMIN`-only checks. The only `MEMBER`-vs-`VIEWER` distinction is guest-display content and display-mode switching (`requireRole('ADMIN','MEMBER')`); otherwise both can read and write.
- A few routes need no session: `/auth/login`, `/auth/register`, `/notifications/vapid-public-key`, `/weather`, `/health`, `/healthz`, and `/integrations/google/*` in non-production (dev fallback session).
- Data validation using Zod schemas; consistent error envelope `{ error: { code, message, details? } }`.
- File uploads via multer: attachments (`file`, 10 MB) and recipe photos (`image`, 10 MB, JPG/PNG/WebP), both validated by magic bytes. JSON body limit 50 MB.
- Logging: `morgan` access logs (`combined` in production) plus a small JSON logger (`lib/logger.ts`) for application events.
- `trust proxy` is set to 1 (nginx in front).

### Recipe Photo Extraction (host AI bridge)
The app never calls an AI API or holds a key. `POST /inventory/extract-from-image`:
1. Writes the image to `RECIPE_EXTRACT_UPLOAD_DIR` as `<uuid>.part` plus a `<uuid>.ctx.json` containing existing inventory categories, then renames it to its final extension.
2. The host `tools/recipe-image-watcher` systemd service sees the new image and runs the `claude` CLI (subscription-billed) to extract ingredients.
3. The watcher writes `<image>.json` (or `.raw.txt`) into `RECIPE_EXTRACT_OUTPUT_DIR`; the backend polls once a second until `RECIPE_EXTRACT_TIMEOUT_MS` (default 75 s) and returns `{ title, items[] }`.
4. The user edits the rows in the browser and saves via `POST /inventory/bulk-items`.

If either directory env var is unset the endpoint returns `501 EXTRACTION_NOT_CONFIGURED`. nginx allows 12 MB bodies and 120 s timeouts on `/api/` for this.

### Server Configuration Bootstrap
- At startup, `loadServerConfig()` reads values from `HouseholdSetting` rows (secrets AES-decrypted from the `enc:` prefix) and **overrides** matching env vars: `APP_BASE_URL` (CORS), SMTP, VAPID, OpenWeather. Google client ID/secret and the Mapbox token are read from settings on every use. This lets admins configure the server from **Settings → Server Configuration** without editing `.env`.
- Caveat: `GOOGLE_REDIRECT_URL` always has a value (it defaults to `${APP_BASE_URL}/api/v1/integrations/google/callback` from the env), so a DB-stored `appBaseUrl` does **not** change the OAuth redirect. Set `APP_BASE_URL` in the root `.env` for that.

### Data Layer
- SQLite with WAL mode; Prisma migrations applied with `prisma migrate deploy` when the container starts.
- `ENCRYPTION_KEY` must decode to exactly 32 bytes (base64 of 32 bytes, or a 32-character ASCII string).
- Attachments stored under `/app/uploads` (separate Docker volume).

## Data Flows
1. **User Auth**: Browser posts credentials → Express verifies bcrypt hash (12 rounds) → session cookie issued → `AuthProvider` holds the profile in memory.
2. **Calendar Sync**: Ticker or manual sync → incremental fetch using `LinkedCalendar.syncToken` → upsert/soft-delete `FamilyEvent` rows → frontend refetches.
3. **Task Update**: Member edits task → API persists via Prisma (and records `TaskStatusChange`; spawns next recurrence on `DONE`) → React Query cache invalidated → other clients refetch.
4. **Chore Rotation**: Creating a chore, or completing/skipping an assignment, generates the next `ChoreAssignment` per rotation rules (`POST /chores/generate-all` also available).
5. **Grocery Mode**: Shopping device toggles item states → API updates list → other devices see changes on their next refetch. Purchased items can be moved into inventory.
6. **Reminder Dispatch**: Ticker finds due `ReminderTrigger` rows → skips/defers for disabled or quiet hours → sends push/email/webhook → logs to `NotificationLog` and updates `nextFireAt`.
7. **Recipe Photo**: see *Recipe Photo Extraction* above.

## Deployment Topology
- **Docker services** (2):
  - `frontend`: nginx serving the SPA and proxying `/api/*` to `backend:3000`. The config is rendered at container start from templates in `frontend/nginx/` by `frontend/docker-entrypoint.d/40-select-tls.sh`:
    - **HTTP mode (default)** — app on port 80.
    - **HTTPS mode** — when `TLS_HOSTNAME` is set, or exactly one Tailscale cert/key pair is mounted at `/etc/ssl/tailscale` (host `/etc/tailscale/certs`). Port 80 redirects to 443 (except `/healthz`).
  - `backend`: Express API + Prisma + SQLite; healthcheck on `/api/v1/health`; frontend waits for it to be healthy.
- **Ports**: `HTTP_PORT` (default 80) and `HTTPS_PORT` (default 443) on the host. The backend port 3000 is only exposed inside the Docker network.
- **Volumes**: `sqlite_data` (`/data/app.db` + `sessions.db`), `uploads_data` (`/app/uploads`), plus bind mounts for the recipe watcher (`RECIPE_UPLOADS_HOST_DIR`, `RECIPE_OUTPUT_HOST_DIR`, default `~/uploads` and `~/recipe-output`).
- **Configuration**: the root `.env` feeds Compose interpolation (secrets, ports, `APP_BASE_URL`, `SESSION_SECURE`, `TLS_HOSTNAME`, recipe dirs). `backend/.env` is loaded into the backend container via an optional `env_file` (Google, SMTP, VAPID, OpenWeather, `WEBHOOK_URL`, …); values set explicitly in `docker-compose.yml` take precedence.

## Security Considerations
- Session cookies are `HttpOnly`, `sameSite: 'lax'`; `secure` controlled by `SESSION_SECURE` (set to `true` by `tailscale-setup.sh`).
- Rate limiting: 200 req/min global per IP; 15 attempts per 15 min on `/auth/login` and `/auth/register`.
- Helmet security headers on the API; nginx adds X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, and HSTS in HTTPS mode.
- Google tokens are read-only calendar scope.
- No CSRF token — relies on `sameSite: 'lax'`.
- The recipe watcher runs the `claude` CLI on the host as the deploying user; only image files and JSON cross the bind mount.

## Observability & Maintenance
- Logs: `make logs` (morgan access logs + JSON application logs).
- Health: `GET /healthz` (root, unprotected) and `GET /api/v1/health` → `{ status: 'ok', timestamp }`. Docker healthcheck polls the latter every 30 s.
- Backups: `make backup` / `make restore FILE=…` copy the SQLite file; `GET /api/v1/backup/export` (ADMIN) produces a JSON export of a subset of tables (see `data-model.md` → Backup Coverage).
