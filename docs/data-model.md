# Data Model

> Source of truth: `backend/prisma/schema.prisma` (29 models). Table names below are descriptive snake_case; Prisma models use PascalCase (`users` → `User`). SQLite has no native enums — every "enum" column is a `String` validated by Zod in the route layer.

## Entity Overview
| Entity | Description |
| --- | --- |
| `users` | Household accounts with role, profile info, and authentication credentials. |
| `user_preferences` | Per-user UI preferences: theme, dashboard widget layout & config (JSON), kiosk config (JSON), hidden tabs. |
| `user_secrets` | Encrypted blobs for per-user secrets. Effectively unused — only dead legacy helpers in `services/google-calendar.ts` reference it; OAuth tokens live on `google_accounts`. |
| `google_accounts` | Connected Google accounts per user; stores `encrypted_refresh_token` directly, plus `last_synced_at`, `last_sync_error`, `last_sync_error_at`. |
| `linked_calendars` | Mapping of Google calendars to household members, including color and sync metadata. |
| `family_events` | Cached Google events plus locally created events for unified display. |
| `tasks` | User-defined tasks with due dates, recurrence rules, and status. |
| `task_recurrences` | Normalized recurrence definitions shared across tasks. |
| `task_assignments` | Many-to-many bridge between tasks and users with per-assignee state. |
| `task_status_changes` | Append-only audit log of every task status transition (from/to status, changed by, timestamp). |
| `chores` | Chore templates describing frequency, eligible members, rewards, etc. |
| `chore_assignments` | Generated chore instances tied to a date window and specific member. |
| `grocery_lists` | Named lists (Weekly, Costco) with metadata (store, preset). |
| `grocery_items` | Items on a grocery list with quantity, category, claimed status. |
| `inventory_items` | Pantry/household inventory with quantity, unit, category, notes, `date_added`, low-stock threshold, optional unique `pantry_item_key`, and an `is_prepared_meal` flag. |
| `recipes` | Recipes with ingredients (JSON), prep/cook times, and serving size. Optionally mirrors a prepared-meal inventory item via `source_inventory_item_id`. |
| `meal_plans` | Weekly meal plan containers anchored to a `weekStart` date. |
| `meal_plan_entries` | Individual meal slots within a plan (day + meal type + optional recipe). |
| `commute_routes` | Configured commute destinations with active time-of-day windows and DOW filters. |
| `geocode_cache` | Positive Mapbox geocoder cache (address → lng/lat), 30-day TTL. |
| `location_geocode_cache` | Negative cache for calendar-event locations that failed to geocode (24 h back-off). |
| `reminders` | Reminder rules referencing tasks/chores/groceries/events. |
| `reminder_triggers` | Scheduled occurrences for reminders, tracking last attempt and channel. |
| `attachments` | File metadata (path, content type, size, sha256 checksum) linked polymorphically to tasks or other entities, and used for dashboard background photos. |
| `push_subscriptions` | Browser Web Push subscription records per user. |
| `notification_logs` | Delivery history for reminder notifications (push/email/webhook). |
| `household_settings` | Key-value store for household-wide configuration. Encrypted secrets (OAuth secrets, Mapbox token, SMTP password, VAPID keys, OpenWeather API key) are stored AES-encrypted with the `enc:` prefix. |
| `audit_logs` | Append-only log of significant actions for troubleshooting. |
| `search_index` | Plain `(entity_type, entity_id, content)` table reserved for future search. **Not populated or queried by any code today.** |

