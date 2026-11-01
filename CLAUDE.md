# Family Organizer — AI Reference (CLAUDE.md)

> This file is auto-loaded by Claude Code at the start of every session.
> Keep it accurate and concise. For deep dives, see `docs/`.

---

## 1. Project Overview

**Name:** Family Organizer (monorepo)
**Purpose:** Self-hosted household management for a single household: dashboard/kiosk display, guest display (Wi-Fi QR, drink fridge, reading list), tasks, chores, grocery, pantry inventory, meal plans & recipes, calendar (Google sync), commute ETAs, reminders & notifications. Runs in Docker on a Raspberry Pi 5 (or any Linux host); the Pi's wall display runs it in a Tauri desktop shell.

```
.
├── backend/                 # Express + Prisma + SQLite API (port 3000, internal only in Docker)
├── frontend/                # React + Vite SPA, served by nginx in Docker
│   ├── nginx/               # http.conf.template, https.conf.template, app-locations.conf
│   └── docker-entrypoint.d/ # 40-select-tls.sh — picks HTTP vs HTTPS at container start
├── desktop/                 # Tauri desktop shell for the Pi display (§9)
├── mcp/                     # MCP server exposing organizer tools to AI clients (§7, mcp/README.md)
├── tools/recipe-image-watcher/  # Host systemd service: headless Claude Code for recipe photos + book lookups (§6)
├── tools/fo-cli/            # `fo` CLI + Claude Code skills, remote display control (§8)
├── agents/                  # Claude Agent SDK scripts (frontend / dashboard review agents)
├── e2e/                     # Playwright end-to-end tests
├── docs/                    # api, architecture, data-model, deployment, requirements, …
├── .github/workflows/supply-chain.yml  # npm audit + cargo-deny (§10)
├── docker-compose.yml  Makefile  setup.sh  tailscale-setup.sh
└── .mcp.json                # MCP client config for this repo
```

### Running

```bash
# Production / Pi (Docker)
make setup          # first run: generates secrets, writes .env files, builds, starts
make up             # rebuild + start (required after nginx/Dockerfile changes)
make restart        # restart containers without rebuilding (does NOT re-read .env — use make up)

# Local dev
cd backend && npm run dev     # tsx watch, port 3000
cd frontend && npm run dev    # Vite on port 80, proxies /api and /ws → localhost:3000
```

> Port 80 needs elevated privileges (root on Linux/Pi, Administrator on Windows). If Vite fails with `EACCES`, run elevated or change `server.port` in `vite.config.ts`.

---

## 2. Backend

