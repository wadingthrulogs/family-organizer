# Architecture Overview

## High-Level Diagram (Textual)
- **Client Layer**: React single-page app served over HTTPS; uses Service Worker for offline cache and push notifications.
- **API Gateway**: Express server handling REST + WebSocket traffic, session auth, RBAC, validation, and rate limiting.
- **Domain Services**:
  - Calendar Sync Worker: pulls Google events via OAuth, normalizes data, populates cache tables.
  - Task/Chore/Grocery Service: business logic for assignments, rotation, inventory states.
  - Reminder Scheduler: cron-based job queue triggering notifications (push/email/webhook).
- **Data Layer**: SQLite database accessed via Prisma ORM; encrypted secrets vault; file storage for attachments.
- **Integrations**: Google Calendar API, SMTP (local), optional Gotify/webhook endpoints.
- **Deployment**: Docker Compose orchestrating frontend, backend, worker, scheduler, SQLite volume, reverse proxy.

## Component Responsibilities
### Frontend (React + Vite + Tailwind)
- Authentication views (login, PIN unlock, OAuth linking prompts).
- Calendar (FullCalendar) with combined events/tasks/chores overlay.
- Task board, grocery list UI, chore planner, reminder settings.
- Dashboard widgets plus notification center.
- WebSocket client for live updates (task changes, grocery edits, chore rotations).
- Service Worker for caching API responses (stale-while-revalidate) and push subscription handling.

### Backend API (Express)
- REST endpoints (JSON) organized by feature modules.
- Session auth via Passport (local strategy) + JWT for WebSocket upgrade validation.
- RBAC middleware enforcing Admin/Member/Viewer permissions.
- Data validation using Zod schemas; consistent error envelope.
- File upload handling (grocery photos, task attachments) with antivirus scan hook.

### Calendar Sync Worker
- Runs as separate Node process/container sharing codebase.
- Uses Google APIs with per-user tokens; refresh tokens encrypted at rest.
- Incremental sync storing sync tokens to minimize calls.
- Conflict detection for overlapping events and duplicate tasks created from events.

### Reminder Scheduler
- node-cron triggers evaluation of pending reminders every minute.
- Builds notification payloads; sends via push (Web Push protocol) or SMTP adapter.
- Respects quiet hours, retries failed deliveries, logs history.

### Data Layer
- SQLite with WAL; Prisma migrations.
- libsodium for transparent encryption of sensitive columns (tokens, secrets).
- Backup script dumps DB + attachments to timestamped archive.

## Data Flows
1. **User Auth**: Browser posts credentials → Express verifies → session cookie issued → React stores minimal profile in memory.
2. **Calendar Sync**: Worker fetches events → normalizes to family_events table → API exposes aggregated feed → frontend queries/streams updates.
3. **Task Update**: Member edits task → API persists via Prisma → Notifies WebSocket channel → Other clients update UI.
4. **Chore Rotation**: Scheduler job runs nightly → assigns chores per rotation rules → writes assignments and emits notifications.
5. **Grocery Mode**: Shopping device toggles item states → API updates list → WebSocket pushes changes to other viewers.
6. **Reminder Dispatch**: Cron finds due reminders → sends push/email → logs status and updates next trigger time.

## Deployment Topology
- **Docker Services**:
  - `frontend`: Static assets served by Caddy or Nginx.
  - `backend`: Express API + WebSocket server.
  - `sync-worker`: Calendar sync process sharing code volume.
  - `scheduler`: Reminder cron worker (can be same image with different command).
  - `db`: SQLite volume mounted; backups via sidecar script or host cron.
  - `proxy`: Caddy/Traefik terminating TLS, enforcing HTTPS, providing basic auth for admin endpoints if desired.
- Single docker network restricted to LAN access via firewall rules.
- Env files injected via Docker secrets/configs; master encryption key provided through .env or host secret store.

## Observability & Maintenance
- Winston logging with log rotation; optional Loki endpoint if present on LAN.
- Health checks (`/healthz`, `/readyz`) for API and workers.
- Metrics endpoint exposing sync latency, reminder queue depth, WebSocket fan-out counts.
- Admin UI includes status cards (last sync, upcoming reminders, DB size).

## Security Considerations
- All external communication uses HTTPS (Google APIs, SMTP if TLS available).
- CSRF protection via same-site cookies and CSRF tokens for state-changing requests.
- Rate limiting and IP allow-list (optional) to prevent brute force from LAN guests.
- Token scopes limited to read-only calendar unless explicitly elevated.
