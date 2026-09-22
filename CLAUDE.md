# Family Organizer — AI Reference (CLAUDE.md)

> This file is auto-loaded by Claude Code at the start of every session.
> Keep it accurate and concise. For deep dives, see `docs/`.
>
> Last verified against the codebase: **2026-09-22** (finished-books shelf on top of `e6cf684`).

---

## 1. Project Overview

**Name:** Family Organizer (monorepo)
**Purpose:** Self-hosted household management — tasks, chores, grocery, inventory, calendar, reminders

```
family-organizer/
├── backend/   # Express + Prisma + SQLite API
├── frontend/  # React + Vite SPA
├── desktop/   # Tauri desktop shell for the Pi display (§8)  — see also §9
├── mcp/       # MCP server exposing the API to Claude (§7)
├── tools/     # Host-side helpers: recipe/book watcher (§6), fo CLI + Claude skills (§7b)
├── agents/    # One-off codegen/design agent scripts
├── e2e/       # Playwright end-to-end tests
└── docs/      # Deep dives: architecture, data model, API, deployment
```

### Starting Dev Servers

```bash
# Backend (port 3000)
cd backend && npm run dev

# Frontend (port 80)
cd frontend && npm run dev
```

> **Windows note:** Port 80 requires elevated privileges. If `npm run dev` fails with `EACCES` or `permission denied`, run your terminal as Administrator.

---

## 2. Backend

### Tech Stack
- Node ≥20, TypeScript (ESM), Express 4, Prisma 5 + SQLite, Zod validation
- express-session (SQLite store), bcrypt (12 rounds), Helmet, compression, express-rate-limit
- Optional: Nodemailer, web-push, googleapis, OpenWeatherMap

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/index.ts` | Entry point; loads env, starts services, 60s notification loop |
| `backend/src/server.ts` | `createApp(env)` factory |
| `backend/src/config/env.ts` | Environment variable schema + loading |
| `backend/src/routes/index.ts` | All routes assembled here |
| `backend/src/middleware/require-auth.ts` | Session auth guard |
| `backend/src/middleware/require-role.ts` | Role-based access guard |
| `backend/src/lib/prisma.ts` | Prisma DB client singleton |
| `backend/src/middleware/error-handler.ts` | Global error handler |
| `backend/src/routes/guest.ts` | Guest-display content (Wi-Fi, reading list) as `HouseholdSetting` JSON |
| `backend/prisma/schema.prisma` | Database schema |

### Services Layer (`backend/src/services/`)
| File | Purpose |
|------|---------|
| `background-sync.ts` | Periodic Google Calendar sync |
| `chore-rotation.ts` | Chore assignment generation logic |
| `google-calendar.ts` | Google Calendar sync implementation (sync tokens, mutex, auth cooldown) |
| `notification-engine.ts` | Push notification processing |
| `default-user.ts` | Default user creation on first run |
| `mapbox.ts` | Mapbox geocode + Directions ETA client (2 min ETA cache, 30 day geocode cache) |
| `event-commutes.ts` | Derives ETAs for upcoming calendar events that have a location |
| `prepared-meal.ts` | Mirrors an `isPreparedMeal` inventory item as a linked Recipe |
| `task-recurrence.ts` | Spawns the next occurrence of a recurring task |
| `task-retention.ts` | Auto-archives then hard-deletes stale tasks per household thresholds |
| `book-enrichment.ts` | Guest-display reading list: queues book lookups to the host watcher, ingests cover + synopsis (§6) |

### Auth Pattern
- Session-based (express-session + connect-sqlite3)
- `requireAuth` checks `req.session.userId` → 401 if absent
- `requireRole(...roles)` checks `req.session.role` → 403 if not permitted
- Roles: `ADMIN`, `MEMBER`, `VIEWER`
- Soft-delete users: `deletedAt` timestamp; `passwordHash = '!disabled!'` blocks login

### Error Response Shape
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```
HTTP codes: 400 validation · 401 unauth · 403 forbidden · 404 not found · 409 conflict · 429 rate-limited · 500 server error

### Rate Limits
- Global: 200 req/min per IP
- Auth endpoints: 15 attempts per 15 min

### Environment Variables

Schema lives in `backend/src/config/env.ts` (Zod-validated at boot).

