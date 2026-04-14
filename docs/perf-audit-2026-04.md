# Frontend Performance Audit — April 2026

Target: Raspberry Pi 5 / Chromium / 1080p wall kiosk, 24/7 uptime.
Method: `vite build` output + static analysis. No live profiling.

## Executive Summary — top 3 wins

1. **Kill the per-widget `document.addEventListener('pointermove', …)` in `useWidgetSize`.** Every widget instance (10 on the default dashboard) installs a global pointermove handler that calls `offsetWidth/offsetHeight` → forces a layout read on every single mouse/touch move. On a Pi 5 with a touchscreen this is the #1 CPU hog during any interaction. **Impact: High / Effort: Trivial.**
2. **Route-split the 567 kB main bundle.** `react-grid-layout` + `CalendarPage` + `MealPlanPage` + `SettingsPage` all ship in the initial chunk even though a wall-kiosk only ever renders `DashboardPage`/`KioskPage`. Lazy-load routes and the dashboard grid. **Impact: High / Effort: Small.**
3. **Stop `queryClient.invalidateQueries()` (all-queries wipe) every 60 s in Kiosk.** Replace with targeted invalidations so only widgets actually on screen refetch, and stop re-invalidating queries that already have `refetchInterval` (weather). **Impact: High / Effort: Trivial.**

---

## Measured metrics

### Bundle (fresh `vite build`, 268 modules, 4.24 s)

| Asset | Raw | Gzip |
|---|---|---|
| `index-*.js` (main) | **566.55 kB** | **156.01 kB** |
| `index-*.css` | 58.29 kB | 11.63 kB |
| EventsWidget (lazy) | 8.33 | 2.86 |
| TasksWidget (lazy) | 5.37 | 1.90 |
| WeatherWidget (lazy) | 4.23 | 1.58 |
| GroceryWidget (lazy) | 3.94 | 1.51 |
| ChoresWidget (lazy) | 3.00 | 1.28 |
| MealPlanWidget / InventoryWidget / OverdueChoresWidget / RemindersWidget | 2.06–2.58 | 0.89–1.20 |
| useWidgetSize (lazy chunk) | 1.33 | 0.62 |
| ClockWidget | 1.16 | 0.65 |

Vite's own warning: *"Some chunks are larger than 500 kB after minification."* There is **zero** route-level `lazy()` in `App.tsx` (lines 1–15: every page is a static import). Widget-level `lazy()` exists only because `widgetRegistry.ts` uses it; routes don't.

### Static counts

- **10 widgets** — all call `useWidgetSize()` (grep: 10/10).
- **10 global `pointermove` listeners on the dashboard** (one per widget, `useWidgetSize.ts:99`).
- **~20 React Query hooks** under `src/hooks/use*.ts`. `staleTime` range: 15 s (`useCalendarEvents`) → 60 s (`useSettings`). Two hooks lack explicit `staleTime` entirely (check below). No `refetchOnWindowFocus: false` anywhere → RQ default `true` is active.
- **`ClockWidget` re-renders 86,400×/day** (setInterval 1000 ms, `ClockWidget.tsx:7`).
- **Kiosk full invalidation every 60 s** → 1,440 cache wipes/day × ~10 active queries = ~14k refetches/day idle.
- **No `React.memo` / `useMemo`** around list renders in `TasksWidget`, `ChoresWidget`, `GroceryWidget`, `InventoryWidget`, `RemindersWidget`.

---

## Findings

### §1 — Global pointermove listener per widget `useWidgetSize.ts:91–101`
**Evidence:** Lines 91–101 install `document.addEventListener('pointermove', onPointerMove)` in a `useEffect` with `[]` deps. Each widget that mounts this hook gets its own listener, and each listener synchronously reads `nodeRef.current.offsetWidth/offsetHeight` — a forced layout (reflow). With 10 widgets, every single mouse move on the kiosk forces **10 layout reads**. On touch drags (`react-grid-layout` in edit mode) Chromium dispatches pointermove at display rate, so this can easily saturate a Pi 5 Cortex-A76 core during any scroll/drag. `ResizeObserver` on `:43` already handles the actual resize case; the pointermove hack exists only as a belt-and-suspenders remeasure for RGL drag lag.
**Impact: High. Effort: Trivial.**
**Fix:** Remove the effect entirely. If the lag-during-RGL-drag symptom returns, scope the listener to `onDrag`/`onResize` of `ResponsiveGridLayout` (DashboardPage:219, KioskPage:235) via a callback that calls one remeasure, or only attach it while `editMode === true`. Sketch:

```ts
// DashboardPage.tsx — pipe a single ref-based remeasure through the grid
const remeasureAll = useRef(new Set<() => void>()).current;
<ResponsiveGridLayout onResize={() => remeasureAll.forEach(fn => fn())} ... />

// useWidgetSize — drop lines 91-101 entirely. Rely on ResizeObserver.
```

