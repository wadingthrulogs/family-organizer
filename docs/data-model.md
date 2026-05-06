# Data Model

## Entity Overview
| Entity | Description |
| --- | --- |
| `users` | Household accounts with role, profile info, and authentication credentials. |
| `user_preferences` | Per-user UI preferences: theme, dashboard widget layout & config (JSON), kiosk config (JSON), hidden tabs. |
| `user_secrets` | Encrypted blobs for arbitrary per-user secrets (not used for OAuth tokens — see `google_accounts`). |
| `google_accounts` | Connected Google accounts per user; stores `encrypted_refresh_token` directly. |
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
| `inventory_items` | Pantry/household inventory with quantity tracking, low-stock thresholds, and optional pantry key linking. |
| `recipes` | User-created recipes with ingredients, prep/cook times, and serving size. |
| `meal_plans` | Weekly meal plan containers anchored to a `weekStart` date. |
| `meal_plan_entries` | Individual meal slots within a plan (day + meal type + optional recipe). |
| `commute_routes` | Configured commute destinations with active time-of-day windows and DOW filters. |
| `geocode_cache` | Mapbox geocoder result cache (address → lng/lat) with TTL. |
| `location_geocode_cache` | Negative cache for geocoder lookups that failed (so we don't retry repeatedly). |
| `reminders` | Reminder rules referencing tasks/chores/groceries/events. |
| `reminder_triggers` | Scheduled occurrences for reminders, tracking last attempt and channel. |
| `attachments` | File metadata for items referenced by tasks, groceries, or dashboard backgrounds. |
| `push_subscriptions` | Browser Web Push subscription records per user. |
| `notification_logs` | Delivery history for reminder notifications (push/email/webhook). |
| `household_settings` | Key-value store for household-wide configuration. Encrypted secrets (OAuth secrets, Mapbox token, SMTP password, VAPID keys, OpenWeather API key) are stored AES-encrypted with the `enc:` prefix. |
| `audit_logs` | Append-only log of significant actions for troubleshooting. |
| `search_index` | Optional full-text search index for tasks and grocery items. |

## Relationships
- One `user` ⇨ many `google_accounts`, `linked_calendars`, `tasks` (author), `task_assignments`, `chore_assignments`, `grocery_lists` (owner), `reminders`, `push_subscriptions`, `notification_logs`, `recipes` (author), `meal_plans` (author).
- `google_accounts` ⇨ `linked_calendars` (1-to-many). Each Google account can have multiple linked calendars.
- `tasks` ⇨ `task_assignments` (1-to-many) and optional `task_recurrences` (many tasks can reuse recurrence template).
- `tasks` ⇨ `task_status_changes` (1-to-many) — audit trail of all status transitions.
- `chores` ⇨ `chore_assignments` (1-to-many). Assignments reference `users` for assignee and optionally for verifier.
- `grocery_lists` ⇨ `grocery_items` (1-to-many).
- `recipes` ⇨ `meal_plan_entries` (1-to-many, optional). A recipe can appear in multiple plan entries.
- `meal_plans` ⇨ `meal_plan_entries` (1-to-many). Each plan holds one week of meal slots.
- `reminders` reference polymorphic targets (task, chore, grocery_item, event) using target_type/target_id.
- `reminder_triggers` belong to `reminders` and record channel-specific scheduling.
- `attachments` use a polymorphic `linked_entity_type`/`linked_entity_id` to associate with any entity.
- `notification_logs` belong to `users` and optionally to `reminders` for delivery history.

## Key Fields & Considerations
### Users
- `role`: enum (`ADMIN`, `MEMBER`, `VIEWER`).
- `auth_provider`: `local` or `oauth` (future expansion).
- `pin_hash` optional for kiosk mode; stored separately from password hash.

### Calendar Cache
- `linked_calendars.sync_token` for incremental sync.
- `family_events` stores normalized start/end, timezone, attendees, source calendar, color, and `etag` for change detection.

### Tasks & Recurrence
- `tasks.status`: `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `ARCHIVED`.
- Recurrence stored using RRULE-like columns (frequency, interval, by_day) enabling server-side generation.
- `task_assignments.status` overrides allow personalized progress while keeping global task state.

### Chores
- `chores.rotation_type`: `ROUND_ROBIN`, `WEIGHTED`, `MANUAL`.
- `chore_assignments.state`: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `SNOOZED`, `SKIPPED`.
- `chore_assignments.rotation_order` to reconstruct schedule history.
- `chore_assignments.verified_by_id` optional reference to user who verified completion.

### Grocery Lists
- `grocery_items.state`: `NEEDED`, `CLAIMED`, `IN_CART`, `PURCHASED`.
- `pantry_item_key` optional identifier for tracking pantry stock/low reminders.
- Support `sort_order` for drag/drop reordering by aisle.

### Recipes & Meal Plans
- `recipes.ingredients_json`: JSON array of `{ name, quantity?, unit?, inventoryItemId? }` objects.
- `recipes.servings`: base serving count used to scale ingredient quantities for inventory checks.
- `meal_plans.week_start`: Monday anchor date for the 7-day plan window.
- `meal_plan_entries.day_offset`: 0 (Monday) through 6 (Sunday) — resolved to an absolute date at query time.
- `meal_plan_entries.meal_type`: `BREAKFAST`, `LUNCH`, `DINNER`, or `SNACK`.
- `meal_plan_entries.recipe_id`: optional FK to a recipe; entries can be free-text meals without a recipe.

### Commute Routes
- `commute_routes.travel_mode`: `DRIVE`, `BICYCLE`, `WALK`, `TWO_WHEELER`, `TRANSIT`. Mapped to Mapbox profiles (`driving-traffic`, `cycling`, `walking`).
- `commute_routes.show_start_min` / `show_end_min`: minutes of day (0–1439). The route's ETA only appears in the widget when the current local time falls inside this window.
- `commute_routes.days_of_week`: comma-separated DOW digits (0=Sun … 6=Sat), default `'1,2,3,4,5'` (weekdays).
- `commute_routes.sort_order`: render order in the widget. Lower numbers appear first.

### Geocode Caches
- `geocode_cache`: positive cache. Key = address string. Stores `lng`/`lat`/`place_name`/`relevance` with `expires_at` (default 30-day TTL). Hits avoid hammering Mapbox's geocoder.
- `location_geocode_cache`: negative cache. Records addresses that recently failed to geocode (with a `reason` and `last_attempt_at`) so the system backs off retries until `expires_at`.

### Reminders
- `reminders.channel_mask`: bit flags for push/email/webhook (`PUSH = 1`, `EMAIL = 2`, `WEBHOOK = 4`).
- `quiet_hours_start`/`quiet_hours_end` per reminder or inherit from household settings.
- `reminder_triggers.next_fire_at` recalculated after each send; `last_status` for monitoring.
- Webhook delivery uses the `WEBHOOK_URL` env var (or the value loaded from settings at startup).

### Attachments
- Files stored on disk; DB holds `path`, `content_type`, `checksum`, `owner_user_id`, `linked_entity`.
- Optional antivirus scan result flag.

### Audit Logs
- Fields: actor_user_id, action_type, entity_type/id, diff snapshot, IP/device metadata.
- Used for troubleshooting and accountability.

## Indexing & Performance
- Unique indexes on (`user_id`, `calendar_id`) for `linked_calendars`.
- Composite indexes for `family_events` by time range, calendar, and user for fast calendar queries.
- Partial indexes for open tasks, pending chores, active reminders.
- FTS5 virtual table (optional) for task/grocery text search.

## Data Retention
- Soft delete columns (`deleted_at`) on major tables for undo and auditing.
- Scheduled vacuum/maintenance job to purge stale soft-deleted rows after configurable period.
- Attachments removed when reference count zero; background job cleans orphaned files.
