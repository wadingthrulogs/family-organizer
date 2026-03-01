# API Design

## Conventions
- Base URL: `/api/v1`
- JSON payloads with camelCase keys.
- Standard envelope for errors: `{ "error": { "code": "TASK_NOT_FOUND", "message": "...", "details": {} } }`
- Authentication: session cookie + CSRF token for browser calls; JWT bearer for WebSocket upgrades or headless clients.
- Pagination via `?cursor=<opaque>` or `?page/limit` depending on endpoint; filtering with query params.
- WebSocket endpoint: `/ws` with subprotocol `org.family+json`.

## Auth & Users
### POST /auth/login
- Body: `{ username, password }`
- Response: `{ user, session }`
- Sets HttpOnly cookie `fo_session`.

### POST /auth/pin
- Body: `{ username, pin }`
- Response: same as login; limited to kiosk-approved devices.

### POST /auth/logout
- Clears session cookie.

### GET /me
- Returns current user profile, roles, feature toggles, linked calendars summary.

### POST /users
- Admin only; create member/viewer.

### PATCH /users/:id
- Update profile, role, color, timezone.

## Google Calendar Linking
### GET /google/authorize
- Returns OAuth URL and state token.

### POST /google/callback
- Exchanges auth code; stores refresh token encrypted; returns linked calendars list.

### GET /calendars
- List linked calendars for current user; include sync status.

### POST /calendars/:id/sync
- Triggers manual sync (admin/member for their own calendars).

## Calendar & Events
### GET /calendar/events
- Query params: `start`, `end`, `members[]`, `sources[]`.
- Returns combined events/tasks/chores flagged by type.

### POST /calendar/events
- Create local-only event; optional push to Google if write access ever enabled.

## Tasks
### GET /tasks
- Filters: `status`, `assignee`, `label`, `dueBefore`, `dueAfter`.

### POST /tasks
- Body: `{ title, description, dueAt, priority, recurrence, assignments[] }`

### PATCH /tasks/:id
- Update core fields; handles optimistic concurrency with `updatedAt`.

### POST /tasks/:id/assignments
- Add user to task with optional role (owner/support).

### PATCH /tasks/:id/assignments/:assignmentId
- Update assignment status, notes, completion timestamp.

### POST /tasks/:id/attachments
- Multipart upload; links to attachments table.

## Chores
### GET /chores
- Returns templates and upcoming assignments (expand flag).

### POST /chores
- Create template with rotation config.

### PATCH /chores/:id
- Update details, toggle active state.

### POST /chores/:id/generate
- Force rotation run for given window.

### PATCH /chore-assignments/:id
- Update state (done, skipped, snoozed) and notes.

## Grocery Lists
### GET /grocery/lists
- Include item counts and active flag.

### POST /grocery/lists
- Create new list (store, preset, owner).

### PATCH /grocery/lists/:id
- Rename, toggle active, change preset.

### GET /grocery/lists/:id/items
- Optional `?state=NEEDED` filter.

### POST /grocery/lists/:id/items
- Add item(s); supports array bulk payload.

### PATCH /grocery/items/:id
- Update quantity, state, assignee, notes, sort order.

### POST /grocery/items/bulk
- Operations: `markInCart`, `markPurchased`, `reset`.

## Reminders
### GET /reminders
- List by owner or target.

### POST /reminders
- Body: `{ targetType, targetId, title, message, channels, leadTimeMinutes, quietHours }`

### PATCH /reminders/:id
- Update schedule/channel; enable/disable.

### POST /reminders/:id/test
- Trigger immediate send for diagnostics.

## Settings & Administration
### GET /settings
- Household config (timezone, theme, quiet hours, feature flags).

### PATCH /settings
- Admin updates to config.

### GET /status
- Health data (last calendar sync, reminder queue, DB size).

### POST /backup/export
- Admin-only: returns signed URL or binary stream of DB dump + attachments archive.

## WebSocket Events
- `task.updated`: `{ taskId, changes, assignmentStates }`
- `chore.assignment`: `{ assignmentId, state, windowStart, userId }`
- `grocery.item`: `{ itemId, state, listId, actor }`
- `calendar.refresh`: instructs clients to refetch events for window.
- `reminder.sent`: confirmation with status for UI badge.

Clients authenticate WebSocket using session token exchanged for JWT via `/auth/ws-token`.

## Background Jobs
- `/jobs/calendar-sync` (internal) triggered via message queue or cron; logs accessible via admin UI.
- `/jobs/reminder-dispatch` similarly instrumented for observability.

## Error Codes (Sample)
- `AUTH_INVALID_CREDENTIALS`
- `CALENDAR_SYNC_FAILED`
- `TASK_ALREADY_COMPLETED`
- `CHORE_ASSIGNMENT_LOCKED`
- `GROCERY_ITEM_CONFLICT`
- `REMINDER_CHANNEL_UNAVAILABLE`
