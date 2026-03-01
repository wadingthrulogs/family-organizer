# Family Organizer Requirements

## Project Summary
A privacy-first intranet web application that lets household members share calendars, tasks, chores, grocery plans, and reminders while storing data on a self-hosted node. The app must run entirely on the local network, exposing only necessary Google Calendar API calls to the internet.

## Goals
- Provide a unified family calendar and task board that syncs with each member's Google Calendars.
- Centralize grocery planning, chore assignments, and reminders in a responsive web UI.
- Keep all custom data (users, tasks, chores, groceries, reminders) on local hardware with simple backups.
- Offer role-based security so admins control OAuth credentials, deployments, and household settings.

## Users & Personas
1. **Parent Admin**: sets up the server, manages Google integrations, oversees chores/grocery lists, configures reminders.
2. **Teen/Adult Member**: links personal calendars, checks assignments, marks tasks/chores complete, edits grocery items.
3. **Child/Guest Member**: read-only access to schedule plus lightweight chore/task updates from shared devices.

## Functional Requirements
### Authentication & Roles
- Local account system with username + password; optional PIN shortcut for shared tablets.
- Roles: Admin, Member, Viewer. Admins manage settings and OAuth tokens; Members manage personal data; Viewers read-only.
- Session handling via secure cookies with configurable idle timeout and optional device trust.

### Google Calendar Integration
- OAuth2 linking per user, supporting multiple calendars per Google account.
- Read-only sync in MVP; future writeback toggle per calendar.
- Unified calendar visualization with color coding by person/calendar.
- Manual refresh and scheduled background sync with incremental cache updates.

### Tasks & To-Dos
- CRUD for tasks with title, description, due date, priority, labels, attachments (local file reference), and recurrence.
- Assignment to one or multiple members; per-task status history.
- Views: list, board (status lanes), and timeline integrated with calendar day/week views.

### Chores & Household Rotations
- Chore templates with frequency (daily/weekly/custom), estimated effort, and eligible members.
- Rotation engine (round-robin or weighted) producing assignments per interval.
- Ability to skip, swap, or snooze chores while logging completion streaks.
- Dashboard highlights overdue or skipped chores.

### Grocery Lists
- Multiple named lists (e.g., Weekly, Costco, Party) with categories, quantity units, notes, and assignee/claimer.
- Bulk add via preset templates and natural-language parser ("3x bananas Tue").
- Mobile-friendly shopping mode allowing live sync across devices; "in cart" vs "need" states.

### Reminders & Notifications
- Reminder rules tied to tasks, chores, grocery shortages, or standalone notes.
- Delivery channels: browser push (Service Worker), email via local SMTP/Send-only service, optional Gotify/webhook.
- Quiet hours, escalation (e.g., notify parent if child task overdue), and digest summaries.

### Dashboard & Calendar UI
- Dashboard cards for today's events, upcoming tasks, overdue chores, grocery quick-look, reminder queue.
- Calendar supports day/week/month, filtering by member/resource, overlay of tasks/chores.
- Responsive layout optimized for phones/tablets with offline-friendly caching of recent data.

### Settings & Administration
- Household profile (name, timezone, default categories, theme).
- OAuth credential management (client ID/secret storage, token revocation).
- Backup/export/import of SQLite DB and file attachments.

## Data Storage Requirements
- SQLite database stored on local disk with write-ahead logging enabled.
- Secrets (OAuth tokens, session keys) encrypted at rest using libsodium secretbox with master key loaded from env.
- Optional object storage directory for attachments with checksum validation.

## Non-Functional Requirements
- **Privacy**: No outbound traffic besides Google APIs (OAuth + calendar) and optional email/push gateways.
- **Availability**: Single-node deployment; target 24/7 uptime on home server/NAS/Raspberry Pi.
- **Performance**: Sub-second response for dashboard/calendar under 10 concurrent users; background sync must not block UI.
- **Security**: HTTPS terminated at reverse proxy (Caddy/Traefik). Strong password policy and rate limiting.
- **Maintainability**: Modular services (API, sync worker, reminder scheduler) with Docker-based deployment and scriptable backups.

## Constraints & Assumptions
- Users expect the system to work offline on LAN; rely on cached Google data when internet drops.
- Google API rate limits respected via caching and incremental sync; store sync metadata per calendar.
- No third-party analytics or tracking.
- Initial language: English; architecture should allow localization later.

## Out of Scope (Phase 1)
- Native mobile apps (mobile web only).
- Voice assistant integrations.
- Advanced AI-based scheduling suggestions.
- Multi-tenant (only one household per deployment).

## Future Enhancements
- Home Assistant integration for automations.
- Shared meal planning linked to grocery lists.
- SMS notifications via local modem.
- Dark mode theme pack and custom color palettes.
