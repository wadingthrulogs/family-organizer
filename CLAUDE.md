# Family Organizer — AI Reference (CLAUDE.md)

> This file is auto-loaded by Claude Code at the start of every session.
> Keep it accurate and concise. For deep dives, see `docs/`.

---

## 1. Project Overview

**Name:** Family Organizer (monorepo)
**Purpose:** Self-hosted household management — tasks, chores, grocery, inventory, calendar, reminders

```
Organizer/
├── backend/   # Express + Prisma + SQLite API
└── frontend/  # React + Vite SPA
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
| `backend/src/index.ts` | Entry point |
| `backend/src/server.ts` | `createApp(env)` factory |
| `backend/src/routes/index.ts` | All routes assembled here |
| `backend/src/middleware/require-auth.ts` | Session auth guard |
| `backend/src/middleware/require-role.ts` | Role-based access guard |
| `backend/src/lib/prisma.ts` | Prisma DB client singleton |
| `backend/src/middleware/error-handler.ts` | Global error handler |
| `backend/prisma/schema.prisma` | Database schema |

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

```
# Required
NODE_ENV
PORT                    # default 3000
APP_BASE_URL
SESSION_SECRET          # ≥16 chars
DATABASE_URL            # file:./dev.db
SQLITE_PATH
ENCRYPTION_KEY          # ≥32 chars