```
# Required
NODE_ENV                        # development | test | production
PORT                            # default 3000
APP_BASE_URL                    # default http://localhost:4173
SESSION_SECRET                  # ≥16 chars
DATABASE_URL                    # file:./dev.db
SQLITE_PATH                     # default ./data/app.db
ENCRYPTION_KEY                  # ≥32 chars — encrypts secrets at rest

# Optional
SESSION_SECURE                  # 'true' to set Secure cookies (HTTPS deploys)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URL
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
WEBHOOK_URL
PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY
OPENWEATHER_API_KEY
RECIPE_EXTRACT_UPLOAD_DIR       # see §6 — recipe photo extraction
RECIPE_EXTRACT_OUTPUT_DIR
RECIPE_EXTRACT_TIMEOUT_MS       # default 75000
TZ                              # default UTC
```

> **Secrets live in the DB, not the env, for most integrations.** Google client ID/secret,
> OpenWeather key, Google Maps key, **Mapbox token**, SMTP password, and VAPID keys are
> configured through the Settings UI and stored as `HouseholdSetting` rows, encrypted with
> `ENCRYPTION_KEY`. `GET /settings` never returns plaintext — it returns `*Set` booleans
> (e.g. `mapboxTokenSet`). The env vars above remain as a fallback/bootstrap path.

### Database Models (Prisma / SQLite)

| Model | Key Fields |
|-------|-----------|
| User | id, username, email, passwordHash, pinHash, role, colorHex, authProvider, timezone, lastLoginAt, deletedAt |
| UserPreference | userId, theme, seasonalTheme, dashboardConfig (JSON), kioskConfig (JSON), guestConfig (JSON), hiddenTabs |
| UserSecret | userId, secretType, encryptedValue (Bytes) |
| GoogleAccount | userId, email, displayName, encryptedRefreshToken, lastSyncedAt |
| LinkedCalendar | userId, googleAccountId, googleId, displayName, colorHex, accessRole, syncToken, lastSyncedAt |
| FamilyEvent | linkedCalendarId, source (GOOGLE/LOCAL), sourceEventId, title, description, startAt, endAt, allDay, timezone, colorHex, location, attendees, etag, visibility, deleted |
| Task | title, dueAt, priority(0-5), status, labels, recurrenceId, deletedAt |
| TaskAssignment | taskId, userId, status, progressNote, completedAt |
| TaskStatusChange | taskId, fromStatus, toStatus, changedBy, note |
| TaskRecurrence | frequency, interval, byDay, byMonthDay, until, count |
| Chore | title, rotationType, frequency, interval, eligibleUserIds (CSV), rewardPoints, active |
| ChoreAssignment | choreId, userId, windowStart, windowEnd, state, rotationOrder, notes, completedAt, verifiedById |
| GroceryList | ownerUserId, name, store, presetKey, isActive |
| GroceryItem | listId, name, category, quantity, unit, state, assigneeUserId, claimedByUserId, pantryItemKey, sortOrder, movedToInventoryAt |
| InventoryItem | name, category, quantity, unit, lowStockThreshold, pantryItemKey (unique), **isPreparedMeal**, **isDrinkFridge** |
| Reminder | ownerUserId, targetType, targetId, channelMask, leadTimeMinutes, quietHoursStart, quietHoursEnd, enabled |
| ReminderTrigger | reminderId, channel, nextFireAt, lastAttemptAt, lastStatus, retryCount |
| Attachment | ownerUserId, fileName, filePath, contentType, byteSize, checksum, linkedEntityType/Id, scanned |
| PushSubscription | userId, endpoint, p256dh, auth, userAgent |
| NotificationLog | userId, reminderId, channel, title, body, status, sentAt |
| HouseholdSetting | key (PK), value — also holds encrypted integration secrets and the guest-display content (`guest_wifi`, `guest_books`) |
| CommuteRoute | name, destAddress, travelMode, showStartMin, showEndMin, daysOfWeek (CSV 0-6), sortOrder, active |
| GeocodeCache | cached Mapbox address→coordinate lookups (30 day TTL) |
| LocationGeocodeCache | cached geocodes for calendar event locations, incl. negative results (24 h TTL) |
| AuditLog | actorUserId, actionType, entityType, entityId, payload, ipAddress, userAgent |
| SearchIndex | entityType, entityId, content |
| Recipe | title, description, servings, prepMinutes, cookMinutes, sourceUrl, ingredientsJson (JSON), createdByUserId, **sourceInventoryItemId** (unique — set for prepared-meal mirrors) |
| MealPlan | title, weekStart, createdByUserId |
| MealPlanEntry | mealPlanId, recipeId?, title, mealType (BREAKFAST/LUNCH/DINNER/SNACK), dayOffset (0–6), servings, notes |

