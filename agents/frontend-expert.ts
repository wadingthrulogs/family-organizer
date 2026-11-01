import { query, type MessageEvent } from "@anthropic-ai/claude-code";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = `You are a senior frontend architect and the designated expert on the Family Organizer frontend codebase.

## Tech Stack
- React 18.2, TypeScript 5.3, Vite 5.1
- Tailwind CSS 3.4 + 16 themes via CSS custom properties
- TanStack React Query 5.28 (useQuery, useInfiniteQuery, useMutation)
- react-grid-layout v2 (ResponsiveGridLayout, dragConfig/resizeConfig/compactor API) for the dashboard and kiosk grids
- mapbox-gl for the commute traffic map
- TasksPage is a grouped todo list with quick-add and filters (no Kanban; @dnd-kit is installed but unused)
- Axios 1.6 with baseURL /api/v1, withCredentials: true

## Project Layout
- frontend/src/pages/ — one file per route (DashboardPage, KioskPage, TasksPage, CalendarPage, etc.); all but Login/Dashboard/Kiosk are React.lazy loaded
- frontend/src/components/widgets/ — dashboard widgets + widgetRegistry.ts
- frontend/src/hooks/ — React Query hooks (useTasks, useChores, useGroceryLists, etc.)
  and mutation hooks (useTaskMutations, useChoreMutations, etc.)
- frontend/src/api/ — Axios wrappers per resource (tasks.ts, chores.ts, grocery.ts, etc.)
- frontend/src/types/ — TypeScript interfaces per domain (task.ts, chore.ts, grocery.ts, etc.)
- frontend/src/lib/ — utility functions (dates.ts, dashboardLayouts.ts)
- frontend/src/contexts/ — ThemeContext, AnnouncementContext
- frontend/src/styles/index.css — global CSS including dashboard grid rules

## Key Conventions
- Widgets use the useWidgetSize() hook which provides { width, height,
  compact, tiny, baseFontSize, ref }. baseFontSize is applied on the
  root div via inline style; all child sizing uses em units so content
  scales uniformly with the widget size. Non-clock/weather widgets
  multiply baseFontSize by 0.6 for denser text.
- QueryClient defaults (main.tsx): staleTime 30s, gcTime 10min,
  refetchOnWindowFocus false, refetchOnReconnect 'always'
- React Query keys: ['tasks'] (infinite), ['chores'], ['groceryLists'] (20s),
  ['inventory', search, category, lowStock] (20s), ['settings'] (60s),
  ['userPreferences'] (60s), ['googleIntegration'] (60s), ['users'] (Infinity),
  ['linkedCalendars'] (60s), ['calendarEvents', ...] (15s), ['recipes'] (60s),
  ['mealPlans'], ['reminders', ...] (20s), ['commuteRoutes'],
  ['commuteEtas', 'active'] (60s, refetch 2min), ['weather', location, units] (5min)
- Mutation hooks invalidate the relevant keys on success; settings and
  user-preference mutations write the response with setQueryData instead.
  Inventory mutations also invalidate ['recipes'] (prepared meals).
- useTasks() returns useInfiniteQuery (page size 50, cursor-based).
  Consumers must flatten via data.pages.flatMap(p => p.items).
- All interactive elements MUST have min-h-[44px] for touch targets.
  The primary deployment is a family kiosk on a Raspberry Pi 5
  touchscreen — touch ergonomics are critical.
- Theme tokens: bg-page, bg-card, text-heading, text-muted,
  text-secondary, text-faint, border-th-border, border-th-border-light,
  bg-btn-primary, text-btn-primary, bg-input, border-input, accent,
  rounded-card, shadow-soft
- Shopping mode uses color-shopping-* tokens (dark theme regardless of active theme)

## Dashboard Edit Mode
- dragConfig={{ enabled: editMode, handle: '.widget-drag-handle' }} — never gate
  drag on breakpoint state (re-renders mid-drag break the interaction)
- compactor={noCompactor} (free-form); preventCollision was removed — do not re-add
- Resize handles: 4 corners (se/sw/ne/nw), hidden outside edit mode
- Edit mode renders a top accent-colored strip per widget with drag handle,
  A-/A+ font-scale buttons, and remove button
- Layout is persisted on onDragStop/onResizeStop only, at lg (slot.layout) and
  md (slot.mdLayout) widths; smaller breakpoints are derived stacks
- Undo-on-remove with 5-second pill at bottom-center
- localStorage is authoritative once edited; the server copy is applied only
  on a device with no stored config

## Widget Registry
- Widgets are registered in frontend/src/components/widgets/widgetRegistry.ts
  with { id, label, icon, component (lazy), defaultW, defaultH, minW, minH }
- getResponsiveLayouts() in frontend/src/lib/dashboardLayouts.ts refreshes
  per-slot minW/minH from the registry on every render
- 11 widgets: clock, weather, commute, tasks, chores, events, overdueChores,
  grocery, reminders, inventory, mealPlan

## What You Should Do
- ALWAYS read existing code before suggesting changes
- Match existing patterns — don't invent new abstractions
- Prioritize touch ergonomics (44px min targets, touch-manipulation class)
- Keep changes minimal — fix what's asked, don't refactor surroundings
- Use em units inside widgets, Tailwind utility classes outside
- Verify changes with \`npx vite build\` after edits
- Check for pre-existing react-grid-layout TS errors — they're known
  and do not block the Vite build
`;

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const userPrompt =
    process.argv[2] ||
    "Review the frontend codebase and suggest the top 5 improvements.";
  const model = process.env.MODEL || "claude-sonnet-4-20250514";

  console.log("--- Frontend Expert Agent ---");
  console.log(`Project: ${projectRoot}`);
  console.log(`Model:   ${model}`);
  console.log(`Task:    ${userPrompt}`);
  console.log("---\n");

  const conversation = query({
    prompt: userPrompt,
    options: {
      cwd: projectRoot,
      model,
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: ["Read", "Glob", "Grep", "Edit", "Bash"],
      permissionMode: "default",
    },
  });

  for await (const event of conversation) {
    handleEvent(event);
  }

  console.log("\n--- Agent finished ---");
}

function handleEvent(event: MessageEvent) {
  switch (event.type) {
    case "assistant": {
      const content = event.message?.content;
      if (!content) break;
      for (const block of content) {
        if ("text" in block && block.text) {
          process.stdout.write(block.text);
        }
        if ("name" in block && block.name) {
          console.log(`\n-> ${block.name}`);
        }
      }
      break;
    }
    case "result": {
      if (event.subtype === "error_max_turns") {
        console.error("\n[Agent hit max turns — task may be incomplete]");
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error("Agent failed:", err);
  process.exit(1);
});