### §2 — No route-level code splitting `App.tsx:4–15`
**Evidence:** All 12 pages are static imports at the top of `App.tsx`. `DashboardPage` pulls in `react-grid-layout` (the heaviest dep), `CalendarPage` pulls Intl formatters + month grid logic, `MealPlanPage`, `SettingsPage`, `NotificationsPage` all ship upfront. 567 kB / 156 kB gzip is unusual for a SPA this small — 268 modules transformed → average 2 kB per module suggests `react-grid-layout` + `react-query` + `axios` + `react-router` dominate. On a Pi 5, 156 kB of gzip *decompresses and parses* (main thread work) — parse+compile of 567 kB of JS on a Cortex-A76 @ 2.4 GHz is in the 400–800 ms range on first cold load; subsequent warm loads still pay parse cost if the cache was evicted overnight.
**Impact: High. Effort: Small.**
**Fix:** Lazy-load all routes except `DashboardPage`/`KioskPage`/`LoginPage`. `react-grid-layout` should also only ship when the dashboard is actually rendered (it already is imported statically via `DashboardPage`, but if Kiosk is the primary surface, consider splitting RGL out of the critical path).

```ts
// App.tsx
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const TasksPage    = lazy(() => import('./pages/TasksPage'));
// ... etc, wrap <Routes> in <Suspense fallback={<Spinner/>}>
```
Expected result: main chunk drops to ~200–280 kB raw / ~70–90 kB gzip.

### §3 — Kiosk blanket invalidation `KioskPage.tsx:54–59`
**Evidence:** `setInterval(() => queryClient.invalidateQueries(), 60_000)` invalidates **every** query including `settings` (staleTime ∞), `userPreferences` (∞), `linkedCalendars`, `googleIntegration` (∞), `weather` (already on its own 5 min `refetchInterval`), and inactive pages' data. Because `refetchOnWindowFocus` is default-true and `refetchOnMount` is default-true, even settings/prefs get hit every minute on a kiosk that never changes. Combined with §1, on a touchscreen, every interaction also re-triggers refetch cascades.
**Impact: High. Effort: Trivial.**
**Fix:** Invalidate only the query keys the rendered widgets care about. Sketch:

```ts
// KioskPage.tsx:54
const KIOSK_REFRESH_KEYS = [
  ['tasks'], ['chores'], ['calendarEvents'],
  ['groceryLists'], ['inventory'], ['reminders'], ['mealPlanCalendar'],
] as const;
useEffect(() => {
  const id = setInterval(() => {
    KIOSK_REFRESH_KEYS.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
  }, AUTO_REFRESH_MS);
  return () => clearInterval(id);
}, [queryClient]);
```
Also: bump `AUTO_REFRESH_MS` to `120_000` — nobody on a family kiosk cares about 60-second freshness for chores.

### §4 — `ClockWidget` 1 Hz tick re-renders `ClockWidget.tsx:5–11`
**Evidence:** `setNow(new Date())` every 1000 ms triggers a full React render of ClockWidget. Own render is cheap; the problem is that ClockWidget also calls `useWidgetSize()` (line 15), which is fine in isolation but combined with §1 means every clock tick also runs a `setSize(prev => …)` comparison in the pointermove path? No — that's not cascaded. However, `showSeconds` and `timeStr` recompute `toLocaleTimeString()` twice per second in the tick path when `showSeconds` is true. Minor but pointless.
**Impact: Low. Effort: Trivial.**
**Fix:** If `tiny` (no seconds), tick every 30 s instead of 1 s. If showing seconds, compute `timeStr` once and reuse.

```ts
useEffect(() => {
  const ms = showSeconds ? 1000 : 30_000;
  const id = setInterval(() => setNow(new Date()), ms);
  return () => clearInterval(id);
}, [showSeconds]);
```
Note for Phase 2: ClockWidget re-render does **not** cascade — it is a leaf. Don't waste time memoizing its siblings over it.

### §5 — Default RQ `refetchOnWindowFocus: true` across the app `main.tsx:43`
**Evidence:** `new QueryClient()` with no defaults. A kiosk never loses focus under normal use, but any Chromium tab-switch, alert dialog, virtual keyboard, or touch-drag-dismiss can trigger a focus event → every active query refetches. Combined with §3's 60 s invalidate, you get duplicate fetches.
**Impact: Medium. Effort: Trivial.**
**Fix:**

```ts
// main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      staleTime: 30_000,
      gcTime: 10 * 60_000,
    },
  },
});
```
Lets you also delete the per-hook `staleTime: 30_000` boilerplate in `useTasks.ts`, `useChores.ts`, `useMealPlans.ts` etc.

