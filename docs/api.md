# API Design

## Conventions
- Base URL: `/api/v1`
- JSON payloads with camelCase keys.
- Standard envelope for errors: `{ "error": { "code": "TASK_NOT_FOUND", "message": "...", "details": {} } }`
- Authentication: session cookie (`express-session` + `connect-sqlite3` store, 7-day lifetime). Every endpoint requires an active session **except**: `POST /auth/login`, `POST /auth/register`, `POST /auth/logout`, `GET /notifications/vapid-public-key`, `GET /weather`, `GET /health` (and root `GET /healthz`), and — in non-production only — the `/integrations/google/*` router, which falls back to the first user (or seeds `household-admin`) when no session exists.
- Roles: endpoints marked _(ADMIN)_ require `role = ADMIN`; those marked _(ADMIN, MEMBER)_ reject `VIEWER` (403 otherwise). Everything else is open to any signed-in user, so `VIEWER` can otherwise read and write.
- Pagination: cursor-based on `GET /tasks`; most other lists return everything as `{ items, total }`.
- Rate limits: 200 req/min per IP globally; 15 requests per 15 min on `/auth/login` and `/auth/register` (`429 RATE_LIMITED`).
- **Boolean query flags gotcha:** most boolean query params use `z.coerce.boolean()`, so any non-empty string — including `"false"` — is `true`. Omit the parameter to mean false. Affected: `/chores?active&includeAssignments`, `/grocery/lists?includeItems&active`, `/reminders?enabled`, `/calendar/events?includeDeleted`. (`/inventory?lowStock` correctly checks for `"true"`.)
- No WebSocket or JWT support — clients use React Query refetching for live updates.

## Auth & Users (`/auth`)

### POST /auth/register
- Body: `{ username, email?, password, role? }`
- `username`: 2–40 chars, letters/numbers/spaces/`-`/`_`. `password`: 8–128 chars with upper, lower, digit, and symbol (same rule everywhere a password is set).
- Response: User (201)
- **Bootstrap-only:** allowed only when no active user exists. Once any non-disabled user is in the database, this endpoint returns `403 REGISTRATION_DISABLED`. Subsequent users must be created by an admin via `POST /auth/users`.
- The first registered user is automatically promoted to `ADMIN` regardless of the `role` field.

### POST /auth/login
- Body: `{ username, password }`
- Response: User + sets HttpOnly session cookie. Wrong credentials → `401 INVALID_CREDENTIALS`.

### POST /auth/logout
- Clears session.

### GET /auth/me
- Returns current user profile.

### PATCH /auth/me
- Body: `{ email?, timezone?, colorHex? }`

### POST /auth/me/password
- Body: `{ currentPassword, newPassword }` — `400 WRONG_PASSWORD` if the current password is wrong.

### GET /auth/users _(ADMIN)_
- List all users.

### POST /auth/users _(ADMIN)_
- Body: `{ username, email?, password, role? }` — `409 USERNAME_TAKEN` / `409 EMAIL_TAKEN`.

### PATCH /auth/users/:userId/role _(ADMIN)_
- Body: `{ role }`
- Returns `400 SELF_ROLE_CHANGE` if you target your own user.

### POST /auth/users/:userId/reset-password _(ADMIN)_
- Body: `{ newPassword }`

### DELETE /auth/users/:userId _(ADMIN)_
- Soft-deletes user (sets `deletedAt`; soft-deleted users cannot log in). Response: 200 `{ message }`.
- Returns `400 SELF_DELETE` if you target your own user.

### POST /auth/me/pin
- Body: `{ currentPassword, pin: string | null }` — set, change, or clear (`null`) your display PIN (used to leave guest mode). Returns the updated user.
- `403 WRONG_PASSWORD` if `currentPassword` is wrong.

### POST /auth/me/pin/verify
- Body: `{ pin }` → `{ ok: true, pinSet }`. If no PIN is set, returns `{ ok: true, pinSet: false }`.
- `403 WRONG_PIN` on mismatch.

## Tasks (`/tasks`)

### GET /tasks
- Query: `?status&cursor&limit` (`limit` 1–100, default 20; `cursor` is the last task id seen)
- Response: `{ items, total, nextCursor }`