# Optional
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URL
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY
OPENWEATHER_API_KEY
TZ                      # default UTC
```

### Database Models (Prisma / SQLite)

| Model | Key Fields |
|-------|-----------|
| User | id, username, email, passwordHash, pinHash, role, colorHex, authProvider, timezone, deletedAt |
| UserPreference | userId, theme, dashboardConfig (JSON), hiddenTabs |
| UserSecret | userId, secretType, encryptedValue (Bytes) |
| GoogleAccount | userId, email, displayName, encryptedRefreshToken, lastSyncedAt |
| LinkedCalendar | userId, googleAccountId, googleId, displayName, colorHex, accessRole, syncToken, lastSyncedAt |
| FamilyEvent | linkedCalendarId, source (GOOGLE/LOCAL), title, startAt, endAt, allDay, colorHex, location, deleted |
| Task | title, dueAt, priority(0-5), status, labels, recurrenceId, deletedAt |
| TaskAssignment | taskId, userId, status, progressNote |
| TaskStatusChange | taskId, fromStatus, toStatus, changedBy |
| TaskRecurrence | frequency, interval, byDay, byMonthDay, until, count |
| Chore | title, rotationType, frequency, interval, eligibleUserIds (CSV), rewardPoints, active |
| ChoreAssignment | choreId, userId, windowStart, windowEnd, state, rotationOrder, verifiedById |
| GroceryList | ownerUserId, name, store, presetKey, isActive |
| GroceryItem | listId, name, category, quantity, unit, state, assigneeUserId, claimedByUserId, pantryItemKey, sortOrder |
| InventoryItem | name, category, quantity, unit, lowStockThreshold, pantryItemKey (unique) |
| Reminder | ownerUserId, targetType, targetId, channelMask, leadTimeMinutes, enabled |
| ReminderTrigger | reminderId, channel, nextFireAt, lastStatus, retryCount |
| Attachment | ownerUserId, fileName, filePath, contentType, byteSize, checksum, linkedEntityType/Id, scanned |
| PushSubscription | userId, endpoint, p256dh, auth, userAgent |
| NotificationLog | userId, reminderId, channel, title, body, status, sentAt |
| HouseholdSetting | key (PK), value |
| AuditLog | actorUserId, actionType, entityType, entityId, payload, ipAddress, userAgent |
| SearchIndex | entityType, entityId, content |
| Recipe | title, description, servings, prepMinutes, cookMinutes, sourceUrl, ingredientsJson (JSON), createdByUserId |
| MealPlan | title, weekStart, createdByUserId |
| MealPlanEntry | mealPlanId, recipeId?, title, mealType (BREAKFAST/LUNCH/DINNER/SNACK), dayOffset (0–6), servings, notes |

**Enum values:**
- Task status: `OPEN | IN_PROGRESS | BLOCKED | DONE | ARCHIVED`
- Chore rotation: `ROUND_ROBIN | WEIGHTED | MANUAL`
- Assignment state: `PENDING | IN_PROGRESS | COMPLETED | SNOOZED | SKIPPED`
- Grocery item state: `NEEDED | CLAIMED | IN_CART | PURCHASED`
- User role: `ADMIN | MEMBER | VIEWER`
- Recurrence frequency: `DAILY | WEEKLY | BIWEEKLY | MONTHLY | YEARLY`

### All API Endpoints (`/api/v1`)

**Auth `/auth`**
- `POST /register` — `{ username, email?, password, role? }` → User (201)
- `POST /login` — `{ username, password }` → User + session
- `POST /logout` — clears session
- `GET /me` — current user
- `PATCH /me` — `{ email?, timezone?, colorHex? }`
- `POST /me/password` — `{ currentPassword, newPassword }`
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
- `GET /` — `?search&category&lowStock`
- `GET /export` — text file download
- `POST /` — `{ name, category?, quantity?, unit?, lowStockThreshold?, notes?, dateAdded? }`
- `POST /bulk` — `{ text }` (natural language)
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

**Settings `/settings`**
- `GET /` — `{ householdName, timezone, quietHours, hiddenTabs, theme, weatherLocation, weatherUnits }`
- `PATCH /` — partial update
- `GET /me` — user preferences `{ theme, dashboardConfig, hiddenTabs }`
- `PATCH /me` — user preferences update

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
- `POST /:accountId/sync` / `POST /sync-all`

**Other**
- `GET /health` — `{ status: 'ok', timestamp }`
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
| `frontend/src/context/ThemeContext.tsx` | Theme provider |
| `frontend/src/context/AuthContext.tsx` | Auth state + current user |
| `frontend/src/components/widgets/widgetRegistry.ts` | Dashboard widget registry |

### Provider Hierarchy (`main.tsx`)
```
QueryClientProvider → BrowserRouter → AuthProvider → ThemeProvider → App
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
| `/reminders` | RemindersPage | Reminder CRUD |
| `/notifications` | NotificationsPage | Push notification history |
| `/settings` | SettingsPage | Household config, Google, users, backup |
| `/kiosk` | KioskPage | Minimal read-only family display |

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
- 16 themes: `default, dark-plus, light-plus, monokai, dracula, solarized-dark, solarized-light, one-dark-pro, nord, github-dark, github-light, catppuccin-mocha, catppuccin-latte, gruvbox-dark, tokyo-night, rose-pine`
- All colors are CSS custom properties consumed by Tailwind via `tailwind.config.js`
- Key tokens: `bg-page, bg-card, text-heading, text-muted, text-secondary, text-faint, border-th-border, border-th-border-light, bg-btn-primary, text-btn-primary, bg-input, border-input, accent, rounded-card, shadow-soft`
- Shopping mode uses `color-shopping-*` tokens (dark theme regardless of active theme)

### Widgets (Dashboard)

| ID | Widget | Default Grid |
|----|--------|-------------|
| clock | ClockWidget | 6×2 |
| weather | WeatherWidget | 6×2 |
| tasks | TasksWidget | 6×3 |
| chores | ChoresWidget | 6×3 |
| events | EventsWidget | 12×3 |
| overdueChores | OverdueChoresWidget | 6×3 |
| grocery | GroceryWidget | 6×3 |
| reminders | RemindersWidget | 6×3 |
| inventory | InventoryWidget | 6×3 |
| mealPlan | MealPlanWidget | 6×3 |

Dashboard config stored in localStorage (`dashboard-config`) and synced to server via `/settings/me`.

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

## 5. Troubleshooting

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

## 6. Development Workflow

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