**Enum values:**
- Task status: `OPEN | IN_PROGRESS | BLOCKED | DONE | ARCHIVED`
- Chore rotation: `ROUND_ROBIN | WEIGHTED | MANUAL`
- Assignment state: `PENDING | IN_PROGRESS | COMPLETED | SNOOZED | SKIPPED`
- Grocery item state: `NEEDED | CLAIMED | IN_CART | PURCHASED`
- User role: `ADMIN | MEMBER | VIEWER`
- Recurrence frequency: `DAILY | WEEKLY | BIWEEKLY | MONTHLY | YEARLY`
- Meal type: `BREAKFAST | LUNCH | DINNER | SNACK`
- Travel mode: `DRIVE | BICYCLE | WALK | TWO_WHEELER | TRANSIT`

### All API Endpoints (`/api/v1`)

**Auth `/auth`**
- `POST /register` — `{ username, email?, password, role? }` → User (201)
- `POST /login` — `{ username, password }` → User + session
- `POST /logout` — clears session
- `GET /me` — current user
- `PATCH /me` — `{ email?, timezone?, colorHex? }`
- `POST /me/password` — `{ currentPassword, newPassword }`
- `POST /me/pin` — `{ currentPassword, pin: '4–8 digits' | null }` → User (sets/clears the display PIN; `GET /me` returns `hasPin`)
- `POST /me/pin/verify` — `{ pin }` → `{ ok, pinSet }`; 403 `WRONG_PIN`. Rate-limited like login.
- `GET /users` (ADMIN) — list all users
- `POST /users` (ADMIN) — create user
- `PATCH /users/:id/role` (ADMIN) — `{ role }`
- `POST /users/:id/reset-password` (ADMIN) — `{ newPassword }`
- `DELETE /users/:id` (ADMIN) — soft delete

**Tasks `/tasks`**
- `GET /` — `?status&cursor&limit=20` → `{ items, total, nextCursor }`
- `POST /` — `{ title, description?, dueAt?, priority?=0, status?="OPEN", labels?, assigneeUserIds?, recurrence? }`
- `GET /:id` — task with assignments
- `PATCH /:id` — partial update
- `DELETE /:id` — soft delete (204)
- `GET /:id/history` — `{ taskId, history: TaskStatusChange[] }`

**Chores `/chores`**
- `GET /` — `?active&includeAssignments` → `{ items, total }`
- `POST /` — `{ title, description?, rotationType?, frequency, interval?=1, eligibleUserIds, weightMap?, rewardPoints?=0, active?=true }`
- `GET /:id`
- `PATCH /:id`
- `DELETE /:id` — (204)
- `PATCH /assignments/:id` — `{ state?, notes? }`
- `POST /assignments/:id/skip` — `{ reason? }`
- `POST /assignments/:id/swap` — `{ targetUserId }`
- `POST /:id/generate` — generate next assignment
- `POST /generate-all` — generate all pending
- `GET /:id/streaks` — `{ choreId, streaks: [{ userId, username, currentStreak, longestStreak, totalCompleted }] }`

**Grocery `/grocery`**
- `GET /lists` — `?includeItems&active`
- `POST /lists` — `{ name, store?, presetKey?, isActive? }`
- `PATCH /lists/:id` / `DELETE /lists/:id`
- `GET /lists/:id/items`
- `POST /lists/:id/items` — `{ name, category?, quantity?, unit?, state?, assigneeUserId?, notes? }`
- `POST /lists/:id/items/bulk` — `{ text }` (natural language)
- `POST /lists/:id/items/from-low-stock`
- `PATCH /lists/:listId/items/:itemId` / `DELETE /lists/:listId/items/:itemId`

**Inventory `/inventory`**
- `GET /` — `?search&category&lowStock&drinkFridge`
- `GET /export` — text file download
- `POST /` — `{ name, category?, quantity?, unit?, lowStockThreshold?, notes?, isPreparedMeal?, isDrinkFridge?, dateAdded? }`
- `POST /bulk` — `{ text }` (natural language)
- `POST /bulk-items` — `{ items: [{ name, quantity?, unit?, category? }] }` → created rows (201)
- `POST /extract-from-image` — multipart `image` (JPG/PNG/WebP); routes the photo through the
  host watcher and returns `{ title?, items: [...] }`. See §6. 415 on a non-image,
  422 if the analysis is unparseable, 503 if extraction dirs aren't configured.
