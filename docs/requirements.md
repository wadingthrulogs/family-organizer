# Family Organizer Requirements

> Original product requirements, annotated to show what `main` actually implements. **(not implemented)** marks requirements that have not been built; *Implemented as:* notes describe where the build differs from the original intent.

## Project Summary
A privacy-first, self-hosted web application that lets one household share calendars, tasks, chores, grocery lists, pantry inventory, meal plans, commute ETAs, and reminders, with all data stored on a local node (typically a Raspberry Pi 5). It is intended for the LAN or a private tailnet (Tailscale); outbound calls are limited to the optional integrations the household configures (Google Calendar, Mapbox, OpenWeatherMap, SMTP, Web Push, webhook).

## Goals
- Provide a unified family calendar and task board that syncs with each member's Google Calendars.
- Centralize grocery planning, chore assignments, and reminders in a responsive web UI.
- Keep all custom data (users, tasks, chores, groceries, reminders) on local hardware with simple backups.
- Offer role-based security so admins control OAuth credentials, deployments, and household settings.
- Provide an always-on wall display (kiosk) with a configurable widget layout.

## Users & Personas
1. **Parent Admin**: sets up the server, manages Google integrations, oversees chores/grocery lists, configures reminders.
2. **Teen/Adult Member**: links personal calendars, checks assignments, marks tasks/chores complete, edits grocery items.
3. **Child/Guest Member**: intended read-mostly access to schedule plus lightweight chore/task updates from shared devices. *Implemented as:* the `VIEWER` role, which has the same permissions as `MEMBER` except it can't edit guest-display content or switch the wall display.

## Functional Requirements
### Authentication & Roles
- Local account system with username + password (8–128 chars, mixed case, digit, symbol). The first account is created via bootstrap registration and becomes Admin; later accounts are created by an Admin.
- PIN shortcut for shared tablets **(not implemented)** — a `pinHash` column exists but is unused.
- Roles: Admin, Member, Viewer. Admins manage users, server configuration, backups, and admin diagnostics. *Implemented as:* Admin checks are enforced; Viewer is blocked only from guest-display edits and display switching, so it is not read-only today.
- Session handling via HttpOnly cookies (7-day lifetime, `secure` when served over HTTPS). Configurable idle timeout and device trust **(not implemented)**.

### Google Calendar Integration
- OAuth2 linking per user, supporting multiple calendars per Google account.
- Read-only sync (`calendar.readonly` scope); writeback **(not implemented)**. Local events can be created in the app but are not pushed to Google.
- Unified calendar visualization with color coding by person/calendar.
- Manual refresh, "force re-sync" (full re-fetch), and a background sync every 30 minutes with incremental sync tokens plus a daily drift-correcting full sync.

### Tasks & To-Dos
- CRUD for tasks with title, description, due date, priority, labels, recurrence, and file attachments. Assignment to one or multiple members.
- Tasks are open or done in the UI; status history tracked internally. Completing a recurring task creates the next occurrence (daily/weekly/biweekly/monthly/yearly with interval and end date).
- Overdue task assignments escalate to admins via notifications.
- Retention: done tasks are hidden after 30 days and purged after 90 (configurable in Settings).
- View: grouped todo list (Overdue / Today / Upcoming / No Due Date) with quick-add bar and filter tabs (All / Active / Done / Mine).

### Chores & Household Rotations
- Chore templates with frequency (daily/weekly/biweekly/monthly/yearly + interval), reward points, and eligible members. Estimated effort **(not implemented)**.
- Rotation engine (round-robin, weighted, or manual). The next assignment is generated when a chore is created and when the current one is completed or skipped.
- Ability to skip, swap, or snooze chores while logging completion streaks.
- Dashboard highlights overdue or skipped chores.

### Grocery Lists
- Multiple named lists (e.g., Weekly, Costco, Party) with categories, quantity units, notes, and assignee/claimer.
- Bulk add via natural-language parser ("3x bananas, milk") and one-click "add low-stock inventory items".
- Mobile-friendly shopping mode with "need" / "in cart" / "purchased" states; other devices pick up changes on their next refetch (no push-based live sync).
- Purchased items can be moved into inventory.

### Pantry Inventory
- Track household/pantry items with quantity, unit, category, notes, date added, and low-stock threshold.
- Search, filter by category or low stock, and export as a text file.
- Natural-language bulk add, plus **recipe photo import**: a photo of a recipe or shopping list is handed to a host-side Claude Code watcher (`tools/recipe-image-watcher`), which returns ingredient rows the user reviews before adding.
- "Prepared meal" tag on an item (e.g. a frozen casserole) automatically creates a linked recipe so it can be scheduled in meal plans.