### POST /tasks
- Body: `{ title, description?, dueAt?, priority?=0, status?="OPEN", labels?, assigneeUserIds?, recurrence? }`
- `priority` 0–5; `labels` is a free-text string (≤500 chars); `dueAt` ISO datetime.
- `recurrence`: `{ frequency: DAILY|WEEKLY|BIWEEKLY|MONTHLY|YEARLY, interval?=1, until?, byDay?, byMonthDay?, count? }`. Only `frequency`, `interval`, and `until` affect scheduling; `byDay`, `byMonthDay`, and `count` are stored but ignored.

### GET /tasks/:taskId
- Returns task with assignments.

### PATCH /tasks/:taskId
- Partial update of task fields. Status changes are recorded in `TaskStatusChange`.
- Setting `status: "DONE"` on a recurring task creates the next instance with the next due date.

### DELETE /tasks/:taskId
- Soft delete (204).

### GET /tasks/:taskId/history
- Response: `{ taskId, history: TaskStatusChange[] }`

### POST /tasks/cleanup _(ADMIN)_
- Body: `{ dryRun? }`
- Runs the task retention sweep immediately (it also runs daily at 03:00): soft-deletes `DONE` tasks older than `taskRetention.archiveDays` (default 30) and hard-deletes soft-deleted tasks older than `taskRetention.hardDeleteDays` (default 90), then prunes orphaned recurrences. "Archive" means `deletedAt` is set — the status is not changed to `ARCHIVED`. Thresholds come from household settings.
- `dryRun: true` reports counts without changing anything.
- Response: `{ data: { archived, hardDeleted, orphanRecurrencesDeleted, thresholds, dryRun } }`; failure → `500 RETENTION_FAILED`.

## Chores (`/chores`)

### GET /chores
- Query: `?active&includeAssignments` (see boolean gotcha above)
- Response: `{ items, total }`

### POST /chores
- Body: `{ title, description?, rotationType?, frequency, interval?=1, eligibleUserIds, weightMap?, rewardPoints?=0, active?=true }`

- `rotationType`: `ROUND_ROBIN | WEIGHTED | MANUAL`; `frequency`: `DAILY | WEEKLY | BIWEEKLY | MONTHLY | YEARLY`; `weightMap` is `{ [userId]: weight }` for `WEIGHTED`.

### GET /chores/:choreId

### PATCH /chores/:choreId

### DELETE /chores/:choreId
- (204)

### PATCH /chores/assignments/:assignmentId
- Body: `{ state?, notes? }`
- Valid states: `PENDING | IN_PROGRESS | COMPLETED | SNOOZED | SKIPPED`

### POST /chores/assignments/:assignmentId/skip
- Body: `{ reason? }` — `400 INVALID_STATE` if the assignment is already completed/skipped.

### POST /chores/assignments/:assignmentId/swap
- Body: `{ targetUserId }` — `400 USER_NOT_ELIGIBLE` if the target isn't in `eligibleUserIds`; `400 INVALID_STATE` if already completed/skipped.

### POST /chores/:choreId/generate
- Generate the next assignment for this chore. `422 GENERATION_SKIPPED` if nothing was generated (manual or inactive chore, or an open assignment already exists).

### POST /chores/generate-all
- Generate the next assignment for every active chore. Response: `{ generated }`.
- The next assignment is also generated automatically when a non-manual chore is created and whenever an assignment is completed or skipped; there is no time-based generation.

### GET /chores/:choreId/streaks
- Response: `{ choreId, streaks: [{ userId, username, currentStreak, longestStreak, totalCompleted }] }`

## Commute (`/commute`)

Mapbox-backed commute ETAs. All routes require an active session. Most endpoints also require `homeAddress` and `mapboxToken` to be configured under household settings; missing config returns `400 HOME_ADDRESS_NOT_SET` or `400 MAPBOX_TOKEN_NOT_SET`.

### GET /commute/routes
- Lists all configured commute routes ordered by `sortOrder`, then `name`.
- Response: `{ items: CommuteRoute[], total }`

