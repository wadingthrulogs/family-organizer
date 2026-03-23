# Architecture Overview

## High-Level Diagram (Textual)
- **Client Layer**: React single-page app served over HTTPS via nginx container; push notifications via Web Push API (browser-native).
- **API Server**: Express server handling REST traffic, session auth, RBAC, validation, and rate limiting. Runs as a single Node process — no separate worker or scheduler containers.
- **Domain Services** (within the same Express process):
  - Calendar Sync: pulls Google events via OAuth, normalizes data, populates `FamilyEvent` table. Triggered manually or via admin endpoint.
  - Chore Rotation Service: business logic for assignment generation, round-robin/weighted rotation.
  - Reminder Processor: evaluates pending `ReminderTrigger` rows and dispatches push/email notifications. Called via `POST /notifications/process` (run on a schedule externally, e.g. cron or Ofelia).
- **Data Layer**: SQLite database accessed via Prisma ORM; Node.js `crypto` module for encrypting secrets (OAuth tokens, VAPID keys); file storage for attachments.
- **Integrations**: Google Calendar API (OAuth2), SMTP (Nodemailer), Web Push (web-push library).
- **Deployment**: Docker Compose with two services — `frontend` (nginx) and `backend` (Express + Prisma + SQLite).

## Component Responsibilities

### Frontend (React + Vite + Tailwind)
- Authentication views (login, OAuth linking prompts).
- Calendar with day/week/month view and combined events/tasks/chores overlay.
- Task todo list with quick-add and inline editing, grocery list UI with shopping mode, chore planner, reminder settings.
- Meal plan page: weekly grid (Mon–Sun × meal type), recipe management, inventory check, send-to-grocery flow.
- Dashboard widget grid (drag/resize via react-grid-layout); custom background photo with opacity; kiosk full-screen mode.
- Data freshness via React Query polling (stale-while-revalidate); no WebSocket.
- Push notification subscription handled via browser Push API + `POST /notifications/subscribe`.

### Backend API (Express)
- REST endpoints (JSON) organized by feature modules in `src/routes/`.
- Session auth via `express-session` with `connect-sqlite3` store; no Passport, no JWT.
- RBAC middleware (`requireRole`) enforcing Admin/Member/Viewer permissions.
- Data validation using Zod schemas; consistent error envelope.
- File upload handling (task attachments) with magic-byte content-type validation (max 10 MB).
- HTTP logging via `morgan`; no structured logger in production.

### Calendar Sync
- Runs within the backend process on demand (manual sync via API or cron-triggered HTTP call).
- Uses Google APIs with per-user encrypted refresh tokens stored in `GoogleAccount.encryptedRefreshToken`.
- Incremental sync using `LinkedCalendar.syncToken` to minimize API calls.

### Reminder Scheduler
- `ReminderTrigger` rows record `nextFireAt` per channel.
- `POST /notifications/process` (admin-only) evaluates due triggers and sends via push or SMTP.
- Designed to be called on an external schedule (host cron, Ofelia container, etc.).
- Respects quiet hours; logs history to `NotificationLog`.

### Data Layer
- SQLite with WAL mode; Prisma migrations.
- Node.js `crypto` module for AES-based encryption of sensitive columns (OAuth tokens). Key provided via `ENCRYPTION_KEY` env var (base64-encoded 32 bytes).
- Backup script dumps DB via SQLite `.backup` command; attachments stored on a separate Docker volume.

## Data Flows
1. **User Auth**: Browser posts credentials → Express verifies password hash (bcrypt) → session cookie issued → React stores minimal profile in memory via `AuthContext`.
2. **Calendar Sync**: API handler fetches Google events → normalizes to `FamilyEvent` table → frontend queries updated feed.
3. **Task Update**: Member edits task → API persists via Prisma → React Query cache invalidated → other clients refetch on next poll.
4. **Chore Rotation**: Admin triggers `POST /chores/generate-all` (or per-chore) → assigns chores per rotation rules → writes `ChoreAssignment` rows.
5. **Grocery Mode**: Shopping device toggles item states → API updates list → other devices see changes on next React Query poll.
6. **Reminder Dispatch**: External cron calls `POST /notifications/process` → finds due `ReminderTrigger` rows → sends push/email → logs to `NotificationLog` and updates `nextFireAt`.

## Deployment Topology
- **Docker Services** (2 total):
  - `frontend`: nginx serving the React SPA; proxies `/api/*` to `backend:3000`.
  - `backend`: Express API + Prisma + SQLite; runs `prisma migrate deploy` on startup.
- **Volumes**:
  - `sqlite_data`: SQLite DB (`app.db`) + session store (`sessions.db`).
  - `uploads_data`: File attachments.
- Default exposed port: **80** (configurable via `APP_PORT` env var).
- Single Docker network; backend not exposed to host directly.
- Env vars injected via `backend/.env` or Docker Compose environment block; secrets (`SESSION_SECRET`, `ENCRYPTION_KEY`) must be provided at deploy time.

## Security Considerations
- All external communication uses HTTPS (Google APIs, SMTP if TLS available).
- Session cookies are `HttpOnly`, `sameSite: 'lax'`; `secure` flag controlled by `SESSION_SECURE` env var.
- Rate limiting: 200 req/min global per IP; 15 attempts per 15 min on auth endpoints.
- Token scopes limited to read-only Google Calendar unless explicitly elevated.
- No CSRF token implementation — relies on `sameSite: 'lax'` cookie policy.

## Observability & Maintenance
- HTTP request logging via `morgan` (`combined` format in production).
- Health check endpoint: `GET /api/v1/health` → `{ status: 'ok', timestamp }`.
- Docker health check polls `/api/v1/health` every 30s; frontend container waits for backend to be healthy before starting.
- Admin UI includes status cards (last sync, upcoming reminders, DB size).
- Manual backup: `POST /api/v1/backup/export` (admin-only) or direct SQLite `.backup` command.