### Reminders & Notifications
- Reminder rules tied to tasks, chores, grocery items, events, or standalone notes, with lead time.
- Delivery channels: browser push (service worker + VAPID), email via SMTP, and a generic webhook (`WEBHOOK_URL`, which can point at Gotify/ntfy/Home Assistant).
- Per-reminder quiet hours, escalation of overdue task assignments to admins, and a daily digest — all run by the in-process 60-second ticker.

### Dashboard & Calendar UI
- Drag-and-resize dashboard grid with widgets for clock, weather, commute, tasks, chores, events, overdue chores, grocery, reminders, inventory, and meal plan; separate landscape and portrait layouts; 16 themes.
- Dashboard background photo with configurable opacity and fit; kiosk display mode (full-screen, cursor-hiding, wake lock) with its own layout.
- Calendar supports day/week/month with overlay of tasks, chores, and meals.
- Responsive layout optimized for phones/tablets with a configurable bottom tab bar. Offline caching **(not implemented)**.

### Meal Planning
- Recipe management: CRUD with ingredient list (name, quantity, unit, optional inventory link), prep/cook times, serving size, and source URL.
- Bulk recipe import via pasted text (one block per recipe, blank-line separated) or an uploaded JSON file (converted to text in the browser).
- Weekly meal planner grid (Monday–Sunday × meal type) with recipe slots and free-text entries.
- Ingredient inventory check: compares recipe ingredients against inventory quantities and reports ok/low/missing status.
- Add missing ingredients to a grocery list directly from a recipe or an entire meal plan week.

### Commute & Travel ETAs
- Configurable commute routes with destination address, travel mode (drive / bicycle / walk / two-wheeler / transit), active time-of-day window, and weekday filter.
- Live ETAs against a household-configured "home address" via the Mapbox Directions API, with congestion classes and an inline traffic map (Mapbox GL).
- Auto "leave-by" suggestions for calendar events with a `location` starting in the next 90 minutes.
- Cached geocoder results (positive and negative) to keep API usage low.

### Settings & Administration
- Household profile (name, timezone, quiet hours, theme, tab visibility, task retention).
- Server configuration from the UI (admin): Google OAuth client, SMTP, VAPID keys, OpenWeather key, Mapbox token, app base URL — secrets encrypted at rest.
- Google account connect/disconnect per user.
- User management (admin): create, change role, reset password, soft-delete.
- Backup: `make backup` / `make restore` copy the SQLite database; the in-app JSON export/import covers core tables only (not recipes, meal plans, commute routes, or attachment files).

### AI Assistant Access
- An MCP server (`mcp/`) exposes 15 household tools (today summary, tasks, chores, grocery, inventory, calendar, reminders) to MCP clients such as Claude Code. It logs in as a regular household user and calls the REST API; it has no direct database access.

## Data Storage Requirements
- SQLite database stored on local disk with write-ahead logging enabled.
- Secrets (OAuth refresh tokens and server-config secrets) encrypted at rest with AES-256-GCM (Node `crypto`), keyed by the 32-byte `ENCRYPTION_KEY` env var. (The original plan called for libsodium; not used.)
- Attachments stored on a local volume with sha256 checksums.

## Non-Functional Requirements
- **Privacy**: No outbound traffic besides the integrations the household configures (Google, Mapbox, OpenWeatherMap, SMTP, push services, webhook). Recipe-photo extraction runs through the host's Claude Code subscription, not from the app.
- **Availability**: Single-node deployment; target 24/7 uptime on home server/NAS/Raspberry Pi.
- **Performance**: Sub-second response for dashboard/calendar under 10 concurrent users; background sync must not block UI.
- **Security**: HTTPS terminated at the bundled nginx using a Tailscale certificate (or at an external reverse proxy). Strong password policy and rate limiting.
- **Maintainability**: A single backend process containing all services (API, calendar sync, notification/retention ticker) plus an nginx frontend, deployed with Docker Compose and `make` targets; scriptable backups.

## Constraints & Assumptions
- Users expect the system to work offline on LAN; rely on cached Google data when internet drops.
- Google API rate limits respected via caching and incremental sync; store sync metadata per calendar.
- No third-party analytics or tracking.
- Initial language: English; architecture should allow localization later.

## Out of Scope (Phase 1)
- Native mobile apps (mobile web only).
- Voice assistant integrations.
- Advanced AI-based scheduling suggestions. (AI-assisted recipe photo import is in scope and implemented via the host watcher.)
- Multi-tenant (only one household per deployment).

## Future Enhancements
- Home Assistant integration for automations.
- SMS notifications via local modem.