- `PATCH /:id` / `DELETE /:id`
- `POST /from-grocery` — `{ groceryItemId, groceryListId }`
- `POST /from-grocery-list` — `{ groceryListId }`

**Meal Plans `/meal-plans`**
- `GET /recipes` / `POST /recipes` / `GET /recipes/:id` / `PATCH /recipes/:id` / `DELETE /recipes/:id`
- `GET /recipes/:id/inventory-check` — `?servings` → `{ canMake, ingredients: [{ status: ok|low|missing|unlinked }] }`
- `POST /recipes/:id/add-missing-to-grocery` — `{ groceryListId, servings? }`
- `GET /entries-by-range` — `?start&end` → flat list of entries with resolved dates
- `GET /` / `POST /` / `GET /:planId` / `PATCH /:planId` / `DELETE /:planId`
- `POST /:planId/entries` / `PATCH /:planId/entries/:entryId` / `DELETE /:planId/entries/:entryId`
- `POST /:planId/send-to-grocery` — `{ groceryListId }`

**Calendar `/calendar`**
- `GET /calendars` — linked Google calendars
- `GET /events` — `?start&end&calendarId` → events in range
- `POST /events` — `{ linkedCalendarId?, title, startAt, endAt, allDay?, timezone, colorHex?, location? }`
- `PATCH /events/:id` / `DELETE /events/:id` (soft)

**Commute `/commute`**
- `GET /routes` — saved commute routes
- `POST /routes` — `{ name, destAddress, travelMode?, showStartMin, showEndMin, daysOfWeek?, sortOrder?, active? }`
- `PATCH /routes/:routeId` / `DELETE /routes/:routeId`
- `GET /routes/:routeId/eta` → `{ durationSeconds, staticDurationSeconds, distanceMeters, polyline, congestion[] }`
- `GET /etas/active` — ETAs for routes inside their display window today, plus upcoming
  calendar events that have a resolvable location
- Requires `mapboxToken` in settings → 400 `MAPBOX_TOKEN_NOT_SET` otherwise

**Settings `/settings`**
- `GET /` — `{ householdName, timezone, quietHours, hiddenTabs, theme, weatherLocation,
  weatherUnits, taskRetention, homeAddress }` + `*Set` booleans for each encrypted secret
- `PATCH /` — partial update; also accepts `googleClientId/Secret`, `openweatherApiKey`,
  `googleMapsApiKey`, `mapboxToken`, `homeAddress`, `smtp*`, `pushVapid*` (encrypted on write)
- `GET /display` / `PATCH /display` (ADMIN, MEMBER) — `{ mode: dashboard|kiosk|guest, requestedAt }`: remote wall-display control (§7b)
- `GET /me` — user preferences `{ theme, seasonalTheme, dashboardConfig, kioskConfig, guestConfig, hiddenTabs }`
- `PATCH /me` — user preferences update

**Guest display `/guest`**
- `GET /content` — `{ wifi: { ssid, security, password, hidden } | null, books: [{ id, title, author, reader, progress, coverAttachmentId, synopsis, year, finishedAt, enrichStatus, enrichError, … }], lookupEnabled }`
  (Wi-Fi password is `enc:` at rest but returned in plaintext — the display renders it into a QR). Also ingests finished book lookups.
- `PATCH /content` (ADMIN, MEMBER) — `{ wifi?: … | null, books?: […] }`. A new book with no synopsis/cover is queued for lookup (§6).
  A book with `finishedAt` set is finished; the newest `MAX_FINISHED` (12) are kept and older ones are pruned on write. Books still being read are never pruned.
- `POST /books/:bookId/lookup` (ADMIN, MEMBER) — re-run the lookup; 503 `LOOKUP_NOT_CONFIGURED` if the bridge dirs aren't set

**Reminders `/reminders`**
- `GET /` — `?enabled&targetType`
- `POST /` — `{ title, message?, targetType, targetId?, channelMask?, leadTimeMinutes?, enabled? }`
- `GET /:id` / `PATCH /:id` / `DELETE /:id`

**Notifications `/notifications`**
- `POST /subscribe` — `{ endpoint, keys: { p256dh, auth } }`
- `DELETE /subscribe` — `{ endpoint }`
- `GET /subscriptions` / `GET /log` / `GET /log/all` (ADMIN)
- `POST /trigger/:reminderId` — manual fire
- `POST /process` (ADMIN) / `POST /digest` (ADMIN)
- `GET /vapid-public-key` (public)