### POST /commute/routes
- Body: `{ name, destAddress, travelMode?='DRIVE', showStartMin, showEndMin, daysOfWeek?='1,2,3,4,5', sortOrder?=0, active?=true }`
- `travelMode`: `DRIVE | BICYCLE | WALK | TWO_WHEELER | TRANSIT`
- `showStartMin` / `showEndMin`: minutes-of-day window (0–1439). End must be greater than start.
- `daysOfWeek`: comma-separated DOW digits, where 0=Sunday … 6=Saturday.
- Response: CommuteRoute (201)

### PATCH /commute/routes/:routeId
- Partial update of any of the create-fields above.
- Returns `404 ROUTE_NOT_FOUND` if the route does not exist.

### DELETE /commute/routes/:routeId
- Hard delete (204).

### GET /commute/routes/:routeId/eta
- Fetches a fresh ETA for a single route (admin/debug). Widget consumers use `/etas/active` instead.
- Response: `{ routeId, name, destAddress, travelMode, homeAddress, durationMinutes, staticDurationMinutes, delayMinutes, distanceMeters, distanceMiles, polyline, congestion[], fetchedAt, ... }`

### GET /commute/etas/active
- Returns ETAs for every active route whose current time-of-day window contains "now". Failed lookups are returned with an `error` payload alongside the route metadata so the widget can render a partial result.
- If no route is active right now, `upcoming` describes the next route to fire (today later or in N days).
- Includes `eventCommutes`: auto-generated leave-by ETAs for calendar events with a `location` starting within the next 90 minutes. Locations that fail to geocode are skipped for 24 h.
- Response: `{ items: Array<{ ok: true, data: CommuteEta } | { ok: false, data: CommuteEtaError }>, total, upcoming, eventCommutes, mapboxToken }`
- The `mapboxToken` is the public token (returned plaintext so the frontend Mapbox GL map can render).

## Grocery Lists (`/grocery`)

### GET /grocery/lists
- Query: `?includeItems&active` (see boolean gotcha above)

### POST /grocery/lists
- Body: `{ name, store?, presetKey?, isActive?=true }`

### PATCH /grocery/lists/:listId

### DELETE /grocery/lists/:listId

### GET /grocery/lists/:listId/items

### POST /grocery/lists/:listId/items
- Body: `{ name, category?, quantity?=1, unit?, state?="NEEDED", assigneeUserId?, claimedByUserId?, pantryItemKey?, sortOrder?, notes? }`
- `quantity` 0.1–999; `state`: `NEEDED | CLAIMED | IN_CART | PURCHASED`.

### POST /grocery/lists/:listId/items/bulk
- Body: `{ text }` — natural-language bulk add ("3x bananas, milk").

### POST /grocery/lists/:listId/items/from-low-stock
- Adds inventory items at or below their `lowStockThreshold` to the list.

### PATCH /grocery/lists/:listId/items/:itemId

### DELETE /grocery/lists/:listId/items/:itemId

## Inventory (`/inventory`)

