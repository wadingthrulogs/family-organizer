# Family Organizer — AI Reference (CLAUDE.md)

> This file is auto-loaded by Claude Code at the start of every session.
> Keep it accurate and concise. For deep dives, see `docs/`. Describes the `main` branch.

---

## 1. Project Overview

**Name:** Family Organizer (monorepo)
**Purpose:** Self-hosted household management for a single household: dashboard/kiosk display, tasks, chores, grocery, pantry inventory, meal plans & recipes, calendar (Google sync), commute ETAs, reminders & notifications. Runs in Docker on a Raspberry Pi 5 (or any Linux host).

```
.
├── backend/                 # Express + Prisma + SQLite API (port 3000, internal only in Docker)
├── frontend/                # React + Vite SPA, served by nginx in Docker
│   ├── nginx/               # http.conf.template, https.conf.template, app-locations.conf
│   └── docker-entrypoint.d/ # 40-select-tls.sh — picks HTTP vs HTTPS at container start
├── mcp/                     # MCP server exposing organizer tools to AI clients (see mcp/README.md)
├── tools/recipe-image-watcher/  # Host systemd service: headless Claude Code reads recipe photos
├── agents/                  # Claude Agent SDK scripts (frontend / dashboard review agents)
├── e2e/                     # Playwright end-to-end tests
├── docs/                    # api, architecture, data-model, deployment, requirements, …
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
- express-session + connect-sqlite3 (7-day cookie), bcrypt ^6 (12 rounds), Helmet, cors, compression, morgan, express-rate-limit ^8, multer ^2
- nodemailer ^8, web-push, googleapis ^133 are always installed; their *configuration* is optional
- JSON logger in `src/lib/logger.ts`; AES-256-GCM secret encryption in `src/lib/secrets.ts`
- Tests: vitest + supertest (`backend/tests/`); `npm test` loads `backend/.env` via `dotenv/config`
- Scripts: `dev`, `build`, `start`, `lint`, `test`, `test:watch`, `prisma:generate|migrate|deploy`, `db:reset`

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/index.ts` | Entry: loads env, applies DB config overrides, orphan-event cleanup, starts 60 s ticker |
| `backend/src/server.ts` | `createApp(env)` — middleware, rate limits, `/healthz`, `/api/v1` |
| `backend/src/config/env.ts` | Env schema (Zod) + defaults |
| `backend/src/routes/index.ts` | All routers mounted |
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
- `requireRole('ADMIN')` → 403. **Only ADMIN is enforced anywhere**; MEMBER and VIEWER currently have identical write access.
- `POST /auth/register` is bootstrap-only: first user becomes ADMIN; afterwards → 403 `REGISTRATION_DISABLED` (admins create users via `POST /auth/users`).
- Passwords: 8–128 chars, upper + lower + digit + symbol.
- Deleting a user sets `deletedAt` (soft). `passwordHash = '!disabled!'` is only used by the seeded default user.
- Public (no session): `/healthz`, `/api/v1/health`, `/auth/login|register|logout`, `/notifications/vapid-public-key`, `/weather`, and in non-production the `/integrations/google/*` router (falls back to first user / seeds `household-admin`).