**Attachments `/attachments`**
- `GET /` — `?linkedEntityType&linkedEntityId`
- `POST /` — multipart/form-data: `file`, `linkedEntityType?`, `linkedEntityId?`
- `GET /:id/download` / `DELETE /:id`
- Max 10 MB; validated by magic bytes

**Integrations `/integrations/google`**
- `GET /` — list connected accounts with calendars
- `GET /start` — `?login_hint` → `{ url }` (OAuth URL)
- `GET /callback` — OAuth redirect handler
- `DELETE /:accountId`
- `POST /:accountId/sync` — incremental sync using stored sync tokens
- `POST /:accountId/full-sync` — clears sync tokens and re-fetches everything (drift repair)
- `POST /sync-all`

**Other**
- `GET /healthz` — root-level health check (unprotected)
- `GET /api/v1/health` — `{ status: 'ok', timestamp }`
- `GET /weather` — `?location&units=imperial` → current + daily forecast
- `GET /backup/export` (ADMIN) / `POST /backup/import` (ADMIN)

---

## 3. Frontend

### Tech Stack
- React 18.2, TypeScript 5.3, Vite 5.1
- React Router 6.22, TanStack React Query 5.28, Axios 1.6
- Tailwind CSS 3.4 + CSS custom properties (16 themes)
- @dnd-kit/core — Kanban drag-and-drop
- react-grid-layout — Dashboard widget grid
- Zustand 4.5 (installed, minimal use)

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/main.tsx` | Entry point |
| `frontend/src/App.tsx` | App shell + routing |
| `frontend/src/api/client.ts` | Axios instance (`baseURL: '/api/v1'`, `withCredentials: true`) |
| `frontend/src/contexts/ThemeContext.tsx` | Theme provider |
| `frontend/src/hooks/useAuth.tsx` | Auth state + current user (`AuthProvider` + `useAuth()`) |
| `frontend/src/components/widgets/widgetRegistry.ts` | Dashboard widget registry |

### Provider Hierarchy (`main.tsx`)
```
ErrorBoundary → QueryClientProvider → BrowserRouter → AuthProvider → ThemeProvider → App
```

### Pages & Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/login` | LoginPage | Session login form |
| `/register` | RegisterPage | New account form |
| `/` | DashboardPage | Drag/resize widget grid |
| `/tasks` | TasksPage | Kanban board (4 columns) |
| `/chores` | ChoresPage | Chore templates + assignments |
| `/calendar` | CalendarPage | Day/week/month view + overlays |
| `/grocery` | GroceryPage | Shopping lists with shopping mode |
| `/inventory` | InventoryPage | Pantry tracker |
| `/meal-plans` | MealPlanPage | Weekly planner + recipe management |
| `/reminders` | → redirect | Redirects to `/notifications` |
| `/notifications` | NotificationsPage | Push notification history + reminder CRUD |
| `/settings` | SettingsPage | Household config, Google, users, backup |
| `/kiosk` | KioskPage → DisplayPage mode=kiosk | Minimal read-only family display |
| `/guest` | GuestPage → DisplayPage mode=guest | Guest display: guest-safe widgets only, optional PIN on exit |

All authenticated routes wrapped in `AppLayout` (header + sidebar nav).

### React Query Keys & Stale Times

| Key | Stale Time | Resource |
|-----|-----------|---------|
| `['tasks']` | 30s | Tasks list |
| `['chores']` | 30s | Chores + assignments |
| `['groceryLists']` | 30s | Grocery lists + items |
| `['inventory']` | 30s | Inventory items |
| `['settings']` | ∞ | Household settings |
| `['userPreferences']` | ∞ | User theme + dashboard config |
| `['linkedCalendars']` | 60s | Google calendar list |
| `['googleIntegration']` | ∞ | Connected Google accounts |
| `['weather', location]` | 5m | Weather data |
| `['guestContent']` | 5m | Guest display Wi-Fi + books |

### Mutation Hooks & Invalidation

All mutation hooks follow this pattern:
```ts
useMutation({ mutationFn: ..., onSuccess: () => queryClient.invalidateQueries({ queryKey: [...] }) })
```

