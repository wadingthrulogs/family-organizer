# API Design

## Conventions
- Base URL: `/api/v1`
- JSON payloads with camelCase keys.
- Standard envelope for errors: `{ "error": { "code": "TASK_NOT_FOUND", "message": "...", "details": {} } }`
- Authentication: session cookie (`express-session` + `connect-sqlite3` store). All state-changing requests require an active session.
- Pagination via `?cursor=<opaque>` or `?page/limit` depending on endpoint; filtering with query params.
- No WebSocket or JWT support — clients use React Query polling for live updates.

## Auth & Users (`/auth`)

### POST /auth/register
- Body: `{ username, email?, password, role? }`
- Response: User (201)
- **Bootstrap-only:** allowed only when no active user exists. Once any non-disabled user is in the database, this endpoint returns `403 REGISTRATION_DISABLED`. Subsequent users must be created by an admin via `POST /auth/users`.
- The first registered user is automatically promoted to `ADMIN` regardless of the `role` field.

### POST /auth/login
- Body: `{ username, password }`
- Response: User + sets HttpOnly session cookie.

### POST /auth/logout
- Clears session.

### GET /auth/me
- Returns current user profile.

### PATCH /auth/me
- Body: `{ email?, timezone?, colorHex? }`

### POST /auth/me/password
- Body: `{ currentPassword, newPassword }`

### GET /auth/users _(ADMIN)_
- List all users.

### POST /auth/users _(ADMIN)_
- Create a new user.

### PATCH /auth/users/:userId/role _(ADMIN)_
- Body: `{ role }`
- Returns `400 SELF_ROLE_CHANGE` if you target your own user.

### POST /auth/users/:userId/reset-password _(ADMIN)_
- Body: `{ newPassword }`

### DELETE /auth/users/:userId _(ADMIN)_
- Soft-deletes user (sets `deletedAt`, disables password login).
- Returns `400 SELF_DELETE` if you target your own user.

## Tasks (`/tasks`)

### GET /tasks
- Query: `?status&cursor&limit=20`
- Response: `{ items, total, nextCursor }`

### POST /tasks
- Body: `{ title, description?, dueAt?, priority?=0, status?="OPEN", labels?, assigneeUserIds?, recurrence? }`

### GET /tasks/:id
- Returns task with assignments.

### PATCH /tasks/:id
- Partial update of task fields.

### DELETE /tasks/:id
- Soft delete (204).

### GET /tasks/:id/history
- Response: `{ taskId, history: TaskStatusChange[] }`

### POST /tasks/cleanup _(ADMIN)_
- Body: `{ dryRun? }`
- Runs the task retention sweep: archives finished tasks older than `taskRetention.archiveDays` and hard-deletes archived tasks older than `taskRetention.hardDeleteDays`. Both thresholds come from household settings.
- Response: `{ data: { archived, hardDeleted, ... } }`

## Chores (`/chores`)

### GET /chores
- Query: `?active&includeAssignments`
- Response: `{ items, total }`

### POST /chores
- Body: `{ title, description?, rotationType?, frequency, interval?=1, eligibleUserIds, weightMap?, rewardPoints?=0, active?=true }`

### GET /chores/:id

### PATCH /chores/:id

### DELETE /chores/:id
- (204)

### PATCH /chores/assignments/:id
- Body: `{ state?, notes? }`
- Valid states: `PENDING | IN_PROGRESS | COMPLETED | SNOOZED | SKIPPED`

### POST /chores/assignments/:id/skip
- Body: `{ reason? }`

### POST /chores/assignments/:id/swap
- Body: `{ targetUserId }`

### POST /chores/:id/generate
- Generate next assignment for this chore.

### POST /chores/generate-all
- Generate all pending assignments.

### GET /chores/:id/streaks
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
- Includes `eventCommutes`: auto-generated leave-by ETAs for the next few calendar events that have a `location`.
- Response: `{ items: Array<{ ok: true, data: CommuteEta } | { ok: false, data: CommuteEtaError }>, total, upcoming, eventCommutes, mapboxToken }`
- The `mapboxToken` is the public token (returned plaintext so the frontend Mapbox GL map can render).

## Grocery Lists (`/grocery`)

### GET /grocery/lists
- Query: `?includeItems&active`

### POST /grocery/lists
- Body: `{ name, store?, presetKey?, isActive? }`

### PATCH /grocery/lists/:id

### DELETE /grocery/lists/:id

### GET /grocery/lists/:id/items

### POST /grocery/lists/:id/items
- Body: `{ name, category?, quantity?, unit?, state?, assigneeUserId?, notes? }`

### POST /grocery/lists/:id/items/bulk
- Body: `{ text }` — natural-language bulk add ("3x bananas, milk").

### POST /grocery/lists/:id/items/from-low-stock
- Adds inventory items below threshold to the list.

### PATCH /grocery/lists/:listId/items/:itemId

### DELETE /grocery/lists/:listId/items/:itemId

## Inventory (`/inventory`)

### GET /inventory
- Query: `?search&category&lowStock`

### GET /inventory/export
- Returns text file download.

### GET /inventory/:id
- Returns a single inventory item by ID.

### POST /inventory
- Body: `{ name, category?, quantity?, unit?, lowStockThreshold?, notes?, dateAdded? }`

### POST /inventory/bulk
- Body: `{ text }` — natural-language bulk add.

### PATCH /inventory/:id

### DELETE /inventory/:id

### POST /inventory/from-grocery
- Body: `{ groceryItemId, groceryListId }`

### POST /inventory/from-grocery-list
- Body: `{ groceryListId }`

## Calendar (`/calendar`)

### GET /calendar/calendars
- List linked Google calendars for the current user.

### GET /calendar/events
- Query: `?start&end&calendarId`
- Returns events in the given date range.

