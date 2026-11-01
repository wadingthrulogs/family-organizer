# UI Wireframes & Design Notes

> Original design notes, updated to match what is built on `main`. Items marked **(not implemented)** are ideas from the original design that have not been built.

## Visual Direction
- Friendly, modern aesthetic; per-member accent colors from each user's `colorHex`.
- Font pairing: "Cabin" for headings (`font-display`), "Source Sans 3" for body (loaded in `frontend/index.html`).
- All colors are CSS custom properties per theme (16 themes: `default, dark-plus, light-plus, monokai, dracula, solarized-dark, solarized-light, one-dark-pro, nord, midnight, paper, catppuccin-mocha, catppuccin-latte, gruvbox-dark, tokyo-night, rose-pine`), consumed by Tailwind tokens such as `bg-page`, `bg-card`, `text-heading`, `text-muted`, `border-th-border`, `bg-btn-primary`, `accent`.
- Shopping mode uses dedicated `color-shopping-*` tokens (dark regardless of theme).
- Rounded cards (`rounded-card`), soft shadows, generous spacing for touch.

## App Shell
```
+---------------------------------------------------------------+
| Header: household name · user menu                            |
| Top nav tabs (desktop)                                        |
+---------------------------------------------------------------+
| Page content                                                  |
+---------------------------------------------------------------+
Mobile: bottom tab bar (user picks up to 4 tabs in Settings) + "More"
```
- Tabs can be hidden per household (Settings → Appearance → Tab Visibility).
- On mobile the Tasks page has a floating "+" quick-add button; the Tasks widget also supports quick task creation with an assignee.

## Dashboard
```
+-------------------------------------------------------------+
| (floating ⚙ button → dashboard settings: edit, add widgets) |
| +-------+ +-------+ +---------------+                       |
| | Clock | |Weather| | Events (8×3)  |   ← react-grid-layout |
| +-------+ +-------+ +---------------+     12-col grid       |
| +---------+ +-----------+ +--------+                        |
| | Tasks   | | Chores    | |Commute |   drag handle + 4      |
| +---------+ +-----------+ +--------+   corner resize handles|
+-------------------------------------------------------------+
```
- Free-form drag-and-resize grid of widgets: clock, weather, commute, tasks, chores, events, overdue chores, grocery, reminders, inventory, meal plan.
- Edit mode toggles dragging/resizing; removing a widget offers undo. Per-widget font size.
- Separate layouts are saved for landscape (`lg`, 12 columns) and portrait (`md`, 8 columns) screens; smaller breakpoints stack.
- Optional background photo with opacity and fill/contain fit.
- Layout is stored in localStorage and synced to the server (`/settings/me`); the local copy wins once edited on a device.

## Kiosk (`/kiosk`)
- Full-screen wall display outside the app shell, with its own widget layout and settings sheet (independent of the dashboard).
- Screen wake lock, auto-hiding cursor, and a targeted 2-minute data refresh. Has its own edit mode.

## Calendar Views
- Top controls: Day / Week / Month switch, previous/next, add (Event / Task / Chore / Meal), "Sync Google Calendar" button.
- Events from linked Google calendars and local events, color-coded by calendar; tasks, chores, and meal-plan entries overlaid as pills.
- Custom-built views (no FullCalendar dependency).
- Swipe-to-mark-done on mobile **(not implemented)**.

## Tasks (Todo List)
```
Quick-add bar at top (type title + Enter to create).
Filter tabs: All | Active | Done | Mine.
Tasks grouped by date: Overdue (red) / Today (orange) / Upcoming / No Due Date.
Each row: checkbox (open/done toggle), title, due date pill, assignee avatars, expand chevron.
```
- Click any row to expand: description, inline edit form (title, due date, labels, assignees, recurrence), file attachments, delete button.
- Completing a recurring task creates its next occurrence.
- Mobile: same layout, stacks naturally.

## Chore Planner
- "Upcoming assignments" list (pending / in-progress) with complete, skip, and swap actions.
- "Completion Streaks" panel (current, longest, total per member).
- Chore templates list with create/edit form (rotation type, frequency, interval, eligible members, weights, reward points).
- The next assignment is generated automatically when a chore is created and when an assignment is completed or skipped.
- Drag-drop rotation order and photo proof of completion **(not implemented)**.

## Grocery List
- Multiple lists; each list shows items grouped by category with large tap targets.
- Add single items, or bulk-add natural-language text ("3x bananas, milk"); add low-stock inventory items in one click.
- Shopping mode: dark "Live cart view" with a shopping queue; items move Need → In Cart → Purchased by tapping. Purchased items can be moved into inventory.
- Swipe gestures and voice input **(not implemented)**.

## Inventory
- Add form and "Add multiple items" natural-language box; search, category filter, low-stock filter; text export.
- Per-item low-stock threshold and "prepared meal" tag (creates a linked recipe for meal planning).
- **Recipe photo upload**: pick or take a photo → the host AI watcher extracts ingredients → review/edit rows in a modal → bulk add.

## Meal Plans
- Weekly grid (Mon–Sun × Breakfast / Lunch / Dinner / Snack) with recipe or free-text entries.
- Recipes tab: CRUD, inventory check (ok / low / missing / unlinked), add missing to grocery, bulk import (paste text or upload JSON).
- "Send week to grocery list".

## Notifications & Reminders (`/notifications`)
- Create / edit reminder form (target, channels, lead time, quiet hours).
- Browser push enable/disable for this device.
- Notification history; admin controls (process now, send digest, household-wide log).
- Trigger timeline preview and escalation editor **(not implemented)**.

## Auth & Settings
- Login screen: app name, username/password. "Enter PIN" login **(not implemented)**.
- Registration page works only for the very first (bootstrap admin) account.
- Settings is one page of sections (on mobile, a section list that drills in): General (name, timezone, quiet hours, task retention), Appearance (theme, tab visibility, mobile bottom bar), Weather, Commute / Routes, Google Calendar (connect, sync, force re-sync), Server Configuration (admin: API keys, SMTP, VAPID, OAuth, Mapbox), Backup & Export (admin), User Management (admin) / Account.

## Responsive Behavior
- Tailwind breakpoints for page layout; the dashboard grid uses `lg 1280 / md 996 / sm 768 / xs 480 / xxs 0` with 12 / 8 / 4 / 2 / 1 columns.
- On small screens the nav becomes a bottom bar and cards stack.
- Offline indicator and offline sync **(not implemented)** — the service worker handles push notifications only.

## Accessibility
- Minimum 4.5:1 contrast target for text; visible focus outlines.
- Screen-reader announcements via an `AnnouncementProvider` live region.
- Keyboard shortcuts (`g c`, `g t`, `g g`) **(not implemented)**.
