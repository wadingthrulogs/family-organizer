# UI Wireframes & Design Notes

## Visual Direction
- Friendly, modern aesthetic with warm neutral background and accent colors per family member.
- Font pairing: "Cabin" for headings, "Source Sans 3" for body to stay welcoming yet clear.
- Color tokens:
  - `--bg`: #F5F1EA (light parchment)
  - `--surface`: #FFFFFF with subtle shadow
  - `--accent`: #2F80ED (actions), `--accent-alt`: #F2994A (warning)
  - Member colors derived from profile color_hex values.
- Components feature rounded corners (10px) and generous spacing for touch interactions.
- Motion: subtle fade-slide for panel switches; staggered list reveals.

## Dashboard (Desktop)
```
+-------------------------------------------------------------+
| Header: Household name | date picker | user avatar drop-down |
+-------------------------------------------------------------+
| Left Column (65%)                                        | |
|  - Today Card: timeline list of events/tasks              | |
|  - Upcoming Tasks: kanban mini-lanes (Today, Tomorrow...) | |
|  - Chore Spotlight: carousel of pending chores per member | |
| Right Column (35%)                                       | |
|  - Grocery Quick Add form + top 5 needed items           | |
|  - Reminder Queue mini-table                             | |
|  - Sync Status widget (Google, backups)                  | |
+-------------------------------------------------------------+
Footer: buttons for Calendar, Tasks, Chores, Grocery, Settings
```
Mobile adapts to stacked cards with sticky nav bar.

## Calendar Views
- Top controls: view switch (Day/Week/Month), member filter chips, add event/task button.
- Week view uses FullCalendar with side rail for all-day items and inline task badges.
- Tasks and chores appear as pill overlays with icons (checkbox vs broom) and color-coded borders.
- Mobile day view shows agenda list with swipe to mark done.

## Task Board
```
Kanban layout (columns: Backlog · In Progress · Waiting · Done)
Each card: title, assignees avatars, due date chip, checklist count.
Sidebar: filters (labels, members, due range) + quick add form.
```
- On phones, columns become horizontal scrollable lanes.

## Chore Planner
- Calendar strip showing next 14 days; below, list of assignments grouped by day.
- "Rotation" modal to edit rules with drag-drop order and weight sliders.
- Completion action uses large toggle + optional photo upload for proof.

## Grocery List
- Split view: categories on left, items on right with large tap targets.
- Shopping mode: darkened header, items enlarge with state toggles (Need → In Cart → Purchased) using swipe gestures.
- Bulk controls pinned at bottom (Mark All Purchased, Reset Claimed).
- Mobile layout uses bottom sheet for add-item form; voice input shortcut optional.

## Reminder Settings
- Table of reminders with pills for channels; clicking row opens drawer.
- Drawer shows trigger preview timeline, quiet hours slider, escalation options.
- Test send button and delivery history list.

## Auth & Settings
- Login screen: household logo, username/password fields, "Enter PIN" secondary action.
- Settings pages organized in tabs: Household, Members, Integrations, Backup & Restore, Theme.

## Responsive Behavior
- Breakpoints: 320, 600, 960, 1280.
- At <=600px: nav becomes bottom bar; cards stack; filters collapse into drawers.
- Offline indicator (small badge) appears when Service Worker detects offline; allows manual sync once online.

## Accessibility
- Minimum 4.5:1 contrast for text; focus outlines custom but high contrast.
- Keyboard shortcuts: `g c` for calendar, `g t` for tasks, `g g` for grocery.
- Reduced-motion mode disables panel animations.