### GET /inventory
- Query: `?search&category&lowStock=true&drinkFridge=true` (`drinkFridge=true` returns items tagged for the guest display's drink-fridge board)

### GET /inventory/export
- Returns a plain-text file download of the inventory.

### GET /inventory/:itemId
- Returns a single inventory item by ID.

### POST /inventory
- Body: `{ name, category?, quantity?=1, unit?, pantryItemKey?, lowStockThreshold?, notes?, isPreparedMeal?, isDrinkFridge?, dateAdded? }`
- `isPreparedMeal: true` also creates a linked single-ingredient Recipe (so the dish can be scheduled in meal plans).

### POST /inventory/bulk
- Body: `{ text }` — natural-language bulk add.

### POST /inventory/bulk-items
- Body: `{ items: [{ name, quantity?, unit?, category? }] }` (1–200 items) — structured bulk add, used after recipe-photo extraction.
- Response: `{ items, total }` (201)

### POST /inventory/extract-from-image
- Multipart form-data: `image` (JPG/PNG/WebP, max 10 MB, validated by magic bytes).
- Hands the photo to the host-side `tools/recipe-image-watcher` via `RECIPE_EXTRACT_UPLOAD_DIR` / `RECIPE_EXTRACT_OUTPUT_DIR` and waits up to `RECIPE_EXTRACT_TIMEOUT_MS` (default 75 s) for the result. Nothing is saved to inventory — the client reviews the rows and calls `/bulk-items`.
- Response: `{ title, items: [{ name, quantity, unit, category }] }`
- Errors: `501 EXTRACTION_NOT_CONFIGURED` (directories not set), `415 INVALID_IMAGE` (missing or non-image file), `422 EXTRACTION_PARSE_FAILED`, `504 EXTRACTION_TIMEOUT`.

### PATCH /inventory/:itemId
- Partial update. Toggling `isPreparedMeal` creates/updates or deletes the linked Recipe.

### DELETE /inventory/:itemId

### POST /inventory/from-grocery
- Body: `{ groceryItemId, groceryListId }` — moves one grocery item into inventory (upserts by `pantryItemKey`, else by name). `409 ALREADY_MOVED` if already moved.

### POST /inventory/from-grocery-list
- Body: `{ groceryListId }` — moves all purchased items. Response: `{ moved, items }`

## Calendar (`/calendar`)

### GET /calendar/calendars
- List all linked Google calendars in the household (every user's), not just the caller's.

### GET /calendar/events
- Query: `?start&end&calendarId&includeDeleted` — `start` and `end` are required ISO datetimes.
- Returns events overlapping the given range.

### POST /calendar/events
- Body: `{ linkedCalendarId?, title, description?, startAt, endAt, allDay?, timezone, colorHex?, location?, visibility?, attendees?: [{ name?, email?, responseStatus? }], source?="LOCAL", sourceEventId? }`
- Local events are stored in the app only; they are not pushed to Google (sync is read-only).

### PATCH /calendar/events/:eventId

### DELETE /calendar/events/:eventId
- Soft delete (`deleted: true`).

## Settings (`/settings`)

### GET /settings
- Response includes all household-level settings plus server-configuration flags.
- Plaintext fields: `householdName, timezone, quietHours, hiddenTabs, theme, weatherLocation, weatherUnits, taskRetention, googleClientId, appBaseUrl, smtpHost, smtpPort, smtpUser, smtpFrom, homeAddress`
- Encrypted-at-rest fields are returned as boolean `*Set` flags only — never the plaintext value:
  - `googleClientSecretSet, openweatherApiKeySet, googleMapsApiKeySet, mapboxTokenSet, smtpPassSet, pushVapidPublicKeySet, pushVapidPrivateKeySet`

### PATCH /settings
- Partial update of household settings. Any signed-in user may update household-level fields (`householdName`, `timezone`, `quietHours`, `hiddenTabs`, `theme`, `weatherLocation`, `weatherUnits`, `taskRetention`) and `homeAddress` (the commute origin — note it is **not** admin-restricted).
- The following fields are **ADMIN-only** and configure server services. Plaintext keys are stored in the clear; encrypted keys are AES-256-GCM encrypted at rest using `ENCRYPTION_KEY`:
  - Plaintext: `googleClientId, appBaseUrl, smtpHost, smtpPort, smtpUser, smtpFrom`
  - Encrypted: `googleClientSecret, openweatherApiKey, googleMapsApiKey, mapboxToken, smtpPass, pushVapidPublicKey, pushVapidPrivateKey`
- Sending `null` or `''` for any server-config field deletes the stored value.
- SMTP, VAPID, and OpenWeather changes are hot-reloaded without a restart; Google client id/secret and the Mapbox token are read on every use. `appBaseUrl` is applied to CORS after a backend restart, but it does **not** change the Google OAuth redirect URL (that comes from `GOOGLE_REDIRECT_URL` / `APP_BASE_URL` in the environment).
- `googleMapsApiKey` is stored but not used by any feature.
- `quietHours` is stored but not applied by the notification engine (only per-reminder quiet hours are).
- Non-admin callers attempting to set any admin field receive `403 FORBIDDEN`.

### GET /settings/me
- Response: `{ theme, seasonalTheme, dashboardConfig, kioskConfig, guestConfig, hiddenTabs }` — user preferences.

### PATCH /settings/me
- Body: `{ theme?, seasonalTheme?, dashboardConfig?, kioskConfig?, guestConfig?, hiddenTabs? }`
- `seasonalTheme: true` auto-switches to the holiday theme by date. `guestConfig` is the guest-display layout.

### GET /settings/me/layouts
- Response: `{ items: LayoutSnapshot[] }` — your saved named layouts.

### POST /settings/me/layouts
- Body: `{ name (1–60), mode: 'dashboard'|'kiosk'|'guest', config: { slots: [...] } }` → 201 `{ items, saved }`.
- Up to 20 per mode (`409 SNAPSHOT_LIMIT_REACHED`); config ≤ 128 KB (`413 SNAPSHOT_TOO_LARGE`).

### DELETE /settings/me/layouts/:snapshotId
- Removes a saved layout. `404 SNAPSHOT_NOT_FOUND`.

### GET /settings/display
- Response: `{ mode: 'dashboard'|'kiosk'|'guest', requestedAt }` — what the wall display should show. The display polls this.

### PATCH /settings/display _(ADMIN, MEMBER)_
- Body: `{ mode: 'dashboard'|'kiosk'|'guest' }` — switch the wall display (e.g. to guest mode when visitors arrive).

## Guest Display (`/guest`)

Household-wide content for the guest wall display (no household data). Stored as JSON in `HouseholdSetting` (`guest_wifi`, `guest_books`); the Wi-Fi password is encrypted at rest but returned to clients so the display can render a QR code.

### GET /guest/content
- Response: `{ wifi: { ssid, security: 'WPA'|'WEP'|'nopass', password, hidden } | null, books: Book[] }`

### PATCH /guest/content _(ADMIN, MEMBER)_
- Body (strict): `{ wifi?: {...} | null, books?: Book[] (≤ 50) }`. Book: `{ id?, title, author?, reader?, progress? (0–100), coverAttachmentId?, synopsis?, year?, finishedAt? }`.
- New books are queued for lookup (cover, author, synopsis) by the host watcher; only the 12 most recently finished books are kept.

### POST /guest/books/:bookId/lookup _(ADMIN, MEMBER)_
- Re-run the lookup for one book. `503 LOOKUP_NOT_CONFIGURED` if the watcher dirs aren't set; `404 BOOK_NOT_FOUND`.
- Covers are stored as Attachments with `linkedEntityType = 'guestBook'` and can be downloaded by any signed-in user.

## Reminders (`/reminders`)

### GET /reminders
- Query: `?enabled&targetType` (see boolean gotcha above)

### POST /reminders
- Body: `{ title, message?, targetType, targetId?, channelMask?=1, leadTimeMinutes?, quietHoursStart?, quietHoursEnd?, enabled?=true }`
- `channelMask` bit flags: `1` push, `2` email, `4` webhook. `leadTimeMinutes` 0–1440. Quiet hours are `HH:mm` in the owner's timezone; triggers inside the window are deferred 30 minutes.

### GET /reminders/:reminderId

### PATCH /reminders/:reminderId

### DELETE /reminders/:reminderId

## Notifications (`/notifications`)

### POST /notifications/subscribe
- Body: `{ endpoint, keys: { p256dh, auth } }`

### DELETE /notifications/subscribe
- Body: `{ endpoint }`

### GET /notifications/subscriptions

### GET /notifications/log
- Caller's delivery history. Query: `?limit` (default 50, max 200).

### GET /notifications/log/all _(ADMIN)_
- Household-wide history. Query: `?limit` (default 100, max 500).

### POST /notifications/trigger/:reminderId
- Manually fire a reminder for testing/diagnostics.

### POST /notifications/process _(ADMIN)_
- Generates triggers, processes due ones, and runs escalations immediately. The in-process ticker already does this every minute, so this is for diagnostics only — no cron is needed.

### POST /notifications/digest _(ADMIN)_
- Sends the daily digest now (normally sent automatically once a day after 08:00 server time).

### GET /notifications/vapid-public-key
- Public endpoint — returns `{ publicKey }` for push subscription setup.

## Meal Plans (`/meal-plans`)

### GET /meal-plans/recipes
- List all household recipes (household-wide; `createdByUserId` is kept for attribution only). Single-recipe GET/PATCH/DELETE do not check ownership.
- Response: `{ items, total }`

### POST /meal-plans/recipes
- Body: `{ title, description?, instructions?, servings?=1, prepMinutes?, cookMinutes?, sourceUrl?, ingredients?: [{ name, quantity?, unit?, inventoryItemId? }] }` (`instructions` ≤ 10 000 chars)
- Response: Recipe (201)

### GET /meal-plans/recipes/:recipeId

### PATCH /meal-plans/recipes/:recipeId
- Partial update of recipe fields.

### DELETE /meal-plans/recipes/:recipeId
- Hard delete (204).

### POST /meal-plans/recipes/bulk
- Body: `{ text }` — one or more recipes as plain text, separated by blank lines (first line of each block = title, remaining lines = ingredients).
- The server accepts text only. The UI's "Upload JSON" option parses the JSON file in the browser and converts it to this text format before sending.
- Response: `{ items: Recipe[], total }` (201)

### GET /meal-plans/recipes/:recipeId/inventory-check
- Query: `?servings` (default: recipe's default servings)
- Checks each ingredient against inventory quantities.
- Response: `{ canMake, servings, ingredients: [{ name, required?, unit?, inStock?, status: 'ok'|'low'|'missing'|'unlinked', inventoryItemId?, inventoryName? }] }`

### POST /meal-plans/recipes/:recipeId/add-missing-to-grocery
- Body: `{ groceryListId, servings? }`
- Adds only low/missing ingredients to the specified grocery list (skips duplicates).
- Response: `{ added, skipped, items }`

### GET /meal-plans/entries-by-range
- Query: `?start=YYYY-MM-DD&end=YYYY-MM-DD`
- Returns entries (with resolved dates) that fall in the given date window.
- Response: `{ items: [{ id, title, mealType, actualDate, servings, notes, recipeId, mealPlanId }] }`

### GET /meal-plans
- List all meal plans (most recent first, up to 20), including entries.
- Response: `{ items, total }`

### POST /meal-plans
- Body: `{ weekStart, title? }`
- Response: MealPlan with entries (201)

### GET /meal-plans/:planId

### PATCH /meal-plans/:planId
- Body: `{ title? }`

### DELETE /meal-plans/:planId
- Hard delete (204).

### POST /meal-plans/:planId/entries
- Body: `{ title, mealType: 'BREAKFAST'|'LUNCH'|'DINNER'|'SNACK', dayOffset: 0–6, servings?=1, recipeId?, notes? }`
- Response: Entry (201)

### PATCH /meal-plans/:planId/entries/:entryId
- Partial update of entry fields.

### DELETE /meal-plans/:planId/entries/:entryId
- Hard delete (204).

### POST /meal-plans/:planId/send-to-grocery
- Body: `{ groceryListId }`
- Adds all recipe ingredients from the plan to the specified grocery list (skips duplicates). `400 NO_INGREDIENTS` if the plan has no recipe ingredients.
- Response: `{ added, skipped, items }`

## Attachments (`/attachments`)

### GET /attachments
- Query: `?linkedEntityType&linkedEntityId`

### POST /attachments
- Multipart form-data: `file`, `linkedEntityType?`, `linkedEntityId?`
- Max 10 MB; validated by magic bytes.

- Stored under `uploads/` (the `uploads_data` volume) with a sha256 checksum.

### GET /attachments/:id/download

### DELETE /attachments/:id
- Owner or ADMIN only.

## Google Integration (`/integrations/google`)

None of these endpoints are admin-only. Google client id/secret come from Settings → Server Configuration or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (`400 GOOGLE_NOT_CONFIGURED` if neither). Scopes: `calendar.readonly` + `userinfo.email`. Sync endpoints return `409 SYNC_BUSY` if a sync is already running.

### GET /integrations/google
- List connected Google accounts with their linked calendars and last sync error, if any.

### GET /integrations/google/start
- Query: `?login_hint`
- Response: `{ url }` — OAuth authorization URL.

### GET /integrations/google/callback
- OAuth redirect handler; exchanges code, stores encrypted refresh token, then redirects to `/settings?google=connected` (or `?google=error&reason=…`).

### DELETE /integrations/google/:accountId
- Disconnects the account; its linked calendars are removed and their events marked deleted.

### POST /integrations/google/:accountId/sync
- Incremental sync of that account's calendars.

### POST /integrations/google/:accountId/full-sync
- Clears the account's sync tokens and re-fetches everything (the "Force re-sync" button). Use when events are missing or stale.

### POST /integrations/google/sync-all
- Incremental sync of every connected account.

## Other

### GET /health
- Public. Response: `{ status: 'ok', timestamp }`. A root-level `GET /healthz` (outside `/api/v1`) returns `{ status: 'ok' }`.

### GET /weather
- Public (no session). Query: `?location` (required) `&units=imperial|metric` (default imperial).
- Response: current conditions + daily forecast; cached in memory for 5 minutes per location/units.
- `501 WEATHER_NOT_CONFIGURED` if no OpenWeather API key is set.

### GET /backup/export _(ADMIN)_
- JSON export of 14 tables (users, settings, calendars, events, tasks + recurrences + assignments, chores + assignments, grocery lists + items, inventory, reminders + triggers). Recipes, meal plans, commute routes, Google accounts, preferences, and attachments are **not** included — use `make backup` for a full database copy.

### POST /backup/import _(ADMIN)_
- Body: `{ data }` — the object produced by `/backup/export`.

## Error Codes
Codes actually returned by the backend, grouped by area:

| Area | Codes |
|------|-------|
| General | `VALIDATION_ERROR` (400, Zod details in `details`), `BAD_REQUEST`, `NO_UPDATES`, `UNAUTHORIZED` (401), `SESSION_INVALID`, `FORBIDDEN` (403), `NOT_FOUND`, `RATE_LIMITED` (429), `INTERNAL_SERVER_ERROR` / `INTERNAL_ERROR` (500) |
| Auth & users | `INVALID_CREDENTIALS`, `REGISTRATION_DISABLED`, `USERNAME_TAKEN`, `EMAIL_TAKEN`, `WRONG_PASSWORD`, `SELF_ROLE_CHANGE`, `SELF_DELETE`, `USER_NOT_FOUND`, `LOGOUT_FAILED` |
| Not found | `TASK_NOT_FOUND`, `CHORE_NOT_FOUND`, `ASSIGNMENT_NOT_FOUND`, `LIST_NOT_FOUND`, `ITEM_NOT_FOUND`, `GROCERY_ITEM_NOT_FOUND`, `RECIPE_NOT_FOUND`, `PLAN_NOT_FOUND`, `ENTRY_NOT_FOUND`, `EVENT_NOT_FOUND`, `REMINDER_NOT_FOUND`, `ROUTE_NOT_FOUND`, `ATTACHMENT_NOT_FOUND`, `FILE_MISSING` |
| Tasks & chores | `RETENTION_FAILED`, `GENERATION_SKIPPED` (422), `INVALID_STATE`, `USER_NOT_ELIGIBLE` |
| Grocery, inventory, meals | `ALREADY_MOVED` (409), `NO_ITEMS`, `NO_INGREDIENTS`, `NO_FILE`, `INVALID_IMAGE`, `INVALID_FILE_TYPE`, `INVALID_PAYLOAD`, `INVALID_PATH`, `EXTRACTION_NOT_CONFIGURED` (501), `EXTRACTION_PARSE_FAILED` (422), `EXTRACTION_TIMEOUT` (504) |
| Calendar & Google | `GOOGLE_NOT_CONFIGURED`, `SYNC_BUSY` (409), `SYNC_FAILED`, `TOKEN_DECRYPT_FAILED`, `INVALID_QUERY` |
| Commute | `HOME_ADDRESS_NOT_SET`, `MAPBOX_TOKEN_NOT_SET`, `INVALID_WINDOW`, `GEOCODING_FAILED`, `LOCATION_NOT_FOUND` |
| Weather | `WEATHER_NOT_CONFIGURED` (501), `INVALID_API_KEY`, `WEATHER_API_FAILED`, `FORECAST_API_FAILED` |