### POST /calendar/events
- Body: `{ linkedCalendarId?, title, startAt, endAt, allDay?, timezone, colorHex?, location? }`

### PATCH /calendar/events/:id

### DELETE /calendar/events/:id
- Soft delete (`deleted: true`).

## Settings (`/settings`)

### GET /settings
- Response includes all household-level settings plus server-configuration flags.
- Plaintext fields: `householdName, timezone, quietHours, hiddenTabs, theme, weatherLocation, weatherUnits, taskRetention, googleClientId, appBaseUrl, smtpHost, smtpPort, smtpUser, smtpFrom, homeAddress`
- Encrypted-at-rest fields are returned as boolean `*Set` flags only — never the plaintext value:
  - `googleClientSecretSet, openweatherApiKeySet, googleMapsApiKeySet, mapboxTokenSet, smtpPassSet, pushVapidPublicKeySet, pushVapidPrivateKeySet`

### PATCH /settings
- Partial update of household settings. All callers may update household-level fields (`householdName`, `timezone`, `quietHours`, `hiddenTabs`, `theme`, `weatherLocation`, `weatherUnits`, `taskRetention`).
- The following fields are **ADMIN-only** and configure server services. Plaintext keys are stored in the clear; encrypted keys are AES-encrypted at rest using `ENCRYPTION_KEY`:
  - Plaintext: `googleClientId, appBaseUrl, smtpHost, smtpPort, smtpUser, smtpFrom, homeAddress`
  - Encrypted: `googleClientSecret, openweatherApiKey, googleMapsApiKey, mapboxToken, smtpPass, pushVapidPublicKey, pushVapidPrivateKey`
- Sending `null` or `''` for any server-config field deletes the stored value.
- SMTP, VAPID, and OpenWeather changes are hot-reloaded into their respective services without a restart. `appBaseUrl` requires a backend restart to fully take effect (CORS, OAuth redirect URL).
- Non-admin callers attempting to set any admin field receive `403 FORBIDDEN`.

### GET /settings/me
- Response: `{ theme, dashboardConfig, kioskConfig, hiddenTabs }` — user preferences.

### PATCH /settings/me
- Body: `{ theme?, dashboardConfig?, kioskConfig?, hiddenTabs? }`
- Update user preferences.

## Reminders (`/reminders`)

### GET /reminders
- Query: `?enabled&targetType`

### POST /reminders
- Body: `{ title, message?, targetType, targetId?, channelMask?, leadTimeMinutes?, enabled? }`

### GET /reminders/:id

### PATCH /reminders/:id

### DELETE /reminders/:id

## Notifications (`/notifications`)

### POST /notifications/subscribe
- Body: `{ endpoint, keys: { p256dh, auth } }`

### DELETE /notifications/subscribe
- Body: `{ endpoint }`

### GET /notifications/subscriptions

### GET /notifications/log

### GET /notifications/log/all _(ADMIN)_

### POST /notifications/trigger/:reminderId
- Manually fire a reminder for testing/diagnostics.

### POST /notifications/process _(ADMIN)_
- Process all pending reminder triggers.

### POST /notifications/digest _(ADMIN)_

### GET /notifications/vapid-public-key
- Public endpoint — returns VAPID public key for push subscription setup.

## Meal Plans (`/meal-plans`)

### GET /meal-plans/recipes
- List all recipes created by the current user.
- Response: `{ items, total }`

### POST /meal-plans/recipes
- Body: `{ title, description?, servings?=1, prepMinutes?, cookMinutes?, sourceUrl?, ingredients?: [{ name, quantity?, unit?, inventoryItemId? }] }`
- Response: Recipe (201)

### GET /meal-plans/recipes/:recipeId

### PATCH /meal-plans/recipes/:recipeId
- Partial update of recipe fields.

### DELETE /meal-plans/recipes/:recipeId
- Hard delete (204).

### POST /meal-plans/recipes/bulk
- Body: `{ text }` — paste one or more recipes as plain text (first line = title, remaining lines = ingredients), or upload a JSON array.
- Parses and creates multiple recipes in one request.
- Response: `{ created: number, recipes: Recipe[] }`

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
- Adds all recipe ingredients from the plan to the specified grocery list (skips duplicates).
- Response: `{ added, skipped, items }`

## Attachments (`/attachments`)

### GET /attachments
- Query: `?linkedEntityType&linkedEntityId`

### POST /attachments
- Multipart form-data: `file`, `linkedEntityType?`, `linkedEntityId?`
- Max 10 MB; validated by magic bytes.

### GET /attachments/:id/download

### DELETE /attachments/:id

## Google Integration (`/integrations/google`)

### GET /integrations/google
- List connected Google accounts with their linked calendars.

### GET /integrations/google/start
- Query: `?login_hint`
- Response: `{ url }` — OAuth authorization URL.

### GET /integrations/google/callback
- OAuth redirect handler; exchanges code, stores encrypted refresh token.

### DELETE /integrations/google/:accountId

### POST /integrations/google/:accountId/sync

### POST /integrations/google/sync-all

## Other

### GET /health
- Response: `{ status: 'ok', timestamp }`

### GET /weather
- Query: `?location&units=imperial`
- Response: current conditions + daily forecast.

### GET /backup/export _(ADMIN)_

### POST /backup/import _(ADMIN)_

## Error Codes (Sample)
- `AUTH_INVALID_CREDENTIALS`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `FORBIDDEN`
- `CONFLICT`
- `CALENDAR_SYNC_FAILED`
- `TASK_ALREADY_COMPLETED`
- `CHORE_ASSIGNMENT_LOCKED`
- `GROCERY_ITEM_CONFLICT`
- `REMINDER_CHANNEL_UNAVAILABLE`