| Hook File | Hooks | Invalidates |
|-----------|-------|------------|
| `src/hooks/useTaskMutations.ts` | `useCreateTaskMutation`, `useUpdateTaskMutation`, `useDeleteTaskMutation` | `['tasks']` |
| `src/hooks/useChoreMutations.ts` | `useCreateChoreMutation`, `useUpdateChoreMutation`, `useDeleteChoreMutation`, `useUpdateAssignmentMutation`, `useSkipAssignmentMutation`, `useSwapAssignmentMutation` | `['chores']` |
| Grocery hooks | `useCreate/Update/DeleteGroceryList/ItemMutation`, `useBulkAddGroceryItemsMutation`, `useAddLowStockToGroceryMutation` | `['groceryLists']` |
| Inventory hooks | `useCreate/Update/DeleteInventoryMutation`, `useMove*Mutation`, `useBulkAddInventoryItemsMutation` | `['inventory']` (move also invalidates `['groceryLists']`) |
| Settings hooks | `useUpdateSettingsMutation`, `useUpdateUserPreferencesMutation` | `['settings']` / `['userPreferences']` |

### TypeScript Types

**`src/types/task.ts`**
```ts
type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'ARCHIVED'
interface Task { id, title, description?, dueAt?, priority: number, status: TaskStatus,
  labels?, assignments?: TaskAssignment[], recurrence?: TaskRecurrence | null,
  createdAt, updatedAt, deletedAt? }
interface TaskAssignment { id, taskId, userId, status, user: { id, username, colorHex } }
interface TaskRecurrence { frequency, interval, byDay?, byMonthDay?, until?, count? }
```

**`src/types/chore.ts`**
```ts
type ChoreAssignmentState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SNOOZED' | 'SKIPPED'
interface Chore { id, title, description?, rotationType, frequency, interval,
  eligibleUserIds: number[], rewardPoints, active, assignments?: ChoreAssignment[] }
interface ChoreAssignment { id, choreId, userId?, windowStart, windowEnd,
  state: ChoreAssignmentState, assignee?: { id, username, colorHex? } | null }
```

**`src/types/auth.ts`**
```ts
interface AuthUser { id, username, email, role: 'ADMIN'|'MEMBER'|'VIEWER', timezone, colorHex }
```

**`src/types/grocery.ts`**
```ts
type GroceryItemState = 'NEEDED' | 'CLAIMED' | 'IN_CART' | 'PURCHASED'
interface GroceryList { id, name, store?, presetKey?, isActive, items?: GroceryItem[] }
interface GroceryItem { id, listId, name, category?, quantity, unit?, state, notes? }
```

### Theming
- 20 themes in two groups (`ThemeMeta.group` in `ThemeContext.tsx`):
  - **classic** (colours only): `default, dark-plus, light-plus, monokai, dracula, solarized-dark, solarized-light, one-dark-pro, nord, midnight, paper, catppuccin-mocha, catppuccin-latte, gruvbox-dark, tokyo-night, rose-pine`
  - **seasonal** (colours + fonts + shapes + background): `halloween, thanksgiving, christmas, dnd`
- Everything a theme looks like is CSS custom properties under `[data-theme="<id>"]` in `src/styles/index.css`,
  consumed by Tailwind via `tailwind.config.js`. Four token families:
  - **colour** — `bg-page, bg-card, text-heading, text-muted, text-secondary, text-faint, border-th-border, border-th-border-light, bg-btn-primary, text-btn-primary, bg-input, border-input, accent, shadow-soft`.
    `--color-card/bg/text/input` are aliases of the long names (components use them inline).
  - **type** — `--font-display`, `--font-body`, `--heading-transform`, `--heading-tracking`
  - **shape** — `--radius-card`, `--radius-btn`, `--radius-pill` (Tailwind `rounded-card/btn/pill`);
    `--btn-font/weight/transform/tracking/border/shadow`, `--btn-secondary-border`
  - **surface** — `--theme-bg-image/size/position/repeat/opacity`, painted by `body::before` as one fixed
    full-page layer on every page. A user-uploaded dashboard photo wins: `AppLayout`/`KioskPage` set
    `body[data-user-bg]`, which hides the theme layer. Artwork is SVG in `src/styles/themes/` (Vite inlines it).
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

### Widgets (Dashboard)

