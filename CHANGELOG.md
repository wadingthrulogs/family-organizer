# Changelog

All notable changes to Family Organizer are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.1.0] — 2026-02-22

Initial public release.

### Added

**Task Management**
- Kanban board with OPEN / IN_PROGRESS / BLOCKED / DONE / ARCHIVED columns
- Task assignments to multiple household members
- Priority levels (0–5), due dates, and labels
- Recurring tasks (daily, weekly, biweekly, monthly, yearly)
- Status change history log
- Drag-and-drop card reordering

**Chores**
- Chore templates with round-robin, weighted, and manual rotation
- Auto-generated assignments with configurable windows
- Skip and swap assignment actions
- Streak tracking per user per chore
- Reward points system

**Grocery Lists**
- Multiple named shopping lists with optional store tag
- Shopping mode (high-contrast dark UI optimized for in-store use)
- Item states: NEEDED → CLAIMED → IN_CART → PURCHASED
- Natural-language bulk add
- Auto-populate list from low-stock inventory items

**Inventory**
- Pantry/household item tracker with quantity and unit
- Low-stock threshold alerts
- Natural-language bulk add
- Move purchased grocery items directly to inventory
- CSV-style text export

**Calendar**
- Google Calendar OAuth integration (multiple accounts per household)
- Day / week / month views
- Manual event creation with color coding
- Background sync with last-sync status

**Reminders & Notifications**
- Reminder rules linked to tasks, chores, or arbitrary targets
- Web Push notifications (VAPID)
- Optional SMTP email delivery
- Per-reminder lead time and channel selection
- Admin-triggered notification processing

**Users & Access Control**
- Session-based authentication with bcrypt password hashing
- Three roles: ADMIN, MEMBER, VIEWER
- Admin user management (create, reset password, change role, soft delete)
- Per-user color tag for assignment display

**Dashboard**
- Drag-and-resize widget grid (react-grid-layout)
- Widgets: Clock, Weather, Tasks, Chores, Overdue Chores, Grocery, Events, Reminders, Inventory
- Layout persisted per user

**Theming**
- 16 built-in themes: Default, Dark+, Light+, Monokai, Dracula, Solarized Dark/Light, One Dark Pro, Nord, GitHub Dark/Light, Catppuccin Mocha/Latte, Gruvbox Dark, Tokyo Night, Rosé Pine

**Settings**
- Household name, timezone, quiet hours
- Weather widget (OpenWeatherMap integration)
- Hidden tabs per user
- Backup export / import (ADMIN)

**Deployment**
- Docker Compose setup (frontend + backend, single `docker compose up`)
- Automatic database migrations on container start
- Nginx-based frontend container handles SPA routing and API proxying
- Attachment file uploads (up to 10 MB, magic-byte validated)