### Error Response Shape
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```
Codes in use include `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `REGISTRATION_DISABLED`, `USERNAME_TAKEN`, `EMAIL_TAKEN`, `WRONG_PASSWORD`, `SELF_ROLE_CHANGE`, `SELF_DELETE`, `NO_UPDATES`, `*_NOT_FOUND`, `ALREADY_MOVED`, `GENERATION_SKIPPED`, `INVALID_STATE`, `USER_NOT_ELIGIBLE`, `SYNC_BUSY`, `SYNC_FAILED`, `RETENTION_FAILED`, `EXTRACTION_*`, `WEATHER_NOT_CONFIGURED`, `HOME_ADDRESS_NOT_SET`, `MAPBOX_TOKEN_NOT_SET`, `GOOGLE_NOT_CONFIGURED`, `INTERNAL_SERVER_ERROR`.

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
| User | id, username, email, passwordHash, pinHash (unused), role, colorHex, authProvider, timezone, lastLoginAt, deletedAt |
| UserPreference | userId, theme, dashboardConfig (JSON), kioskConfig (JSON), hiddenTabs |
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
| InventoryItem | name, category, quantity, unit, lowStockThreshold, pantryItemKey (unique), notes, dateAdded, isPreparedMeal |
| Recipe | title, description, servings, prepMinutes, cookMinutes, sourceUrl, ingredientsJson, createdByUserId, sourceInventoryItemId (unique FK → InventoryItem, cascade) |
| MealPlan / MealPlanEntry | title, weekStart / mealPlanId, recipeId?, title, mealType (BREAKFAST/LUNCH/DINNER/SNACK), dayOffset (0–6), servings, notes |
| CommuteRoute | name, destAddress, travelMode, showStartMin, showEndMin, daysOfWeek (CSV, default "1,2,3,4,5"), sortOrder, active |
| GeocodeCache / LocationGeocodeCache | address→lng/lat (30 d) / negative-result cache for event locations (24 h) |
| Reminder / ReminderTrigger | ownerUserId, targetType, targetId, channelMask, leadTimeMinutes, quietHoursStart/End, enabled / channel, nextFireAt, lastAttemptAt, lastStatus, retryCount |
| PushSubscription / NotificationLog | endpoint, p256dh, auth, userAgent / channel, title, body, status, errorDetail, sentAt |
| Attachment | ownerUserId, fileName, filePath, contentType, byteSize, checksum (sha256), linkedEntityType/Id, scanned |
| HouseholdSetting | key (PK), value (JSON) — secrets encrypted; GET returns `*Set` booleans instead |
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
- `GET /` `?search&category&lowStock` · `GET /export` (text download) · `GET /:itemId`
- `POST /` / `PATCH /:itemId` `{ name, category?, quantity?, unit?, lowStockThreshold?, notes?, dateAdded?, pantryItemKey?, isPreparedMeal? }` — setting `isPreparedMeal` creates/updates a linked Recipe; clearing it deletes it
- `DELETE /:itemId`
- `POST /bulk` `{ text }` (natural language) · `POST /bulk-items` `{ items: [1..200]{ name, quantity?, unit?, category? } }`
- `POST /extract-from-image` — multipart `image` (≤10 MB JPG/PNG/WebP) → `{ title, items[] }`. Writes image + `.ctx.json` (existing categories) to `RECIPE_EXTRACT_UPLOAD_DIR`, polls `RECIPE_EXTRACT_OUTPUT_DIR` for `<img>.json`/`.raw.txt`. 501 `EXTRACTION_NOT_CONFIGURED`, 415, 422 `EXTRACTION_PARSE_FAILED`, 504 `EXTRACTION_TIMEOUT`
- `POST /from-grocery` `{ groceryItemId, groceryListId }` (409 `ALREADY_MOVED`) · `POST /from-grocery-list` `{ groceryListId }` → `{ moved, items }`