### §6 — Unstable query key in `useInventory` / `useReminders`
**Evidence:** `useInventory.ts:6` uses `queryKey: ['inventory', params]` where `params` is an object passed by value from the caller. If the caller constructs `params` inline (e.g. `useInventory({ lowStock: true })`), a new object reference every render → new query key → refetch thrash. Same pattern at `useReminders.ts:6`.
**Impact: Medium (only if callers pass inline objects; spot-check needed). Effort: Trivial.**
**Fix:** Destructure primitives into the key:

```ts
export function useInventory(params?: InventoryQuery) {
  const { search = '', category = '', lowStock = false } = params ?? {};
  return useQuery({
    queryKey: ['inventory', search, category, lowStock],
    queryFn: () => fetchInventoryItems({ search, category, lowStock }),
  });
}
```

### §7 — `EventsWidget` recomputes grid every render `EventsWidget.tsx:183–290`
**Evidence:** `EventsCalendar` builds a 30-day grid inside `useMemo([compact])` — good. But `buildMonthGrid` is called on each render of `CalendarPage` too (line 105 of CalendarPage), and `EventsWidget` re-renders whenever `eventsData` or `mealEntriesData` changes (every 60 s in kiosk). The grid itself is cheap; the cost is the re-render of ~35 day cells × 3 events each = ~100 DOM nodes reconciled. Not catastrophic, but if §3 fires every 60 s this is wasted.
**Impact: Low. Effort: Small.**
**Fix:** Wrap day cells in a memoized subcomponent keyed by `dateKey + bucketLength`. Or just fix §3 and this pain disappears.

### §8 — `TasksWidget.fetchUsers()` fires on every mount, unkeyed `TasksWidget.tsx:24–26`
**Evidence:** Bypasses React Query entirely — uses `useState` + `fetchUsers().then(...)`. Not cached, not shared across widgets. Every time the Tasks "add" flow expands, the user list is already in memory, but any remount hits the server again.
**Impact: Low. Effort: Trivial.**
**Fix:** Add `useUsers()` hook on top of React Query with `staleTime: Infinity`, share across `TasksWidget` and `ChoresPage`.

### §9 — Bundle: `zustand` is in deps but barely used `package.json:25`
**Evidence:** CLAUDE.md notes "Zustand 4.5 (installed, minimal use)". Grep shows no imports in the critical path. It still ships if any transitive dep references it. Worth verifying via `npx vite-bundle-visualizer` in Phase 2.
**Impact: Low (maybe ~4 kB gzip). Effort: Trivial if truly unused.**
**Fix:** Delete `zustand` from `package.json` and run `npm install`. If it fails, it was in use.

### §10 — StrictMode double-invoke in dev `main.tsx:46`
**Evidence:** `<React.StrictMode>` wraps the app. This is a dev-only concern (production builds strip it) but if the user is running `npm run dev` on the Pi, every effect runs twice, including the 10 pointermove attachments.
**Impact: Low (only affects dev mode). Effort: N/A.**
**Note:** Make sure the Pi is serving `dist/` via a static server, not `vite dev`.

---

## Out of scope / low-priority — Phase 2 should skip

- **16 themes via CSS custom properties (`tailwind.config.js`).** Verified: theming is pure CSS variables. No widget reads them in JS per render. Fine as-is.
- **React.memo sprinkle on every widget.** Not needed — widgets only re-render when their own query data changes. The real cascades come from §1 and §3.
- **Switching state library / adopting Zustand more.** Won't move the needle vs. §1–§3.
- **Virtualizing task / grocery lists.** Families don't have 1000 tasks. Skip unless `pendingTasks.length > 100` in practice.
- **`@dnd-kit` on TasksPage Kanban.** Off the critical path for the kiosk; users spend 99% of their time on `/` or `/kiosk`. Only relevant if TasksPage is slow specifically.
- **Replacing react-grid-layout.** It's the biggest single dep but rewriting it is a week of work. Route-split it (§2) instead.
- **Service worker / offline caching.** Pi is on LAN — the backend is on the same network. Adds complexity for no win.
- **Image optimization / WebP.** Only the optional dashboard background image is user-supplied; let the user pick a small one.
- **ClockWidget cascading into siblings.** Verified: it's a leaf. Leave it alone beyond §4's cheap tick change.
- **Weather widget refetch.** `useWeather.ts:14-15` is already 5-minute `staleTime` + `refetchInterval`. Fine.

---

## Phase 2 implementation order

1. §1 (drop pointermove) — verify RGL drag still updates sizes correctly.
2. §3 + §5 (kiosk invalidation + RQ defaults) — one commit.
3. §2 (route splitting) — re-measure bundle, target <300 kB main.
4. §6 (query key stability) — quick sweep.
5. §4, §7, §8 — cleanup commit.