### Tech Stack
- Node ≥20, TypeScript (ESM), Express 4, Prisma 5 + SQLite (WAL mode), Zod validation
- express-session + connect-sqlite3 (**rolling 30-day** session: expiry resets on every request, so the wall display never sees a login screen), bcrypt ^6 (12 rounds), Helmet, cors, compression, morgan, express-rate-limit ^8, multer ^2
- nodemailer ^8, web-push, googleapis ^133 are always installed; their *configuration* is optional
- JSON logger in `src/lib/logger.ts`; AES-256-GCM secret encryption in `src/lib/secrets.ts`
- Tests: vitest + supertest (`backend/tests/`); `npm test` loads `backend/.env` via `dotenv/config`
- Scripts: `dev`, `build`, `start`, `lint`, `test`, `test:watch`, `prisma:generate|migrate|deploy`, `db:reset`, `setup` (`prisma generate && npm rebuild bcrypt` — run after any install, see §10)

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/index.ts` | Entry: loads env, applies DB config overrides, orphan-event cleanup, starts 60 s ticker |
| `backend/src/server.ts` | `createApp(env)` — middleware, rate limits, `/healthz`, `/api/v1` |
| `backend/src/config/env.ts` | Env schema (Zod) + defaults |
| `backend/src/routes/index.ts` | All routers mounted |
| `backend/src/routes/guest.ts` | Guest-display content (Wi-Fi, reading list) as `HouseholdSetting` JSON |
| `backend/src/utils/ingredient-match.ts` | Recipe-ingredient ↔ inventory matching ("Salt" matches "Salt, Kosher"); mirrored in `frontend/src/utils/ingredientMatch.ts` — change both |
| `backend/src/middleware/require-auth.ts` / `require-role.ts` | Session guard (401) / role guard (403) |
| `backend/src/middleware/error-handler.ts` | Global error handler |
| `backend/src/lib/prisma.ts` | Prisma singleton (enables WAL) |
| `backend/src/lib/google.ts` | OAuth client; reads Google client id/secret from DB settings each call |
| `backend/src/lib/mailer.ts`, `secrets.ts`, `logger.ts` | SMTP, encryption, logging |
| `backend/prisma/schema.prisma` | Database schema |

### Services (`backend/src/services/`)
| File | Purpose |
|------|---------|
| `background-sync.ts` | Syncs all Google accounts under a lock; 24 h cooldown after auth errors; daily (after 4 AM) token reset → full sync |
| `google-calendar.ts` | Account/calendar CRUD, incremental sync, error classification, orphan cleanup |
| `chore-rotation.ts` | Generates assignments (ROUND_ROBIN / WEIGHTED / MANUAL) |
| `notification-engine.ts` | Push/email/webhook delivery, quiet hours, escalations, digest, the ticker |
| `task-recurrence.ts` | Next due date + next instance when a recurring task is marked DONE |
| `task-retention.ts` | Soft-deletes DONE tasks > `archiveDays` (30), hard-deletes soft-deleted > `hardDeleteDays` (90), prunes orphan recurrences, writes AuditLog |
| `mapbox.ts` | Geocoding (30-day DB cache) + Directions ETAs (2-min memory cache) |
| `event-commutes.ts` | "Leave-by" ETAs for located calendar events in the next 90 min (24 h negative geocode cache) |
| `prepared-meal.ts` | Mirrors `isPreparedMeal` inventory items as single-ingredient Recipes |
| `book-enrichment.ts` | Guest reading list: queues book lookups to the host watcher, ingests cover + synopsis (§6); own 60 s ticker (`startBookLookupTicker`) |
| `default-user.ts` | Seeds `household-admin` (password disabled); used only by the Google router in dev |

### Background Ticker (`startNotificationTicker(60_000)`, in-process — no external cron needed)
- Every minute: process due reminder triggers
- Minute % 15 == 0: escalations (overdue OPEN task assignments → admins)
- Minute % 30 == 0: Google Calendar background sync
- Once daily at hour ≥ 8 (server TZ): digest
- Once daily at hour 3: task retention sweep
- Chores: no time-based generation. The next assignment is generated when a non-MANUAL chore is created, and when an assignment is completed or skipped; `/chores/generate-all` fills gaps.

### Auth & RBAC
- Session-based; `requireAuth` checks `req.session.userId` → 401
- `requireRole(...)` → 403. Mostly `'ADMIN'`; guest-content and display-control writes use `('ADMIN','MEMBER')`, which is the only place VIEWER differs from MEMBER.
- Display PIN (optional, per user): `POST /auth/me/pin` sets/clears it (password required); `/auth/me/pin/verify` is rate-limited like login.
- `POST /auth/register` is bootstrap-only: first user becomes ADMIN; afterwards → 403 `REGISTRATION_DISABLED` (admins create users via `POST /auth/users`).
- Passwords: 8–128 chars, upper + lower + digit + symbol.
- Deleting a user sets `deletedAt` (soft). `passwordHash = '!disabled!'` is only used by the seeded default user.
- Public (no session): `/healthz`, `/api/v1/health`, `/auth/login|register|logout`, `/notifications/vapid-public-key`, `/weather`, and in non-production the `/integrations/google/*` router (falls back to first user / seeds `household-admin`).

### Error Response Shape
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```
Codes in use include `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `REGISTRATION_DISABLED`, `USERNAME_TAKEN`, `EMAIL_TAKEN`, `WRONG_PASSWORD`, `SELF_ROLE_CHANGE`, `SELF_DELETE`, `NO_UPDATES`, `*_NOT_FOUND`, `ALREADY_MOVED`, `GENERATION_SKIPPED`, `INVALID_STATE`, `USER_NOT_ELIGIBLE`, `SYNC_BUSY`, `SYNC_FAILED`, `RETENTION_FAILED`, `EXTRACTION_*`, `WEATHER_NOT_CONFIGURED`, `HOME_ADDRESS_NOT_SET`, `MAPBOX_TOKEN_NOT_SET`, `GOOGLE_NOT_CONFIGURED`, `WRONG_PIN`, `LOOKUP_NOT_CONFIGURED`, `SNAPSHOT_LIMIT_REACHED`, `SNAPSHOT_TOO_LARGE`, `SNAPSHOT_NOT_FOUND`, `INTERNAL_SERVER_ERROR`.

### Limits
- Rate limits: global 200 req/min/IP; `/auth/login` + `/auth/register` 15 per 15 min
- JSON/urlencoded body 50 MB; uploads 10 MB (multer, magic-byte checked); nginx `client_max_body_size 12m`, 120 s proxy timeout
- `trust proxy` = 1

### Environment Variables (`backend/src/config/env.ts`)

| Var | Required | Default / notes |
|-----|----------|-----------------|
| `SESSION_SECRET` | **yes** | ≥16 chars |
| `ENCRYPTION_KEY` | **yes** | Must decode to **exactly 32 bytes** (base64 of 32 bytes, or a 32-byte UTF-8 string) — longer plain strings pass Zod but fail at runtime |
| `NODE_ENV` | no | `development` |
| `PORT` | no | `3000` |
| `APP_BASE_URL` | no | `http://localhost:4173` (compose sets it from root `.env`) |
| `DATABASE_URL` | no | `file:./dev.db` (Docker: `file:/data/app.db`) |
| `SQLITE_PATH` | no | `./data/app.db` (also locates `sessions.db`) |
| `SESSION_SECURE` | no | `false`; set `true` behind HTTPS |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Can instead be set in Settings UI |
| `GOOGLE_REDIRECT_URL` | no | `${APP_BASE_URL}/api/v1/integrations/google/callback` |
| `SMTP_HOST/PORT/USER/PASS/FROM` | no | Overridable from Settings UI |
| `WEBHOOK_URL` | no | Env only (not in Settings UI) |
| `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` | no | Overridable from Settings UI |
| `OPENWEATHER_API_KEY` | no | Overridable from Settings UI |
| `RECIPE_EXTRACT_UPLOAD_DIR` / `RECIPE_EXTRACT_OUTPUT_DIR` | no | Both required to enable photo extraction (compose: `/host-recipe-uploads`, `/host-recipe-output`) |
| `RECIPE_EXTRACT_TIMEOUT_MS` | no | `75000` |
| `TZ` | no | `UTC` |

At startup `index.ts` overrides appBaseUrl (CORS only — see Known issues), SMTP, VAPID and OpenWeather from DB settings. Mapbox token and home address live only in DB settings.

**Docker env flow:** root `.env` drives compose interpolation (`SESSION_SECRET`, `ENCRYPTION_KEY`, `APP_BASE_URL`, `SESSION_SECURE`, `TZ`, `HTTP_PORT`, `HTTPS_PORT`, `TLS_HOSTNAME`, `RECIPE_UPLOADS_HOST_DIR`, `RECIPE_OUTPUT_HOST_DIR`, `RECIPE_EXTRACT_TIMEOUT_MS`). `backend/.env` is loaded into the backend container via an optional `env_file`; explicit `environment:` entries in compose win.

### Database Models (Prisma / SQLite — 29 models)

There are **no Prisma enums**; all "enum" fields are `String` columns validated by Zod.

| Model | Key Fields |
|-------|-----------|
| User | id, username, email, passwordHash, pinHash (optional display PIN; `GET /me` returns `hasPin`), role, colorHex, authProvider, timezone, lastLoginAt, deletedAt |
| UserPreference | userId, theme, seasonalTheme (bool), dashboardConfig (JSON), kioskConfig (JSON), guestConfig (JSON), layoutSnapshots (JSON array of saved layouts), hiddenTabs |
| UserSecret | userId, secretType, encryptedValue (Bytes) — legacy, not used for OAuth |
| GoogleAccount | userId, email, displayName, encryptedRefreshToken, lastSyncedAt, lastSyncError, lastSyncErrorAt |
| LinkedCalendar | userId, googleAccountId, googleId, displayName, colorHex, accessRole, syncToken, lastSyncedAt — unique (userId, googleId) |
| FamilyEvent | linkedCalendarId, source (GOOGLE/LOCAL), sourceEventId, title, description, startAt, endAt, allDay, timezone, colorHex, location, attendees, etag, visibility, deleted — index [startAt, endAt] |
| Task | title, description, dueAt, priority (0–5), status, labels (string), authorUserId, recurrenceId, deletedAt |
| TaskAssignment / TaskStatusChange | assignment status, progressNote, completedAt / fromStatus, toStatus, changedBy, note |
| TaskRecurrence | frequency, interval, byDay, byMonthDay, until, count (byDay/byMonthDay/count accepted but ignored) |
| Chore | title, rotationType, frequency, interval, eligibleUserIds (CSV), weightMapJson, rewardPoints, active |
| ChoreAssignment | choreId, userId, windowStart, windowEnd, state, rotationOrder, notes, completedAt, verifiedById |
| GroceryList | ownerUserId, name, store, presetKey, isActive |
| GroceryItem | listId, name, category, quantity, unit, state, assigneeUserId, claimedByUserId, pantryItemKey, sortOrder, notes, movedToInventoryAt |
| InventoryItem | name, category, quantity, unit, lowStockThreshold, pantryItemKey (unique), notes, dateAdded, isPreparedMeal, isDrinkFridge |
| Recipe | title, description, instructions, servings, prepMinutes, cookMinutes, sourceUrl, ingredientsJson, createdByUserId, sourceInventoryItemId (unique FK → InventoryItem, cascade) |
| MealPlan / MealPlanEntry | title, weekStart / mealPlanId, recipeId?, title, mealType (BREAKFAST/LUNCH/DINNER/SNACK), dayOffset (0–6), servings, notes |
| CommuteRoute | name, destAddress, travelMode, showStartMin, showEndMin, daysOfWeek (CSV, default "1,2,3,4,5"), sortOrder, active |
| GeocodeCache / LocationGeocodeCache | address→lng/lat (30 d) / negative-result cache for event locations (24 h) |
| Reminder / ReminderTrigger | ownerUserId, targetType, targetId, channelMask, leadTimeMinutes, quietHoursStart/End, enabled / channel, nextFireAt, lastAttemptAt, lastStatus, retryCount |
| PushSubscription / NotificationLog | endpoint, p256dh, auth, userAgent / channel, title, body, status, errorDetail, sentAt |
| Attachment | ownerUserId, fileName, filePath, contentType, byteSize, checksum (sha256), linkedEntityType/Id, scanned |
| HouseholdSetting | key (PK), value (JSON) — secrets encrypted (GET returns `*Set` booleans); also guest content (`guest_wifi`, `guest_books`) and `display_mode` |
| AuditLog / SearchIndex | actor, action, entity, payload, ip, UA / entityType, entityId, content (SearchIndex is unused) |

**Value sets:**
- Task status: `OPEN | IN_PROGRESS | BLOCKED | DONE | ARCHIVED` (retention uses `deletedAt`, not `ARCHIVED`)
- Chore rotation: `ROUND_ROBIN | WEIGHTED | MANUAL`; assignment state: `PENDING | IN_PROGRESS | COMPLETED | SNOOZED | SKIPPED`
- Grocery item state: `NEEDED | CLAIMED | IN_CART | PURCHASED`
- User role: `ADMIN | MEMBER | VIEWER`
- Recurrence frequency: `DAILY | WEEKLY | BIWEEKLY | MONTHLY | YEARLY`
- Commute travelMode: `DRIVE | BICYCLE | WALK | TWO_WHEELER | TRANSIT` (Mapbox profiles: driving-traffic / cycling / walking / driving)

### API Endpoints (`/api/v1`) — `requireAuth` unless noted

**Auth `/auth`**
- `POST /register` (public, bootstrap only) · `POST /login` · `POST /logout` (public, rate-limited)
- `GET /me` · `PATCH /me` `{ email?, timezone?, colorHex? }` · `POST /me/password` `{ currentPassword, newPassword }`
- `POST /me/pin` `{ currentPassword, pin: '4–8 digits' | null }` · `POST /me/pin/verify` `{ pin }` → `{ ok, pinSet }` (403 `WRONG_PIN`, rate-limited)
- ADMIN: `GET /users` · `POST /users` · `PATCH /users/:userId/role` · `POST /users/:userId/reset-password` · `DELETE /users/:userId` (soft, 200)

**Tasks `/tasks`**
- `GET /` `?status&cursor&limit` (1–100, default 20) → `{ items, total, nextCursor }`
- `POST /` `{ title, description?, dueAt?, priority?, status?, labels?, assigneeUserIds?, recurrence? }`
- `GET /:taskId` · `PATCH /:taskId` (DONE on a recurring task creates the next instance) · `DELETE /:taskId` (soft, 204)
- `GET /:taskId/history`
- `POST /cleanup` (ADMIN) `{ dryRun? }` → `{ archived, hardDeleted, orphanRecurrencesDeleted, thresholds, dryRun }`

**Chores `/chores`**
- `GET /` `?active&includeAssignments` · `POST /` · `GET|PATCH|DELETE /:choreId`
- `PATCH /assignments/:assignmentId` `{ state?, notes? }` · `POST /assignments/:id/skip` `{ reason? }` · `POST /assignments/:id/swap` `{ targetUserId }`
- `POST /:choreId/generate` (422 `GENERATION_SKIPPED`) · `POST /generate-all` → `{ generated }` · `GET /:choreId/streaks`

**Commute `/commute`** (needs Mapbox token + home address in Settings)
- `GET /routes` · `POST /routes` · `PATCH /routes/:routeId` · `DELETE /routes/:routeId`
- `GET /routes/:routeId/eta` · `GET /etas/active` (routes in their show window + event leave-by ETAs)

**Grocery `/grocery`**
- `GET /lists` `?includeItems&active` · `POST /lists` · `PATCH|DELETE /lists/:listId`
- `GET /lists/:listId/items` · `POST /lists/:listId/items` `{ name, category?, quantity? (0.1–999), unit?, state?, assigneeUserId?, claimedByUserId?, pantryItemKey?, sortOrder?, notes? }`
- `POST /lists/:listId/items/bulk` `{ text }` · `POST /lists/:listId/items/from-low-stock`
- `PATCH|DELETE /lists/:listId/items/:itemId`

**Inventory `/inventory`**
- `GET /` `?search&category&lowStock&drinkFridge` · `GET /export` (text download) · `GET /:itemId`
- `POST /` / `PATCH /:itemId` `{ name, category?, quantity?, unit?, lowStockThreshold?, notes?, dateAdded?, pantryItemKey?, isPreparedMeal?, isDrinkFridge? }` — setting `isPreparedMeal` creates/updates a linked Recipe; clearing it deletes it
- `DELETE /:itemId`
- `POST /bulk` `{ text }` (natural language) · `POST /bulk-items` `{ items: [1..200]{ name, quantity?, unit?, category? } }`
- `POST /extract-from-image` — multipart `image` (≤10 MB JPG/PNG/WebP) → `{ title, items[] }`. Writes image + `.ctx.json` (existing categories) to `RECIPE_EXTRACT_UPLOAD_DIR`, polls `RECIPE_EXTRACT_OUTPUT_DIR` for `<img>.json`/`.raw.txt`. 501 `EXTRACTION_NOT_CONFIGURED`, 415, 422 `EXTRACTION_PARSE_FAILED`, 504 `EXTRACTION_TIMEOUT`
- `POST /from-grocery` `{ groceryItemId, groceryListId }` (409 `ALREADY_MOVED`) · `POST /from-grocery-list` `{ groceryListId }` → `{ moved, items }`

**Meal Plans `/meal-plans`**
- `GET /recipes` (household-wide; `createdByUserId` is attribution only) · `POST /recipes` (`instructions?` up to 10 000 chars) · `GET|PATCH|DELETE /recipes/:recipeId`
- `POST /recipes/bulk` `{ text }` (blocks separated by blank lines) → `{ items, total }` — JSON upload is parsed client-side
- `GET /recipes/:recipeId/inventory-check` `?servings` → `{ canMake, ingredients: [{ status: ok|low|missing|unlinked }] }`
- `POST /recipes/:recipeId/add-missing-to-grocery` `{ groceryListId, servings? }`
- `GET /entries-by-range` `?start&end`
- `GET /` (latest 20) · `POST /` · `GET|PATCH|DELETE /:planId`
- `POST /:planId/entries` · `PATCH|DELETE /:planId/entries/:entryId`
- `POST /:planId/send-to-grocery` `{ groceryListId }` (400 `NO_INGREDIENTS`)

**Calendar `/calendar`**
- `GET /calendars` — all linked calendars in the household
- `GET /events` `?start&end` (required ISO) `&calendarId&includeDeleted`
- `POST /events` `{ linkedCalendarId?, title, description?, startAt, endAt, allDay?, timezone, colorHex?, location?, visibility?, attendees?, source?=LOCAL, sourceEventId? }`
- `PATCH /events/:eventId` · `DELETE /events/:eventId` (soft)

**Settings `/settings`**
- `GET /` · `PATCH /` — household: `householdName, timezone, quietHours{start,end}, hiddenTabs, theme, weatherLocation, weatherUnits, taskRetention{archiveDays, hardDeleteDays}, homeAddress`; server config (ADMIN): `googleClientId, googleClientSecret, appBaseUrl, openweatherApiKey, mapboxToken, smtpHost/Port/User/Pass/From, pushVapidPublicKey/PrivateKey` (`googleMapsApiKey` stored but unused). Secrets return as `*Set` booleans.
- `GET /me` · `PATCH /me` — `{ theme, seasonalTheme, dashboardConfig, kioskConfig, guestConfig, hiddenTabs }`
- `GET /me/layouts` → `{ items: [{ id, name, mode, savedAt, config }] }` · `POST /me/layouts` `{ name, mode: dashboard|kiosk|guest, config }` (same name + mode replaces; 409 `SNAPSHOT_LIMIT_REACHED` past 20/mode, 413 `SNAPSHOT_TOO_LARGE` past 128 KB) · `DELETE /me/layouts/:snapshotId`
- `GET /display` · `PATCH /display` (ADMIN, MEMBER) `{ mode: dashboard|kiosk|guest }` → `{ mode, requestedAt }` — remote wall-display control (§8)

**Guest display `/guest`**
- `GET /content` → `{ wifi: { ssid, security, password, hidden } | null, books: [...], lookupEnabled }` (Wi-Fi password encrypted at rest, returned plaintext for the QR). Also ingests finished book lookups.
- `PATCH /content` (ADMIN, MEMBER) `{ wifi?, books? }` — a new book with no synopsis/cover is queued for lookup (§6). Books with `finishedAt` are finished; only the newest 12 finished are kept.
- `POST /books/:bookId/lookup` (ADMIN, MEMBER) — re-run a lookup; 503 `LOOKUP_NOT_CONFIGURED` without the bridge dirs

**Reminders `/reminders`**
- `GET /` `?enabled&targetType` · `POST /` `{ title, message?, targetType, targetId?, channelMask?, leadTimeMinutes?, quietHoursStart?, quietHoursEnd?, enabled? }` · `GET|PATCH|DELETE /:reminderId`

**Notifications `/notifications`**
- `POST /subscribe` `{ endpoint, keys: { p256dh, auth } }` · `DELETE /subscribe` `{ endpoint }` · `GET /subscriptions`
- `GET /log` `?limit` (50, max 200) · `GET /log/all` (ADMIN, 100, max 500)
- `POST /trigger/:reminderId` · `POST /process` (ADMIN; also generates triggers + escalations) · `POST /digest` (ADMIN)
- `GET /vapid-public-key` (public) → `{ publicKey }`

**Attachments `/attachments`**
- `GET /` `?linkedEntityType&linkedEntityId` · `POST /` multipart `file` (+ `linkedEntityType?`, `linkedEntityId?`), 10 MB, magic bytes, saved to `uploads/`
- `GET /:id/download` (owner, ADMIN, or household-shared: `ownerUserId: null` or `linkedEntityType: 'guestBook'`) · `DELETE /:id` (owner or ADMIN)

**Integrations `/integrations/google`** (not ADMIN-only; see public note above)
- `GET /` · `GET /start` `?login_hint` → `{ url }` · `GET /callback` → redirects `/settings?google=connected|error&reason=`
- `DELETE /:accountId` · `POST /:accountId/sync` · `POST /:accountId/full-sync` (clears sync tokens) · `POST /sync-all` — may return 409 `SYNC_BUSY`
- Scopes: `calendar.readonly` + `userinfo.email`

**Other**
- `GET /healthz` (root, public) → `{ status: 'ok' }` · `GET /api/v1/health` (public) → `{ status, timestamp }`
- `GET /weather` (public) `?location` (required) `&units=imperial|metric` — 501 if no API key; 5-min cache
- `GET /backup/export` (ADMIN) · `POST /backup/import` (ADMIN) `{ data }` — covers 14 tables only (see Known issues)

> Boolean query params use `z.coerce.boolean()`, so `?active=false` is treated as **true** — omit the param instead.

---

## 3. Frontend

### Tech Stack
- React 18.2, TypeScript 5.3, Vite 5.1 (`@vitejs/plugin-react-swc`), Node ≥20
- React Router 6.22, TanStack React Query 5.28, Axios 1.6, classnames
- Tailwind CSS 3.4 + CSS custom properties (21 themes)
- react-grid-layout **v2** (dashboard/kiosk/guest grid), mapbox-gl 3 (commute map), `uqr` (Wi-Fi QR)
- `@dnd-kit/*` is installed but **not imported anywhere**. No Zustand, no React Query DevTools.
- Fonts self-hosted (`public/fonts/*.woff2`, `src/styles/fonts.css`; no CDN — the kiosk must render offline). `public/sw.js` handles web push + notification clicks only (no offline cache).

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/main.tsx` | Entry; QueryClient defaults (staleTime 30 s, gcTime 10 min, no refetch on focus, refetch on reconnect) |
| `frontend/src/App.tsx` | Routing (lazy-loads all pages except Login, Dashboard, Kiosk) |
| `frontend/src/api/client.ts` | Axios instance (`baseURL: '/api/v1'` or `VITE_API_BASE`, `withCredentials: true`) |
| `frontend/src/hooks/useAuth.tsx` | `AuthContext` + `AuthProvider` + `useAuth()` |
| `frontend/src/contexts/ThemeContext.tsx` | Theme provider (also caches theme in `localStorage['organizer-theme']`) |
| `frontend/src/components/widgets/widgetRegistry.ts` | Dashboard widget registry |
| `frontend/src/types/dashboard.ts` | Dashboard/kiosk config types + localStorage keys |
| `frontend/vite.config.ts` | Dev server port 80; proxies `/api` and `/ws` (`VITE_WS_BASE`) → `localhost:3000` |

### Provider Hierarchy (`main.tsx`)
```
React.StrictMode → ErrorBoundary → QueryClientProvider → BrowserRouter → AuthProvider → ThemeProvider → AnnouncementProvider → App
```

### Pages & Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/login` | LoginPage | Session login (logged-out: all other paths → `/login`) |
| `/register` | RegisterPage | Bootstrap admin account (first user only) |
| `/` | DashboardPage | Drag/resize widget grid, background photo, edit mode |
| `/tasks` | TasksPage | Grouped todo list with quick-add, filters All/Active/Done/Mine, attachments |
| `/chores` | ChoresPage | Chore templates + assignments, streaks |
| `/calendar` | CalendarPage | Day/week/month views, chore overlay, Google + local events |
| `/grocery` | GroceryPage | Lists, bulk add, low-stock import, shopping mode |
| `/inventory` | InventoryPage | Pantry tracker, export, prepared-meal tag, recipe-photo upload (`RecipeUploadModal`) |
| `/meal-plans` | MealPlanPage | Weekly planner + recipes tab (bulk import: text or client-parsed JSON) |
| `/notifications` | NotificationsPage | Notification history + reminder CRUD (`/reminders` redirects here) |
| `/settings` | SettingsPage | Single long page: household, server config, Google, commute routes, tabs/mobile bar, users, backup |
| `/kiosk` | KioskPage → `DisplayPage` mode=kiosk | Wall display — **outside** `AppLayout`; own layout, edit mode, settings sheet, wake lock, cursor auto-hide, 2-min targeted refresh |
| `/guest` | GuestPage → `DisplayPage` mode=guest | Guest display — guest-safe widgets only, optional PIN to exit |

All other authenticated routes are wrapped in `AppLayout` (header, sidebar, mobile bottom bar of up to 4 tabs). Unknown paths → `/`.

### React Query Keys & Stale Times

| Key | Stale | Notes |
|-----|-------|-------|
| `['tasks']` | 30 s | Infinite query, 50/page; list hooks also `refetchInterval` 10 min (wall display never refocuses) |
| `['chores']` | 30 s | Calendar uses `['chores', { includeAssignments: true }]` |
| `['groceryLists']` | 20 s | MealPlanPage uses 30 s for same key |
| `['inventory', search, category, lowStock, drinkFridge]` | 20 s | |
| `['settings']` | 60 s | |
| `['userPreferences']` | 60 s | |
| `['users']` | ∞ | |
| `['googleIntegration']` | 60 s | |
| `['linkedCalendars']` | 60 s | |
| `['calendarEvents', start, end, calendarId, includeDeleted]` | 15 s | |
| `['reminders', owner, enabled, targetType]` | 20 s | |
| `['mealPlans']` / `['mealPlanCalendar', start, end]` | 30 s | |
| `['recipes']` | 60 s | |
| `['commuteRoutes']` | 30 s | |
| `['commuteEtas', 'active']` | 60 s | refetch every 2 min |
| `['weather', location, units]` | 5 min | refetch every 5 min |
| `['attachments', type, id]` | default | |
| `['guestContent']` | 5 min | polled every 10 s while a book lookup is pending |
| `['layoutSnapshots']` | 60 s | mutations use `setQueryData` |

### Mutation Hooks & Invalidation

| Hook file | Invalidates |
|-----------|------------|
| `useTaskMutations.ts` (create/update/delete) | `['tasks']` |
| `useChoreMutations.ts` (chore CRUD, update/skip/swap assignment) | `['chores']` |
| `useGroceryMutations.ts` (list/item CRUD, bulk add, add low-stock) | `['groceryLists']` |
| `useInventoryMutations.ts` — `useCreate/Update/DeleteInventoryItemMutation` (update is optimistic), move-from-grocery, bulk text | `['inventory']` (+ `['recipes']` for CRUD; move also `['groceryLists']`) |
| `useInventoryMutations.ts` — `useExtractInventoryFromImageMutation` / `useBulkAddInventoryStructuredMutation` | none / `['inventory']` |
| `useMealPlanMutations.ts` | plans → `['mealPlans']`; entries → `+['inventory']`; send-to-grocery → `+['groceryLists']`; add-missing → `['groceryLists']`; recipes/bulk → `['recipes']` |
| `useReminderMutations.ts` | `['reminders']` |
| `useCommute.ts` | `['commuteRoutes']`, `['commuteEtas']` |
| `useGoogleIntegration.ts` | disconnect → `googleIntegration`; sync/full-sync → `googleIntegration`, `calendarEvents`, `linkedCalendars`, `commuteEtas` (sync-all omits `commuteEtas`) |
| `useCalendarEvents.ts` | `calendarEvents`, `linkedCalendars` |
| `useAttachments.ts` | `['attachments', …]` |
| `useSettings.ts` / `useUserPreferences.ts` | **`setQueryData`** (no invalidation) |

Non-query hooks: `usePushNotifications`, `useWidgetSize`, `useUsers`, `useToday` (midnight rollover for the unattended display).

### TypeScript Types (`src/types/`)
`auth, calendar, chore, commute, dashboard, grocery, integration, inventory, mealPlan, reminder, settings, task`. Notable:
```ts
interface Task { id, title, description?, dueAt?, priority, status: TaskStatus, labels?: string,
  authorUserId?, recurrenceId?, assignments?, recurrence?, createdAt, updatedAt, deletedAt? }
interface GroceryList { id, ownerUserId, name, store?, presetKey?, isActive, items? }
interface GroceryItem { id, listId, name, category?, quantity, unit?, state, notes?,
  assigneeUserId?, claimedByUserId?, pantryItemKey?, sortOrder?, movedToInventoryAt? }
interface AuthUser { id, username, email, role: 'ADMIN'|'MEMBER'|'VIEWER', timezone, colorHex }
```

### Theming
- 21 themes in two groups (`ThemeMeta.group` in `ThemeContext.tsx`):
  - **classic** (colours only): `default, dark-plus, light-plus, monokai, dracula, solarized-dark, solarized-light, one-dark-pro, nord, midnight, paper, catppuccin-mocha, catppuccin-latte, gruvbox-dark, tokyo-night, rose-pine`
  - **seasonal** (colours + fonts + shapes + background): `halloween, thanksgiving, christmas, dnd, birthday` (birthday is manual — not in the auto-switch)
- Everything a theme looks like is CSS custom properties under `[data-theme="<id>"]` in `src/styles/index.css`,
  consumed by Tailwind via `tailwind.config.js`. Four token families:
  - **colour** — `bg-page, bg-card, text-heading, text-muted, text-secondary, text-faint, border-th-border, border-th-border-light, bg-btn-primary, text-btn-primary, bg-input, border-input, accent, shadow-soft`.
    `--color-card/bg/text/input` are aliases of the long names (components use them inline).
  - **type** — `--font-display`, `--font-body`, `--heading-transform`, `--heading-tracking`
  - **shape** — `--radius-card`, `--radius-btn`, `--radius-pill` (Tailwind `rounded-card/btn/pill`);
    `--btn-font/weight/transform/tracking/border/shadow`, `--btn-secondary-border`
  - **surface** — `--theme-bg-image/size/position/repeat/opacity`, painted by `body::before` as one fixed
    full-page layer on every page. A user-uploaded dashboard photo wins: `AppLayout`/`KioskPage` set
    `body[data-user-bg]`, which hides the theme layer. Artwork is SVG in `src/styles/themes/`. Vite inlines a tile as a data URI only under
    `assetsInlineLimit` (4096 bytes, not overridden); `dnd-dice.svg` is over it since the d4/d6/d8/d12 were
    added, so it ships as a separate `dist/assets/` file — fine on the wall display, which is same-origin.
- Defaults live on `:root, [data-theme]` so a classic theme never inherits a seasonal theme's fonts — this is
  also what makes the settings picker's live preview cards (`<div data-theme=…>`) render correctly.
- **Buttons:** use `.btn-primary` / `.btn-secondary` (+ `.btn-pill`) from the components layer, never raw
  `bg-btn-primary rounded-*`. Size (padding, text size) stays in Tailwind utilities at the call site.
  The full-viewport page roots use `.page-root` (transparent) so the theme layer shows through.
- **Fonts are self-hosted** (`public/fonts/*.woff2`, latin subsets, SIL OFL, declared in `src/styles/fonts.css`).
  No Google Fonts CDN — the kiosk must render offline. Faces download lazily, only when a theme uses them.
- **Seasonal auto-switch:** `UserPreference.seasonalTheme` (per user). `lib/seasonalTheme.ts` maps a date to
  Halloween (Oct), Thanksgiving (Nov 1 → 4th Thursday), Christmas (day after → Jan 1), else `null` → the user's
  own `theme`. `ThemeProvider` recomputes on `useToday()` so the wall display rolls over at midnight unattended.
  `useTheme()` exposes `theme` (chosen), `effectiveTheme` (applied), `seasonal`, `setSeasonal`.
- Shopping mode uses `color-shopping-*` tokens (dark theme regardless of active theme)
- Shopping mode uses `color-shopping-*` tokens (always dark)

### Widgets (Dashboard, Kiosk & Guest) — 14

| ID | Default | Min | | ID | Default | Min |
|----|---------|-----|-|----|---------|-----|
| clock | 4×2 | 2×2 | | overdueChores | 4×2 | 2×2 |
| weather | 4×2 | 3×2 | | grocery | 6×3 | 3×2 |
| commute | 4×3 | 3×2 | | reminders | 4×3 | 2×2 |
| tasks | 4×3 | 2×2 | | inventory | 6×3 | 3×2 |
| chores | 6×3 | 2×2 | | mealPlan | 6×3 | 3×2 |
| events | 8×3 | 3×2 | | wifi ★ | 4×3 | 3×3 |
| drinkFridge ★ | 4×3 | 3×2 | | reading ★ | 4×3 | 3×2 |

★ = `guestSafe` in `widgetRegistry.ts` (Clock and Weather are too). Only guest-safe widgets may appear on the guest display.
- **wifi** — SSID + Wi-Fi QR (`uqr`), tap-to-reveal password
- **drinkFridge** — inventory items tagged `isDrinkFridge`, grouped by category; qty 0 = "out"
- **reading** — guest books with progress + optional cover; finished books drop to a "Recently finished" strip

**Grid / layout persistence:**
- react-grid-layout v2: `dragConfig={{ enabled: editMode, handle: '.widget-drag-handle' }}`, `compactor={noCompactor}`, resize handles `se/sw/ne/nw` only
- Breakpoints `lg 1280 / md 996 / sm 768 / xs 480 / xxs 0` → cols `12 / 8 / 4 / 2 / 1`; separate saved `layout` (lg) and `mdLayout` (portrait/md)
- Dashboard config: `localStorage['dashboard-config']` (+ `-ts` timestamp) synced to `/settings/me.dashboardConfig`; kiosk: `kiosk-config` → `kioskConfig`; guest: `guest-config` → `guestConfig` (default `DEFAULT_GUEST_CONFIG`, has explicit `mdLayout`)
- Sync rule: once edited locally, the **local copy wins**; the server copy is used only on a fresh device
- Widget removal supports undo; per-widget font size; dashboard background photo with opacity and fill/contain

**Reset layout resets only the display you are on.** The sheet is shared by all three modes, so every
action names its display ("Reset guest display layout"), and reset/restore both go through the page's own
`persistConfig`. `e2e/tests/reset-isolation.spec.ts` guards this — it fails if a guest reset touches
`dashboard-config`.

**Saved layouts.** ⚙ → *Saved layouts* stores named copies of a display's arrangement
(`UserPreference.layoutSnapshots`, per user, one list shared by all three modes and filtered by `mode`).
Restoring calls the page's own `persistConfig`, the same path as *Reset layout*, so it writes the right
localStorage key and syncs to the server — a snapshot of one display can never be restored onto another.

### Guest display (`/guest`)
`DisplayPage` is the one full-screen shell behind both `/kiosk` and `/guest`; a `MODES` table picks the
config slot, refresh keys, defaults, and whether the widget allowlist applies. In guest mode:
- Only `guestSafe` widgets are offered by the picker **and** rendered — a private widget id in a saved
  config is dropped at render (`visibleSlots`), so a stale or hand-edited layout can't leak.
- Exit and the ⚙ gear go through `withUnlock()`: if the user has a display PIN (`user.hasPin`), a
  `PinPrompt` asks for it and the unlock lasts 5 min; with no PIN they're plain taps. The PIN is optional
  by design — set/cleared in Settings → Guest display (`POST /auth/me/pin`, password required).
- Guest mode is a *display* boundary, not a security boundary: it runs in the signed-in session, so the
  API is still reachable from the device. The PIN stops a visitor tapping through, nothing more.
- Content is edited in Settings → Guest display (`GuestDisplaySettings.tsx`); the drink board is edited
  on the Inventory page via the 🥤 Drink fridge tag.
- The reading list splits on `finishedAt`: "✓ Finished" on a book stamps the date and fills its progress
  bar, moving it to the editor's **Recently finished** shelf; "Reading again" clears the stamp. Both are
  ordinary draft edits — nothing is written until **Save books**, which sits directly under the reading
  list, above the shelf. The shelf is a disclosure (count in the header, collapsed on load) that springs
  open when you finish a book, so the book isn't swallowed by a closed section as you tap.


---

## 4. Component Conventions

### Adding a New Feature (full-stack pattern)
1. **Backend:** Prisma field/migration → Zod schema → handler in `routes/*.ts` (service in `services/` if non-trivial)
2. **Frontend API:** function in `src/api/*.ts` (`api.get/post/patch/delete`)
3. **Frontend Hook:** query/mutation hook in `src/hooks/use*.ts`
4. **Component:** `src/components/<feature>/`
5. **Page:** wire into `src/pages/`
6. Update `docs/api.md` and this file.

### Adding a New Widget
1. Create component in `src/components/widgets/`
2. Register in `widgetRegistry.ts` with `{ id, label, icon, component, defaultW, defaultH, minW, minH, guestSafe? }` — set `guestSafe` only if it shows no household data
3. It appears automatically in the "Add widget" panel on Dashboard and Kiosk

### Loading State Pattern
```tsx
// Track which specific item is loading (from ChoresPage)
const loadingAssignmentId =
  updateAssignment.isPending
    ? (updateAssignment.variables as { assignmentId: number } | undefined)?.assignmentId ?? null
    : skipAssignment.isPending
    ? (skipAssignment.variables as { assignmentId: number } | undefined)?.assignmentId ?? null
    : null;
```

### Soft Delete Pattern
- Tasks: `deletedAt` set; `DELETE /tasks/:id` → 204; retention hard-deletes after `hardDeleteDays`
- Users: `deletedAt` set
- Calendar events: `deleted: true`

---

## 5. Deployment (Docker)

- **Services:** `backend` (port 3000, `expose` only — not published) and `frontend` (nginx:1.27-alpine serving the SPA + proxying `/api/` and `/ws` to `backend:3000`).
- **Volumes:** `<project>_sqlite_data` → `/data`, `<project>_uploads_data` → `/app/uploads`; host bind mounts `${RECIPE_UPLOADS_HOST_DIR:-$HOME/uploads}` → `/host-recipe-uploads`, `${RECIPE_OUTPUT_HOST_DIR:-$HOME/recipe-output}` → `/host-recipe-output`; `/etc/tailscale/certs` → `/etc/ssl/tailscale:ro`.
- **HTTP vs HTTPS:** `frontend/docker-entrypoint.d/40-select-tls.sh` renders one of `frontend/nginx/http.conf.template` / `https.conf.template` (both include `app-locations.conf`):
  - HTTPS if `TLS_HOSTNAME` is set (root `.env`) **or** exactly one `*.crt`/`*.key` pair exists in `/etc/tailscale/certs`, and the cert files exist → `:443 ssl`, `:80` redirects (except `/healthz`)
  - otherwise plain HTTP on `:80`
- **Host ports:** `HTTP_PORT` (default 80) → 80, `HTTPS_PORT` (default 443) → 443; both accept `ip:port` (use e.g. `HTTP_PORT=127.0.0.1:8080` if the host already has a listener on :80 — the Pi does). (`APP_PORT` is no longer used.)
- nginx config/template changes are baked into the image → `make up` (rebuild), not `make restart`.
- **Make targets:** `help setup reconfigure tailscale-setup tailscale-renew tailscale-cron up down restart logs status backup restore update shell-backend`. Use `make backup/restore` — the backend image has no `sqlite3`.
- **Tailscale:** `tailscale-setup.sh` issues the cert, writes `TLS_HOSTNAME`, `APP_BASE_URL=https://…`, `SESSION_SECURE=true` to root `.env`, rebuilds, and can install a root cron for renewal.
- **Recipe photo bridge:** the backend only does file I/O; `tools/recipe-image-watcher` (host systemd service) runs `claude -p` on the subscription and writes JSON results. Host dirs must exist before `make up` (else Docker creates them root-owned).
- **MCP server:** `mcp/` — configured via shell env or `.mcp.json` (`mcp/.env` is not loaded); in Docker, `ORGANIZER_BASE_URL` must be the nginx URL (backend port isn't published).
- **Base images are pinned by digest** in both Dockerfiles (see §10 for how to refresh them).

---

## 6. Host AI Bridge: Recipe Photos → Inventory, Book Lookups → Reading List

Two features run headless Claude **outside** the container, in one host-side watcher, over a
pair of bind-mounted directories. The app only ever does file I/O.

### Recipe photo → inventory
Uploading a photo of a recipe or ingredient list adds the items to inventory.

### How it works
1. Frontend posts the photo to `POST /api/v1/inventory/extract-from-image`.
2. The backend validates it by **magic bytes**, then writes a sidecar
   `<image>.ctx.json` containing the household's existing distinct inventory categories —
   this teaches the extractor to categorize the way we already do.
3. It `rename()`s the file into `RECIPE_EXTRACT_UPLOAD_DIR` (atomic, so the watcher's
   `moved_to` inotify event fires on a complete file — never a partial write).
4. `tools/recipe-image-watcher/` — deployed as the **`recipe-image-watcher` systemd service** —
   picks it up and runs **headless Claude Code** (`claude -p`) on the image, emitting
   `{ title, items: [{ name, quantity, unit, category }] }`.
5. The backend polls `RECIPE_EXTRACT_OUTPUT_DIR` for `<image>.json` until
   `RECIPE_EXTRACT_TIMEOUT_MS` (default 75 s), returns the items, and cleans up all
   temp files (image, `.json`, `.raw.txt`, `.ctx.json`) on every exit path.

### Why it's structured this way
**The app never runs AI and never holds a model API key** — it only does file I/O across a
bind mount. That keeps the credential outside the container entirely.

> **Billing:** the watcher runs on the **Claude subscription** via the account logged into
> `~/.claude`, not pay-as-you-go. `ANTHROPIC_API_KEY` must be **absent** — `watch-recipes.sh`
> exits with `FATAL` if it's set, and the systemd unit adds `UnsetEnvironment=ANTHROPIC_API_KEY`
> as a second guard. There is deliberately **no API-key fallback**: missing subscription auth
> fails loudly rather than silently switching billing accounts.

### Book lookup → cover + synopsis (guest display)
Saving a book in Settings → Guest display with no synopsis or cover queues a lookup; a title alone
is enough. Asynchronous, unlike recipes — the save returns immediately.
1. `PATCH /guest/content` marks the book `enrichStatus: 'pending'` and `services/book-enrichment.ts`
   writes `<bookId>.book.json` (`{ id, title, author }`) into `RECIPE_EXTRACT_UPLOAD_DIR` (atomic rename).
2. The same watcher (`process_book` in `watch-recipes.sh`) runs `claude -p` with
   `--allowedTools "WebFetch,WebSearch"` and `BOOK_MAX_TURNS` (12): Open Library first, Google Books
   second, web search only as a fallback. It returns `{ found, title, author, year, synopsis, coverUrl }`.
3. `finish-book.mjs` downloads the cover **on the host** (https only, image content-type, ≤5 MB, tiny
   placeholders rejected) and writes `<bookId>.book.result.json` + `<bookId>.cover.<ext>` to
   `RECIPE_EXTRACT_OUTPUT_DIR`. It always writes a result — `{ ok: false, error }` on failure — so the
   app never waits on a lookup that already died.
4. `ingestBookLookups()` (60 s ticker in `index.ts`, and on every `GET /guest/content`) folds results
   into the `guest_books` row: author/synopsis fill only if empty, the cover becomes an `Attachment`
   with `ownerUserId: null, linkedEntityType: 'guestBook'` (household-readable — see the download
   check in `attachments.ts`), the previous cover attachment is deleted, temp files are removed.
   Pending books older than 15 min are marked failed ("Timed out").
- The UI polls `guestContent` every 10 s while any book is pending. "Look up again" re-queues.
- ~20–40 s per book, serial, on the subscription. Google Books' keyless API rate-limits under bursts;
  Open Library is the primary source for exactly that reason.

Full deployment notes: `tools/recipe-image-watcher/README.md`.

---

## 7. MCP Server (`mcp/`)

Lets Claude read and write the household data directly. Wired up by `.mcp.json` at the repo root.

- **Transport:** stdio by default (`MCP_TRANSPORT`); HTTP/SSE available behind an env flag
  for Tailscale/remote use.
- **Auth:** logs into the REST API as a normal user (`ORGANIZER_USERNAME` / `ORGANIZER_PASSWORD`,
  default `claude-bot`) against `ORGANIZER_BASE_URL`. Give that account only the role it needs.
- **15 tools:** `get_today_summary`; tasks (`list_tasks`, `create_task`, `update_task`);
  chores (`list_chores`, `update_chore_assignment`); grocery (`list_grocery_lists`,
  `list_grocery_items`, `add_grocery_item`); `list_inventory`; calendar (`list_calendars`,
  `list_calendar_events`, `create_calendar_event`); reminders (`list_reminders`, `create_reminder`).
- Outputs are **lean projections** (id/title/state-style fields only) to keep Claude's
  per-call context small. Preserve that when adding tools.
- Build before use: `cd mcp && npm install && npm run build` (`.mcp.json` points at `mcp/dist/index.js`).
  `mcp/smoke-test.mjs` verifies the server end to end.

---

## 8. `fo` CLI, Claude Code skills, remote display control (`tools/fo-cli/`)

`fo.mjs` is a zero-dependency Node client for the REST API, signed in as the dedicated **`claude-bot`**
MEMBER account (created 2026-09-20). Credentials: `~/.config/family-organizer/cli.env` (0600), session
cookie cached beside it so repeated calls stay under the 15/15-min login limit. `FO_ENV_FILE` overrides
the config path (used to point at the preview harness).

```
fo task add "…" [--due today|tomorrow|YYYY-MM-DD] [--priority N] [--assign user] [--notes …]
fo task list [--status …]           fo grocery add "a, b, c" [--list name]     fo grocery lists
fo inventory add "…" [--qty N] [--unit u] [--category c] [--threshold N] [--drinks]
fo inventory list [--search x] [--drinks] [--low]      fo display [dashboard|kiosk|guest]      fo whoami
```

`--assign` needs `GET /auth/users`, which is ADMIN-only — with a MEMBER bot it fails with a clear message
and the task is not created. Promote the bot if assignment from skills matters.

**Skills** live in `tools/fo-cli/skills/<name>/SKILL.md` and are symlinked into `~/.claude/skills/` by
`install.sh` (which also puts `fo` on PATH): `fo-task`, `fo-grocery`, `fo-inventory`, `fo-display`. They
translate natural language into `fo` invocations and relay the CLI's confirmation line; the grocery skill
asks which list when several are active and none was named.

**Remote display control.** `PATCH /settings/display` stores `{ mode, requestedAt }`. Only a device
flagged as the wall display follows it (`lib/displayControl.ts`): the flag is set by opening the app with
`?wall=1` once (the Tauri shell's configured URL, `~/.config/family-organizer/url`, does this) or via the
checkbox in Settings → Guest display → Remote control. The flagged device polls every 20 s, applies each
`requestedAt` once, and otherwise leaves a hand-made layout change alone. Switching *out* of guest mode
this way bypasses the display PIN by design — the command needs a signed-in household account.

## 9. Desktop Shell (`desktop/`)

A [Tauri v2](https://tauri.app) app so the Pi's display isn't a browser window. **The web
app is unaffected** — this is an additional client.

### What it is (and isn't)
A Rust shell around the system WebKitGTK webview that loads the URL the Pi already serves,
fullscreen and chrome-less. **It holds no application code** — UI and API calls all come
from the server, so the desktop app cannot drift from the browser. Ship the frontend once,
both update. Measured ~175 MB resident vs ~300–400 MB for Electron.

It earns its place by solving two things a browser window doesn't:
1. **Boot ordering** — at login the Docker stack usually isn't up. A local splash polls
   `/api/v1/health` every 2 s and loads the app once it answers.
2. **Self-healing** — 3 consecutive failed health checks (~45 s) drop back to the splash,
   which re-enters the app on recovery. Threshold is >1 so a blip doesn't yank the page
   out from under someone mid-interaction.

### Key files
| File | Purpose |
|------|---------|
| `desktop/src-tauri/src/main.rs` | Window setup, health polling, watchdog loop |
| `desktop/src-tauri/tauri.conf.json` | Window (fullscreen, undecorated) + `deb` bundle config |
| `desktop/src-tauri/capabilities/default.json` | Permissions — no remote origin gets IPC |
| `desktop/ui/index.html` | The only bundled page: splash + `setStatus`/`setHost` hooks |
| `desktop/install.sh` | Installs the `.deb` and the autostart entry |

### Server URL resolution
`FAMILY_ORGANIZER_URL` env var → `~/.config/family-organizer/url` → compiled-in default.
One build therefore works on any household's Pi without a recompile. The URL may carry a path or query —
this Pi's is `https://familyorganizer.tail411eff.ts.net/?wall=1` (the wall-display flag, §8); the health
check is built from the URL's origin, not the raw string.

### Build
```bash
cd desktop && npm install && npm run build   # → src-tauri/target/release/bundle/deb/*.deb
./install.sh                                 # install + enable autostart
```

> **Rust ≥1.88 required.** Debian trixie's packaged `rustc` (1.85) is too old for the
> current Tauri dependency tree. Install via rustup; it lives in `~/.cargo` and leaves
> `/usr/bin/rustc` alone.

### Autostart
XDG entry at `~/.config/autostart/family-organizer.desktop`. The Pi's labwc session runs
`lxsession-xdg-autostart`, which picks it up at login; it launches under `lwrespawn` so the
shell restarts itself if it exits.

**`Alt+F4` does not close it under `lwrespawn`** — the supervisor relaunches it ~1s later.
To actually stop it:
```bash
pkill -f 'lwrespawn /usr/bin/family-organizer-desktop'
pkill -x family-organize      # 'family-organize' — comm is truncated to 15 chars
```
Don't `pkill -x lwrespawn`: `pcmanfm-pi` and `wf-panel-pi` run under it too. Install with
`./install.sh --no-respawn` if `Alt+F4` should just work.

No custom global shortcuts — wlroots won't grant global hotkey grabs without a portal, so
an app-registered shortcut would silently do nothing.

Rebuilds reuse the version number, so `apt install` no-ops; `install.sh` uses `dpkg -i`.

### On-screen keyboard
The Pi's display is a touchscreen with **no physical keyboard**, and nothing on a stock image
starts an OSK — `squeekboard` is installed but never launched. `install.sh` writes
`~/.config/autostart/squeekboard.desktop` to fix that (`--no-osk` to skip). squeekboard
shows/hides itself via Wayland `text-input-v3`, so it needs no per-app wiring; verified
against the login form's autofocused username field.

Not verified: whether fields low on a page stay visible above the keyboard (it covers ~1/3
of the portrait screen and nothing scrolls focus into view).

### The display does not depend on Tailscale
`/etc/hosts` maps `familyorganizer.tail411eff.ts.net` to `127.0.0.1`. The wall display and
the server are the same machine, so resolving through Tailscale MagicDNS added a failure
mode for no benefit: when `tailscaled` logged out on 2026-08-24, the name stopped resolving
and the shell's watchdog correctly dropped to its splash screen. The frontend publishes
:443 on all interfaces and the TLS cert is issued for that name, so it still validates.
Remove the entry only if the frontend moves off this host.

Remote access (phones, other devices) still needs Tailscale — this only fixes the local
display.

### Display sleep schedule (host, not the app)
The wall display goes dark 22:00 and wakes 05:00 via `~/scripts/display-power.sh`
(cron, plus an autostart `sync` so a reboot inside the dark window lands correctly).

**The non-obvious part:** the ASUS VT229 pulses its HPD line when the HDMI output powers
down. labwc reads the resulting DRM hotplug as a monitor reconnect and powers the display
back on ~7 seconds later — every time, with both `wlopm` and `wlr-randr`. Confirmed via
`udevadm monitor --kernel --subsystem-match=drm` (`ACTION=change HOTPLUG=1 CONNECTOR=44`,
twice, ~430 ms apart). The script therefore writes `on` to
`/sys/class/drm/card*-HDMI-A-2/status` before blanking so the kernel reports the connector
permanently connected and the pulse never reaches the compositor, then restores `detect`
on wake. Needs passwordless sudo for that one write. Same symptom as labwc #2279/#3352.

Do **not** "simplify" this by dropping the connector-force — blanking silently stops
holding. And don't reach for DDC/CI: the VT229 accepts `setvcp D6 05` (off) but stops
answering DDC once off, so it cannot be woken remotely — only the physical power button.

### Rendering quirk — do not remove
`main.rs` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` before the webview starts. WebKitGTK's
DMA-BUF renderer produces torn, striped output on the Pi's 270°-rotated HDMI output: flat
fills are fine, text and borders smear into single scanlines. Overridable by setting the
var explicitly; worth re-testing after a WebKitGTK upgrade.

The webview has its own cookie store, so the first launch shows the login page even if a
browser on the same Pi is signed in.

### Conventions
- Remote content gets **no IPC access**: no capability lists a remote origin. Keep it that
  way unless there's a concrete need, then add the narrowest permission that covers it.
- Anything user-visible belongs in the **React frontend**, not here — otherwise the web and
  desktop clients diverge, which is exactly what this design avoids.

---

## 10. Supply-Chain Security

Every workspace ships an `.npmrc`; the desktop crate ships a `deny.toml`; CI runs
`.github/workflows/supply-chain.yml` on push, PR, and weekly.

### The two npm controls

```
min-release-age=7     # refuse versions published in the last 7 days (npm >= 11.10, unit: days)
ignore-scripts=true   # never run install lifecycle scripts
```

`min-release-age` is the one that matters most. Patching reacts to the last attack; a
cooldown means we're never among the first to install a compromised release, since those
are typically caught and yanked within hours to days. `ignore-scripts` closes the
`postinstall` vector specifically — the one the March 2026 axios compromise used.

**Neither reaches the Docker images.** `backend/Dockerfile` and `frontend/Dockerfile` copy
only `package.json` and `package-lock.json`, so container builds are unaffected.

> **After any install in `backend/`, run `npm run setup`** (`prisma generate && npm rebuild
> bcrypt`). Those two genuinely need their install scripts, and `ignore-scripts` skips them.
> In `e2e/`, run `npx playwright install` for the same reason.

When the cooldown blocks a fix `npm audit fix` wants, npm keeps the vulnerable version,
warns, and exits non-zero. Override deliberately per-package with
`min-release-age-exclude=<pkg>` — don't lower the global value.

### The Rust side

`desktop/src-tauri/deny.toml` runs advisories, bans, licenses, and sources. `cargo-deny` is
preferred over `cargo-audit` because it subsumes advisory checking and adds license and
registry policy. `sources` is deny-by-default to crates.io — an unexpected registry or git
source is the strongest single signal of dependency confusion.

The `ignore` list is a **debt register, not a dumping ground**: 16 advisories, all
"unmaintained", almost all the gtk-rs GTK3 bindings. They're unmaintained because gtk-rs
moved to GTK4 while Tauri v2 on Linux still targets GTK3 via WebKitGTK — every Tauri Linux
app carries them, and there's nothing to migrate to until Tauri moves. **Re-check this list
on every Tauri major upgrade.**

### Base images

Pinned by digest in both Dockerfiles so a rebuild can't silently pick up a different
upstream image. Refresh with:

```bash
docker buildx imagetools inspect --format '{{.Manifest.Digest}}' node:20-alpine   # multi-arch INDEX digest
# NOT `docker manifest inspect --verbose … | jq '.[0]…'` — that is the linux/amd64 manifest and fails on the arm64 Pi
```

### Known-good baseline (2026-08-22)

| Check | Result |
|-------|--------|
| `cargo deny check` (440 crates) | advisories ok, bans ok, licenses ok, sources ok |
| desktop / e2e `npm audit` | clean |
| backend / frontend / mcp | patched to semver-compatible fixes; see below |

Two criticals remain because they need breaking major bumps, and neither is
runtime-reachable: **`tar` 6.2.1** (build-time only, via `sqlite3` → `node-gyp`) and
**`vitest` 1.6.1** (dev dependency). Take them with a deliberate major upgrade, not
`audit fix --force`.

### Two pre-existing failures — not regressions

Both predate the dependency work and are unrelated to it. Don't be misled into thinking a
dependency bump caused them:

- **`backend/tests/backup.test.ts`** — "rejects export for non-admin (MEMBER) users" fails.
  Its second `register` call expects 201, but `auth.ts:72` disables registration once any
  active user exists, so it can never pass. The test and the guard both landed in the
  initial commit and have always contradicted each other.
- **`frontend` `tsc --noEmit`** — errors in `src/types/dashboard.ts` about `LayoutItem`/
  `Layout` and property `i`. `react-grid-layout` is 2.2.2 and `@types/react` 18.3.28 both
  before and after the updates, so tsc's inputs never changed.

---

## 11. Troubleshooting

### "401 Unauthorized" on all requests
- No session — `POST /auth/login`. Check `SESSION_SECRET` is set.
- Behind HTTPS, `SESSION_SECURE=true` and `APP_BASE_URL` must match the browser origin (CORS uses it, credentials required). Over plain HTTP, `SESSION_SECURE=true` drops the cookie.

### "403 Forbidden"
- Endpoint needs ADMIN. `POST /auth/register` returns 403 `REGISTRATION_DISABLED` once any user exists — admins add users in Settings.

### Fresh install redirects to HTTPS / site down after cert changes
- Check `docker compose logs frontend` for the TLS mode line. A stray cert in `/etc/tailscale/certs` or a set `TLS_HOSTNAME` enables HTTPS; remove it and `make up` to go back to HTTP.

### Chore assignments not appearing
- Only generated on create / complete / skip (never on a timer), and MANUAL chores never self-generate — use `POST /chores/generate-all` or `POST /chores/:id/generate`.
- Only `PENDING` / `IN_PROGRESS` show as upcoming.

### Google Calendar not syncing
- Client id/secret must be set (env or Settings → Server Configuration). Redirect URL defaults to `${APP_BASE_URL}/api/v1/integrations/google/callback` and must match Google Console exactly.
- Auto-sync every 30 min; accounts with auth errors pause 24 h (`lastSyncError` shown in Settings). Manual: `POST /integrations/google/:accountId/sync`, or `/full-sync` to reset sync tokens.

### Push notifications not working
- VAPID keys required (env or Settings; generate with `npx web-push generate-vapid-keys`).
- Delivery runs on the in-process 60 s ticker — no cron needed. `POST /notifications/process` (ADMIN) forces a pass.

### Weather widget blank
- No OpenWeather key, or `weatherLocation` not set. `/weather` returns 501 `WEATHER_NOT_CONFIGURED`.

### Commute widget empty
- Needs Mapbox token + home address in Settings (`MAPBOX_TOKEN_NOT_SET` / `HOME_ADDRESS_NOT_SET`). Routes only show inside their `showStartMin–showEndMin` window on `daysOfWeek`.

### Book lookup stuck on "Looking up…" or failed
- Same watcher as recipes: `systemctl status recipe-image-watcher`, `journalctl -u recipe-image-watcher -f`
  (look for `LOOKUP book`, `COVER`, `WROTE … book.result.json`)
- The deployed copy lives in `/home/wade/recipe-watcher/` — after editing `tools/recipe-image-watcher/`,
  copy `watch-recipes.sh`, `parse-envelope.mjs`, `finish-book.mjs` there and restart the service
- "Timed out" after 15 min means no result file ever appeared: watcher down, or dirs not writable
- "Not found" is the model's honest answer; fix the title/author and "Look up again"
- No cover but a synopsis: every candidate URL failed the host-side download checks (see journal `SKIP cover`)


### Calendar events missing or duplicated
- Incremental sync uses stored sync tokens; if state has drifted, use
  `POST /integrations/google/:accountId/full-sync` to clear tokens and re-fetch
- Syncs are serialized behind a mutex — a sync already in flight makes the next one wait
- Repeated auth failures trigger a cooldown before retrying; fix the OAuth grant, then force a sync


### Recipe photo upload fails
- 501 `EXTRACTION_NOT_CONFIGURED`: `RECIPE_EXTRACT_*_DIR` unset. 504 `EXTRACTION_TIMEOUT`: watcher not running (`systemctl status recipe-image-watcher`) or slow — raise `RECIPE_EXTRACT_TIMEOUT_MS`. Images dropped while the watcher was down are not re-scanned.

### Database locked / SQLITE_BUSY
- WAL is enabled by `lib/prisma.ts`; ensure only one backend process uses the DB file. Dev DB: `backend/prisma/dev.db`; Docker: `/data/app.db`.

### Frontend can't reach backend
- Dev: Vite proxies `/api` → `http://localhost:3000`. Docker: nginx proxies `/api/` → `backend:3000`. `VITE_API_BASE` overrides the axios base URL.

### Stale data after mutation
- Check the query key matches (see tables above). Settings/preferences use `setQueryData`, not invalidation.

---

## 12. Development Workflow

### Database Migrations
```bash
cd backend
npx prisma migrate dev --name <migration-name>
npx prisma generate   # regenerate client after schema change
npx prisma studio     # visual DB browser
```

### Type checks
```bash
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```

### Tests & Lint
```bash
cd backend  && npm test           # Vitest (loads .env via dotenv)
cd backend  && npm run lint       # ESLint
cd frontend && npm run lint

cd e2e && npx playwright test     # Playwright; see e2e/playwright.config.ts
                                  # global-setup.ts logs in and writes auth-state.json
                                  # includes a portrait project for the md-breakpoint layout
                                  # E2E_BASE_URL / E2E_USERNAME / E2E_PASSWORD point it at a
                                  # scratch preview stack instead of localhost:80 (§ preview harness)
```

### Before Committing
1. `npx tsc --noEmit` in both `backend/` and `frontend/`
2. `npm run lint` in both
3. `npm test` in `backend/`
4. Update this file if you changed a model, route, widget, env var, or service.

### Known Issues (not yet fixed)
- `z.coerce.boolean()` turns `?active=false` into `true` (chores, grocery, reminders, calendar `includeDeleted`).
- `GOOGLE_REDIRECT_URL` always gets a default from env, so a DB `appBaseUrl` never reaches the OAuth redirect (only CORS).
- `homeAddress` is writable by non-admins (missing from the admin-only key check).
- Backup export covers 14 tables; omits Recipe, MealPlan(Entry), CommuteRoute, GoogleAccount, UserPreference, TaskStatusChange, Attachment, PushSubscription, NotificationLog.
- `useGoogleSyncAllMutation` doesn't invalidate `commuteEtas`.
- Recipes are household-wide, and `PATCH|DELETE /recipes/:id` have no ownership check (any member can edit any recipe).
- Unused dependencies: `@dnd-kit/*` (frontend), `nanoevents`, `ts-node-dev` (backend).
- Recurrence `byDay`, `byMonthDay`, `count` are accepted but ignored.
- Two uploaded photos with GPS EXIF were removed from the tree but remain in git history.