| ID | Widget | Default Grid |
|----|--------|-------------|
| clock | ClockWidget | 4×2 |
| weather | WeatherWidget | 4×2 |
| commute | CommuteWidget | 4×3 |
| tasks | TasksWidget | 4×3 |
| chores | ChoresWidget | 6×3 |
| events | EventsWidget | 8×3 |
| overdueChores | OverdueChoresWidget | 4×2 |
| grocery | GroceryWidget | 6×3 |
| reminders | RemindersWidget | 4×3 |
| inventory | InventoryWidget | 6×3 |
| mealPlan | MealPlanWidget | 6×3 |
| wifi ★ | WifiWidget | 4×3 — SSID + Wi-Fi QR (`uqr`), tap-to-reveal password |
| drinkFridge ★ | DrinkFridgeWidget | 4×3 — inventory items tagged `isDrinkFridge`, grouped by category; qty 0 = "out" |
| reading ★ | ReadingWidget | 4×3 — guest content books with progress + optional cover attachment; finished books drop to a "Recently finished" cover strip (shown when the card is taller than 240px, or when nothing is in progress) |

★ = `guestSafe` in `widgetRegistry.ts` (also Clock and Weather). Only these may appear on the guest display.

Dashboard config stored in localStorage (`dashboard-config`) and synced to server via `/settings/me`.
Kiosk config stored separately in localStorage (`kiosk-config`) and synced to server via `kioskConfig` field in `/settings/me`.
Guest config likewise (`guest-config` / `guestConfig`), defaulting to `DEFAULT_GUEST_CONFIG` (has explicit `mdLayout` for portrait).

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
  ordinary draft edits — nothing is written until **Save books**.

---

## 4. Component Conventions

### Adding a New Feature (full-stack pattern)
1. **Backend:** Add Prisma model field/migration → add Zod schema → add route handler in `routes/*.ts`
2. **Frontend API:** Add function to `src/api/*.ts` (use `api.get/post/patch/delete`)
3. **Frontend Hook:** Add query/mutation hook in `src/hooks/use*.ts`
4. **Frontend Component:** Add component in `src/components/<feature>/`
5. **Frontend Page:** Wire component into the appropriate page in `src/pages/`

### Adding a New Widget
1. Create component in `src/components/widgets/`
2. Register in `widgetRegistry.ts` with `{ id, label, icon, component, defaultW, defaultH, minW, minH }`
3. Widget automatically appears in dashboard "Add widget" panel

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
- Tasks: `deletedAt` field set; `DELETE /tasks/:id` returns 204
- Users: `deletedAt` field set; `passwordHash = '!disabled!'` to block login
- Calendar events: `deleted: true` field

---

## 5. Deployment

Production target is a **Raspberry Pi** running Docker Compose (`docker-compose.yml`):

| Service | Notes |
|---------|-------|
| `backend` | Built from `./backend`, `expose: 3000` (not published), healthcheck on `/api/v1/health` |
| `frontend` | Built from `./frontend`, publishes `${APP_PORT:-80}`, waits for backend to be healthy |

- **Volumes:** `sqlite_data:/data` (the DB at `/data/app.db`), `uploads_data:/app/uploads`,
  plus two host bind mounts for the recipe-extraction bridge (§6).
- **HTTPS via Tailscale:** the frontend mounts `/etc/tailscale/certs` read-only and serves TLS
  on `:443`. See `Tailscale-guide.md` and `tailscale-setup.sh`.
- `setup.sh` bootstraps a fresh host; `Makefile` wraps the common build/run targets.

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

## 7b. `fo` CLI, Claude Code skills, remote display control (`tools/fo-cli/`)

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

## 8. Desktop Shell (`desktop/`)

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
this Pi's is `https://familyorganizer.tail411eff.ts.net/?wall=1` (the wall-display flag, §7b); the health
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

## 9. Supply-Chain Security

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
docker manifest inspect --verbose node:20-alpine | jq -r '.[0].Descriptor.digest'
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

## 10. Troubleshooting

### "401 Unauthorized" on all requests
- Session not established — user needs to `POST /auth/login`
- Check `SESSION_SECRET` env var is set (≥16 chars)
- Check cookie is being sent: Axios uses `withCredentials: true`; CORS must allow credentials and match `APP_BASE_URL`

### "403 Forbidden"
- User role insufficient — endpoint requires `ADMIN` but user is `MEMBER` or `VIEWER`
- Check `req.session.role` vs required roles in `requireRole()`

### Chore assignments not appearing
- Assignments are not auto-generated — call `POST /chores/generate-all` or `POST /chores/:id/generate`
- Only `PENDING` and `IN_PROGRESS` assignments appear in upcoming list (SKIPPED and COMPLETED are filtered)