**Meal Plans `/meal-plans`**
- `GET /recipes` (caller's recipes only) · `POST /recipes` · `GET|PATCH|DELETE /recipes/:recipeId`
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
- `GET /me` · `PATCH /me` — `{ theme, dashboardConfig, kioskConfig, hiddenTabs }`

**Reminders `/reminders`**
- `GET /` `?enabled&targetType` · `POST /` `{ title, message?, targetType, targetId?, channelMask?, leadTimeMinutes?, quietHoursStart?, quietHoursEnd?, enabled? }` · `GET|PATCH|DELETE /:reminderId`

**Notifications `/notifications`**
- `POST /subscribe` `{ endpoint, keys: { p256dh, auth } }` · `DELETE /subscribe` `{ endpoint }` · `GET /subscriptions`
- `GET /log` `?limit` (50, max 200) · `GET /log/all` (ADMIN, 100, max 500)
- `POST /trigger/:reminderId` · `POST /process` (ADMIN; also generates triggers + escalations) · `POST /digest` (ADMIN)
- `GET /vapid-public-key` (public) → `{ publicKey }`

**Attachments `/attachments`**
- `GET /` `?linkedEntityType&linkedEntityId` · `POST /` multipart `file` (+ `linkedEntityType?`, `linkedEntityId?`), 10 MB, magic bytes, saved to `uploads/`
- `GET /:id/download` · `DELETE /:id` (owner or ADMIN)

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
- Tailwind CSS 3.4 + CSS custom properties (16 themes)
- react-grid-layout **v2** (dashboard/kiosk grid), mapbox-gl 3 (commute map)
- `@dnd-kit/*` is installed but **not imported anywhere**. No Zustand, no React Query DevTools.
- Fonts: Cabin / Source Sans 3. `public/sw.js` handles web push + notification clicks only (no offline cache).

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
| `/kiosk` | KioskPage | Wall display — **outside** `AppLayout`; own layout, edit mode, settings sheet, wake lock, cursor auto-hide, 2-min targeted refresh |

All other authenticated routes are wrapped in `AppLayout` (header, sidebar, mobile bottom bar of up to 4 tabs). Unknown paths → `/`.

### React Query Keys & Stale Times

| Key | Stale | Notes |
|-----|-------|-------|
| `['tasks']` | 30 s | Infinite query, 50/page |
| `['chores']` | 30 s | Calendar uses `['chores', { includeAssignments: true }]` |
| `['groceryLists']` | 20 s | MealPlanPage uses 30 s for same key |
| `['inventory', search, category, lowStock]` | 20 s | |
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

Non-query hooks: `usePushNotifications`, `useWidgetSize`, `useUsers`.

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
- 16 themes: `default, dark-plus, light-plus, monokai, dracula, solarized-dark, solarized-light, one-dark-pro, nord, midnight, paper, catppuccin-mocha, catppuccin-latte, gruvbox-dark, tokyo-night, rose-pine` (CSS in `src/styles/index.css`)
- Colors are CSS custom properties consumed by Tailwind via `tailwind.config.js`
- Key tokens: `bg-page, bg-card, text-heading, text-muted, text-secondary, text-faint, border-th-border, border-th-border-light, bg-btn-primary, text-btn-primary, bg-input, border-input, accent, rounded-card, shadow-soft`
- Shopping mode uses `color-shopping-*` tokens (always dark)

### Widgets (Dashboard & Kiosk) — 11

| ID | Default | Min | | ID | Default | Min |
|----|---------|-----|-|----|---------|-----|
| clock | 4×2 | 2×2 | | overdueChores | 4×2 | 2×2 |
| weather | 4×2 | 3×2 | | grocery | 6×3 | 3×2 |
| commute | 4×3 | 3×2 | | reminders | 4×3 | 2×2 |
| tasks | 4×3 | 2×2 | | inventory | 6×3 | 3×2 |
| chores | 6×3 | 2×2 | | mealPlan | 6×3 | 3×2 |
| events | 8×3 | 3×2 | | | | |

**Grid / layout persistence:**
- react-grid-layout v2: `dragConfig={{ enabled: editMode, handle: '.widget-drag-handle' }}`, `compactor={noCompactor}`, resize handles `se/sw/ne/nw` only
- Breakpoints `lg 1280 / md 996 / sm 768 / xs 480 / xxs 0` → cols `12 / 8 / 4 / 2 / 1`; separate saved `layout` (lg) and `mdLayout` (portrait/md)
- Dashboard config: `localStorage['dashboard-config']` (+ `-ts` timestamp) synced to `/settings/me.dashboardConfig`; kiosk: `kiosk-config` → `kioskConfig`
- Sync rule: once edited locally, the **local copy wins**; the server copy is used only on a fresh device
- Widget removal supports undo; per-widget font size; dashboard background photo with opacity and fill/contain

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
2. Register in `widgetRegistry.ts` with `{ id, label, icon, component, defaultW, defaultH, minW, minH }`
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

---

## 6. Troubleshooting

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

### Recipe photo upload fails
- 501 `EXTRACTION_NOT_CONFIGURED`: `RECIPE_EXTRACT_*_DIR` unset. 504 `EXTRACTION_TIMEOUT`: watcher not running (`systemctl status recipe-image-watcher`) or slow — raise `RECIPE_EXTRACT_TIMEOUT_MS`. Images dropped while the watcher was down are not re-scanned.

### Database locked / SQLITE_BUSY
- WAL is enabled by `lib/prisma.ts`; ensure only one backend process uses the DB file. Dev DB: `backend/prisma/dev.db`; Docker: `/data/app.db`.

### Frontend can't reach backend
- Dev: Vite proxies `/api` → `http://localhost:3000`. Docker: nginx proxies `/api/` → `backend:3000`. `VITE_API_BASE` overrides the axios base URL.

### Stale data after mutation
- Check the query key matches (see tables above). Settings/preferences use `setQueryData`, not invalidation.

---

## 7. Development Workflow

### Database Migrations
```bash
cd backend
npx prisma migrate dev --name <migration-name>
npx prisma generate   # regenerate client after schema change
npx prisma studio     # visual DB browser
```

### Checks
```bash
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit && npm test
cd e2e && npx playwright test   # needs a running app + test user (see e2e/README.md)
```

### Known Issues (not yet fixed)
- `z.coerce.boolean()` turns `?active=false` into `true` (chores, grocery, reminders, calendar `includeDeleted`).
- `GOOGLE_REDIRECT_URL` always gets a default from env, so a DB `appBaseUrl` never reaches the OAuth redirect (only CORS).
- `homeAddress` is writable by non-admins (missing from the admin-only key check).
- Backup export covers 14 tables; omits Recipe, MealPlan(Entry), CommuteRoute, GoogleAccount, UserPreference, TaskStatusChange, Attachment, PushSubscription, NotificationLog.
- `useGoogleSyncAllMutation` doesn't invalidate `commuteEtas`.
- `GET /meal-plans/recipes` returns only the caller's recipes, but `GET|PATCH|DELETE /recipes/:id` have no ownership check.
- Unused dependencies: `@dnd-kit/*` (frontend), `nanoevents`, `ts-node-dev` (backend).
- Recurrence `byDay`, `byMonthDay`, `count` are accepted but ignored.
- Two uploaded photos with GPS EXIF were removed from the tree but remain in git history.