## Relationships
- One `user` ⇨ many `google_accounts`, `linked_calendars`, `tasks` (author), `task_assignments`, `chore_assignments`, `grocery_lists` (owner), `reminders`, `push_subscriptions`, `notification_logs`, `recipes` (author), `meal_plans` (author).
- `google_accounts` ⇨ `linked_calendars` (1-to-many). Each Google account can have multiple linked calendars.
- `tasks` ⇨ `task_assignments` (1-to-many) and optional `task_recurrences` (many tasks can reuse recurrence template).
- `tasks` ⇨ `task_status_changes` (1-to-many) — audit trail of all status transitions.
- `chores` ⇨ `chore_assignments` (1-to-many). Assignments reference `users` for assignee and optionally for verifier.
- `grocery_lists` ⇨ `grocery_items` (1-to-many).
- `recipes` ⇨ `meal_plan_entries` (1-to-many, optional; deleting a recipe sets the entry's `recipe_id` to null).
- `inventory_items` ⇨ `recipes` (1-to-0..1) via unique `recipes.source_inventory_item_id`, cascade delete. Used by the prepared-meal feature (see below).
- `meal_plans` ⇨ `meal_plan_entries` (1-to-many). Each plan holds one week of meal slots.
- `reminders` reference polymorphic targets (task, chore, grocery_item, event) using target_type/target_id.
- `reminder_triggers` belong to `reminders` and record channel-specific scheduling.
- `attachments` use a polymorphic `linked_entity_type`/`linked_entity_id` to associate with any entity.
- `notification_logs` belong to `users` and optionally to `reminders` for delivery history.

## Key Fields & Considerations
### Users
- `role`: enum (`ADMIN`, `MEMBER`, `VIEWER`).
- `auth_provider`: `local` (only value in use).
- `pin_hash`: column exists but **nothing reads or writes it** — PIN login is not implemented.
- Soft delete: `deleted_at` set by `DELETE /auth/users/:id`; soft-deleted users cannot log in. The seeded `household-admin` user (`services/default-user.ts`) has `password_hash = '!disabled!'`.

### Calendar Cache
- `linked_calendars.sync_token` for incremental sync.
- `family_events` stores normalized start/end, timezone, attendees, source calendar, color, and `etag` for change detection.

### Tasks & Recurrence
- `tasks.status`: `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `ARCHIVED`.
- Recurrence stored using RRULE-like columns (`frequency` DAILY/WEEKLY/BIWEEKLY/MONTHLY/YEARLY, `interval`, `until`). When a recurring task is PATCHed to `DONE`, `services/task-recurrence.ts` creates the next instance. `by_day`, `by_month_day`, and `count` are accepted and stored but **ignored** when computing the next due date.
- `task_assignments.status` overrides allow personalized progress while keeping global task state.

### Chores
- `chores.rotation_type`: `ROUND_ROBIN`, `WEIGHTED`, `MANUAL`.
- `chore_assignments.state`: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `SNOOZED`, `SKIPPED`.
- `chore_assignments.rotation_order` to reconstruct schedule history.
- `chore_assignments.verified_by_id` optional reference to user who verified completion.
- `chores.eligible_user_ids` is a CSV string; `chores.weight_map_json` holds per-user weights for `WEIGHTED` rotation.

### Grocery Lists
- `grocery_items.state`: `NEEDED`, `CLAIMED`, `IN_CART`, `PURCHASED`.
- `pantry_item_key` optional identifier for tracking pantry stock/low reminders.
- Support `sort_order` for drag/drop reordering by aisle.
- `claimed_by_user_id`, `assignee_user_id`, `notes`, and `moved_to_inventory_at` (set when the item is moved into inventory; a second move returns 409 `ALREADY_MOVED`).

### Recipes & Meal Plans
- `recipes.ingredients_json`: JSON array of `{ name, quantity?, unit?, inventoryItemId? }` objects.
- `recipes.servings`: base serving count used to scale ingredient quantities for inventory checks.
- `meal_plans.week_start`: Monday anchor date for the 7-day plan window.
- `meal_plan_entries.day_offset`: 0 (Monday) through 6 (Sunday) — resolved to an absolute date at query time.
- `meal_plan_entries.meal_type`: `BREAKFAST`, `LUNCH`, `DINNER`, or `SNACK`.
- `meal_plan_entries.recipe_id`: optional FK to a recipe; entries can be free-text meals without a recipe.

### Prepared Meals
- Setting `inventory_items.is_prepared_meal = true` (e.g. a frozen lasagna) makes `services/prepared-meal.ts` create or update a single-ingredient `Recipe` whose `source_inventory_item_id` points back at the item, so it can be scheduled in meal plans.
- Clearing the flag deletes that recipe; deleting the inventory item cascades to it.

### Commute Routes
- `commute_routes.dest_address`: free-text destination, geocoded via Mapbox. The origin is the household `homeAddress` setting.
- `commute_routes.travel_mode`: `DRIVE`, `BICYCLE`, `WALK`, `TWO_WHEELER`, `TRANSIT`. Mapped to Mapbox profiles: DRIVE → `driving-traffic`, TWO_WHEELER → `driving`, WALK → `walking`, BICYCLE → `cycling`.
- `commute_routes.show_start_min` / `show_end_min`: minutes of day (0–1439). The route's ETA only appears in the widget when the current local time falls inside this window.
- `commute_routes.days_of_week`: comma-separated DOW digits (0=Sun … 6=Sat), default `'1,2,3,4,5'` (weekdays).
- `commute_routes.sort_order`: render order in the widget. Lower numbers appear first.

### Geocode Caches
- `geocode_cache`: positive cache. Key = address string. Stores `lng`/`lat`/`place_name`/`relevance` with `expires_at` (default 30-day TTL). Hits avoid hammering Mapbox's geocoder.
- `location_geocode_cache`: negative cache used by `services/event-commutes.ts`. Records calendar-event locations that failed to geocode (with a `reason` and `last_attempt_at`) so retries back off until `expires_at` (24 h).

### Reminders
- `reminders.channel_mask`: bit flags for push/email/webhook (`PUSH = 1`, `EMAIL = 2`, `WEBHOOK = 4`).
- `quiet_hours_start`/`quiet_hours_end` per reminder (HH:mm, evaluated in the owner's timezone). Triggers falling inside quiet hours are deferred 30 minutes. The household `quietHours` setting is stored but **not** applied by the notification engine.
- `reminder_triggers.next_fire_at` recalculated after each send; `last_status` for monitoring.
- Webhook delivery uses the `WEBHOOK_URL` env var only — it is not configurable from Settings.

### Attachments
- Files stored on disk under `uploads/` (the `uploads_data` Docker volume); DB holds `file_path`, `content_type`, `byte_size`, sha256 `checksum`, `owner_user_id`, `linked_entity_type/id`.
- `scanned` flag exists but no virus scanning is performed.

### Audit Logs
- Fields: actor_user_id, action_type, entity_type/id, diff snapshot, IP/device metadata.
- Used for troubleshooting and accountability.

## Indexing & Performance
Indexes actually declared in the schema:
- Unique: `users.username`, `users.email`, `user_preferences.user_id`, (`user_id`, `secret_type`) on `user_secrets`, (`user_id`, `email`) on `google_accounts`, (`user_id`, `google_id`) on `linked_calendars`, (`task_id`, `user_id`) on `task_assignments`, `inventory_items.pantry_item_key`, `push_subscriptions.endpoint`, `recipes.source_inventory_item_id`.
- `family_events` (`start_at`, `end_at`) — the only calendar index.
- `task_assignments` (`user_id`, `status`); `task_status_changes` (`task_id`, `created_at`); `chore_assignments` (`state`); `reminder_triggers` (`next_fire_at`); `inventory_items` (`name`); `notification_logs` (`user_id`, `created_at`) and (`status`); `push_subscriptions` (`user_id`); `search_index` (`content`); both geocode caches (`expires_at`).
- There are no partial indexes and no FTS5 tables.
- SQLite runs in WAL mode (`backend/src/lib/prisma.ts`).

## Data Retention
- Soft delete: `deleted_at` on `users` and `tasks`; `family_events.deleted` boolean.
- **Task retention** (`services/task-retention.ts`) is the only retention job. It runs daily at 03:00 (server time) from the notification ticker, or on demand via `POST /tasks/cleanup` (ADMIN, supports `dryRun`):
  - `DONE` tasks older than `taskRetention.archiveDays` (default 30) are soft-deleted (`deleted_at` set — the status is not changed to `ARCHIVED`).
  - Soft-deleted tasks older than `taskRetention.hardDeleteDays` (default 90) are hard-deleted.
  - Orphaned `task_recurrences` are pruned, and a summary is written to `audit_logs`.
- There is no vacuum job and no orphaned-attachment cleanup.
- Expired geocode-cache rows are simply ignored on read.

## Backup Coverage
`GET /backup/export` serializes 14 tables: users, household settings, linked calendars, family events, tasks, task recurrences, task assignments, chores, chore assignments, grocery lists, grocery items, inventory items, reminders, reminder triggers. It does **not** include recipes, meal plans/entries, commute routes, Google accounts, user preferences, task status history, attachments (rows or files), push subscriptions, or notification logs. For a complete database backup use `make backup`, which stops the backend and copies `/data/app.db` out of the container (uploaded attachment files in the `uploads_data` volume are not included).