### Google Calendar not syncing
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` must all be set
- OAuth callback URL must match exactly what's registered in Google Console
- Sync is background; trigger manually via `POST /integrations/google/:accountId/sync`

### Push notifications not working
- `PUSH_VAPID_PUBLIC_KEY` + `PUSH_VAPID_PRIVATE_KEY` must be set (generate with `web-push generate-vapid-keys`)
- Frontend subscribes via `POST /notifications/subscribe` with browser push subscription object
- Notifications processed by `POST /notifications/process` (ADMIN); run on a cron in production

### Weather widget blank
- `OPENWEATHER_API_KEY` not set, or `weatherLocation` not configured in household settings
- API results cached 5 minutes in memory

### Commute widget empty or erroring
- `mapboxToken` must be set in **Settings**, not the env — a missing one returns 400 `MAPBOX_TOKEN_NOT_SET`
- Routes only appear inside their `showStartMin`–`showEndMin` window on a day listed in `daysOfWeek`
- `homeAddress` must be set and geocodable — it's the origin for every route
- ETAs cache 2 minutes, geocodes 30 days (`GeocodeCache`); event locations that don't look like
  addresses are filtered out and negative-cached for 24 h

### Book lookup stuck on "Looking up…" or failed
- Same watcher as recipes: `systemctl status recipe-image-watcher`, `journalctl -u recipe-image-watcher -f`
  (look for `LOOKUP book`, `COVER`, `WROTE … book.result.json`)
- The deployed copy lives in `/home/wade/recipe-watcher/` — after editing `tools/recipe-image-watcher/`,
  copy `watch-recipes.sh`, `parse-envelope.mjs`, `finish-book.mjs` there and restart the service
- "Timed out" after 15 min means no result file ever appeared: watcher down, or dirs not writable
- "Not found" is the model's honest answer; fix the title/author and "Look up again"
- No cover but a synopsis: every candidate URL failed the host-side download checks (see journal `SKIP cover`)

### Recipe photo extraction hangs or 503s
- 503 means `RECIPE_EXTRACT_UPLOAD_DIR` / `RECIPE_EXTRACT_OUTPUT_DIR` aren't configured
- Check the watcher is alive: `systemctl status recipe-image-watcher`
- Check its logs: `journalctl -u recipe-image-watcher -f`
- If it exits `FATAL` at startup, `ANTHROPIC_API_KEY` is set in its environment — unset it (see §6)
- Both host dirs must be bind-mounted into the container *and* writable by the watcher's user
- A request that exceeds `RECIPE_EXTRACT_TIMEOUT_MS` cleans up and gives up — raise it on a slow Pi

### Calendar events missing or duplicated
- Incremental sync uses stored sync tokens; if state has drifted, use
  `POST /integrations/google/:accountId/full-sync` to clear tokens and re-fetch
- Syncs are serialized behind a mutex — a sync already in flight makes the next one wait
- Repeated auth failures trigger a cooldown before retrying; fix the OAuth grant, then force a sync

### Database locked / SQLITE_BUSY
- SQLite only supports one writer at a time — if multiple processes run, use WAL mode
- Check `DATABASE_URL` points to the correct file
- Development uses `backend/prisma/dev.db`; production should use `SQLITE_PATH`

### Frontend can't reach backend
- Vite dev server proxies `/api` → `http://localhost:3000` (check `vite.config.ts`)
- In production, reverse proxy (nginx/caddy) must forward `/api/v1/*` to the backend port
- `VITE_API_BASE` env var overrides the default base URL

### React Query stale data after mutation
- Every mutation hook calls `queryClient.invalidateQueries` on success
- If data doesn't refresh, check the query key matches exactly (e.g. `['chores']` not `['chore']`)
- Use React Query DevTools in development to inspect cache

### Task drag-and-drop broken
- @dnd-kit sensors need pointer/touch events; check no parent element intercepts pointer events
- `DndContext` must wrap the entire Kanban board, not individual columns

---

## 11. Development Workflow

### Database Migrations
```bash
cd backend
npx prisma migrate dev --name <migration-name>
npx prisma generate   # regenerate client after schema change
npx prisma studio     # visual DB browser
```

### Type Checking
```bash
# Frontend
cd frontend && npx tsc --noEmit

# Backend
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
```

### Before Committing
1. `npx tsc --noEmit` in both `backend/` and `frontend/`
2. `npm run lint` in both
3. `npm test` in `backend/`
4. Update this file if you changed a model, route, widget, env var, or service.
