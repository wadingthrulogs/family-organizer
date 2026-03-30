import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useMealPlanCalendar } from '../hooks/useMealPlans';
import { fetchLinkedCalendars } from '../api/calendar';
import { fetchTasks } from '../api/tasks';
import { fetchChores } from '../api/chores';
import type { CalendarEvent } from '../types/calendar';

type OverlaySource = 'calendar' | 'task' | 'chore' | 'mealplan';

interface CalendarItem extends CalendarEvent {
  overlaySource: OverlaySource;
}

type CalendarView = 'day' | 'week' | 'month';

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(date: Date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  return addDays(copy, -day);
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 7);
}

function getRange(view: CalendarView, anchor: Date) {
  if (view === 'day') {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1) };
  }
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 7) };
  }
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = startOfWeek(firstOfMonth);
  const end = endOfWeek(addDays(lastOfMonth, 1));
  return { start, end };
}

function formatRangeLabel(view: CalendarView, start: Date, end: Date) {
  if (view === 'day') {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(start);
  }
  if (view === 'week') {
    const startLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(start);
    const endLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(addDays(end, -1));
    return `${startLabel} – ${endLabel}`;
  }
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(start);
}

function formatTimeRange(event: CalendarItem) {
  if (event.allDay) {
    return 'All day';
  }
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatter.format(new Date(event.startAt))} – ${formatter.format(new Date(event.endAt))}`;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function groupEventsByDate(events: CalendarItem[]) {
  return events.reduce<Record<string, CalendarItem[]>>((acc, event) => {
    const key = dateKey(new Date(event.startAt));
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(event);
    return acc;
  }, {});
}

const overlayColors: Record<OverlaySource, string> = {
  calendar: 'border-l-blue-500',
  task: 'border-l-violet-500',
  chore: 'border-l-amber-500',
  mealplan: 'border-l-green-500',
};

const overlayBadges: Record<OverlaySource, { label: string; color: string }> = {
  calendar: { label: 'Event', color: 'bg-blue-100 text-blue-700' },
  task: { label: 'Task', color: 'bg-violet-100 text-violet-700' },
  chore: { label: 'Chore', color: 'bg-amber-100 text-amber-700' },
  mealplan: { label: 'Meal', color: 'bg-green-100 text-green-700' },
};

function buildMonthGrid(anchor: Date) {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(firstOfMonth);
  const gridEnd = endOfWeek(addDays(lastOfMonth, 1));
  const days: Array<{ date: Date; inMonth: boolean }> = [];
  for (let cursor = new Date(gridStart); cursor < gridEnd; cursor = addDays(cursor, 1)) {
    const current = new Date(cursor);
    days.push({ date: current, inMonth: current.getMonth() === anchor.getMonth() });
  }
  const weeks: Array<typeof days> = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

function CalendarPage() {
  const [view, setView] = useState<CalendarView>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedCalendarId, setSelectedCalendarId] = useState<number | undefined>(undefined);
  const [showOverlay, setShowOverlay] = useState<{ tasks: boolean; chores: boolean; meals: boolean }>({ tasks: true, chores: true, meals: true });

  const { data: calendarsData } = useQuery({
    queryKey: ['linkedCalendars'],
    queryFn: fetchLinkedCalendars,
    staleTime: 60_000,
  });
  const linkedCalendars = calendarsData?.items ?? [];

  // Fetch tasks and chores for overlay
  const { data: tasksData } = useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    staleTime: 30_000,
  });
  const { data: choresData } = useQuery({
    queryKey: ['chores', { includeAssignments: true }],
    queryFn: fetchChores,
    staleTime: 30_000,
  });

  const range = useMemo(() => getRange(view, anchorDate), [view, anchorDate]);
  const rangeLabel = useMemo(() => formatRangeLabel(view, range.start, range.end), [view, range.start, range.end]);

  const mealRangeStart = useMemo(() => dateKey(range.start), [range.start]);
  const mealRangeEnd = useMemo(() => dateKey(addDays(range.end, -1)), [range.end]);
  const { data: mealEntriesData } = useMealPlanCalendar(mealRangeStart, mealRangeEnd);

  const queryParams = useMemo(() => ({
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    ...(selectedCalendarId ? { calendarId: selectedCalendarId } : {}),
  }), [range.start, range.end, selectedCalendarId]);
  const { data, isLoading, isError, error, refetch, isFetching } = useCalendarEvents(queryParams);

  // Build merged items from calendar events + tasks + chores + meals
  const allItems = useMemo(() => {
    const items: CalendarItem[] = [];

    // Calendar events
    for (const ev of (data?.items ?? [])) {
      items.push({ ...ev, overlaySource: 'calendar' });
    }

    // Tasks with due dates
    if (showOverlay.tasks) {
      for (const task of (tasksData?.items ?? [])) {
        if (!task.dueAt || task.deletedAt) continue;
        const dueDate = new Date(task.dueAt);
        if (dueDate < range.start || dueDate > range.end) continue;
        items.push({
          id: -10000 - task.id,
          title: `📋 ${task.title}`,
          startAt: task.dueAt,
          endAt: task.dueAt,
          allDay: true,
          timezone: 'UTC',
          description: task.description ?? null,
          overlaySource: 'task',
          attendees: [],
        });
      }
    }

    // Chore assignments
    if (showOverlay.chores) {
      for (const chore of (choresData?.items ?? [])) {
        for (const a of (chore.assignments ?? [])) {
          const wStart = new Date(a.windowStart);
          const wEnd = new Date(a.windowEnd);
          if (wEnd < range.start || wStart > range.end) continue;
          if (a.state === 'COMPLETED' || a.state === 'SKIPPED') continue;
          items.push({
            id: -20000 - a.id,
            title: `🧹 ${chore.title}`,
            startAt: a.windowStart,
            endAt: a.windowEnd,
            allDay: true,
            timezone: 'UTC',
            description: a.assignee ? `Assigned to ${a.assignee.username}` : null,
            overlaySource: 'chore',
            attendees: [],
          });
        }
      }
    }

    // Meal plan entries
    if (showOverlay.meals) {
      const mealEmoji: Record<string, string> = { BREAKFAST: '🌅', LUNCH: '🥗', DINNER: '🍽️', SNACK: '🍎' };
      for (const entry of (mealEntriesData?.items ?? [])) {
        const iso = entry.actualDate + 'T12:00:00Z';
        items.push({
          id: -30000 - entry.id,
          title: `${mealEmoji[entry.mealType] ?? '🍽️'} ${entry.title}`,
          startAt: iso,
          endAt: iso,
          allDay: true,
          timezone: 'UTC',
          description: entry.notes ?? null,
          overlaySource: 'mealplan',
          attendees: [],
        });
      }
    }

    return items;
  }, [data, tasksData, choresData, mealEntriesData, range, showOverlay]);

  const eventsByDate = useMemo(() => groupEventsByDate(allItems), [allItems]);
  const activeDays = useMemo(() => {
    const days: Date[] = [];
    for (let cursor = new Date(range.start); cursor < range.end; cursor = addDays(cursor, 1)) {
      days.push(new Date(cursor));
      if (view === 'day') {
        break;
      }
    }
    return view === 'day' ? days.slice(0, 1) : view === 'week' ? days.slice(0, 7) : days;
  }, [range.start, range.end, view]);
  const monthGrid = useMemo(() => (view === 'month' ? buildMonthGrid(anchorDate) : []), [view, anchorDate]);

  const handleNavigate = (direction: number) => {
    setAnchorDate((current) => {
      if (view === 'day') {
        return addDays(current, direction);
      }
      if (view === 'week') {
        return addDays(current, 7 * direction);
      }
      const next = new Date(current);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const handleToday = () => setAnchorDate(new Date());

  const loadErrorMessage = isError ? (error instanceof Error ? error.message : 'Unable to load calendar events.') : null;

  const viewButtons: Array<{ id: CalendarView; label: string }> = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
  ];

  return (
    <section className="rounded-card bg-card p-6 shadow-soft">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl text-heading">Calendar</h1>
          <p className="text-sm text-muted">Unified day/week/month views with member filters.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-th-border px-4 py-2 text-sm text-secondary">
            <button type="button" onClick={() => handleNavigate(-1)} aria-label="Previous" className="rounded-full px-3 py-2 hover:bg-hover-bg">
              ‹
            </button>
            <span>{rangeLabel}</span>
            <button type="button" onClick={() => handleNavigate(1)} aria-label="Next" className="rounded-full px-3 py-2 hover:bg-hover-bg">
              ›
            </button>
            <button type="button" onClick={handleToday} className="rounded-full border border-th-border px-3 py-2 text-xs font-semibold">
              Today
            </button>
          </div>
          {viewButtons.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rounded-full border px-4 py-2.5 text-sm font-medium ${
                view === option.id ? 'border-btn-primary bg-btn-primary text-btn-primary-text' : 'border-th-border text-secondary'
              }`}
              onClick={() => setView(option.id)}
            >
              {option.label}
            </button>
          ))}
          {linkedCalendars.length > 0 && (
            <select
              className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 transition"
              value={selectedCalendarId ?? ''}
              onChange={(e) => setSelectedCalendarId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All calendars</option>
              {linkedCalendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.displayName}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={`rounded-full border px-3 py-2 text-xs font-medium ${showOverlay.tasks ? 'border-violet-400 bg-violet-100 text-violet-700' : 'border-th-border text-muted'}`}
            onClick={() => setShowOverlay((o) => ({ ...o, tasks: !o.tasks }))}
          >
            📋 Tasks
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-2 text-xs font-medium ${showOverlay.chores ? 'border-amber-400 bg-amber-100 text-amber-700' : 'border-th-border text-muted'}`}
            onClick={() => setShowOverlay((o) => ({ ...o, chores: !o.chores }))}
          >
            🧹 Chores
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-2 text-xs font-medium ${showOverlay.meals ? 'border-green-400 bg-green-100 text-green-700' : 'border-th-border text-muted'}`}
            onClick={() => setShowOverlay((o) => ({ ...o, meals: !o.meals }))}
          >
            🍽️ Meals
          </button>
        </div>
      </header>

      {loadErrorMessage ? (
        <div className="mb-4 flex items-center justify-between rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{loadErrorMessage}</span>
          <button type="button" className="rounded-full border border-red-600 px-3 py-1 text-xs font-semibold" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="animate-pulse rounded-card border border-th-border-light p-4">
              <div className="h-4 w-1/3 rounded bg-skeleton-bright" />
              <div className="mt-2 h-3 w-2/3 rounded bg-hover-bg" />
            </div>
          ))}
        </div>
      ) : view === 'month' ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-faint">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <span key={day}>
                <span className="md:hidden">{day[0]}</span>
                <span className="hidden md:inline">{day}</span>
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthGrid.flat().map(({ date, inMonth }) => {
              const key = dateKey(date);
              const dayEvents = eventsByDate[key] ?? [];
              return (
                <div
                  key={key}
                  className={`min-h-[72px] md:h-32 rounded-card border px-2 py-2 text-xs ${inMonth ? 'border-th-border bg-card' : 'border-th-border-light bg-hover-bg text-faint'}`}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                    <span>{date.getDate()}</span>
                    {dayEvents.length ? <span className="rounded-full bg-btn-primary px-2 py-0.5 text-[10px] text-btn-primary-text">{dayEvents.length}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <p key={event.id} className={`truncate rounded border-l-2 px-1 py-0.5 text-[11px] text-primary ${overlayColors[event.overlaySource]}`}>
                        {event.title}
                      </p>
                    ))}
                    {dayEvents.length > 3 ? <p className="text-[10px] text-faint">+{dayEvents.length - 3} more</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {activeDays.map((day) => {
            const key = dateKey(day);
            const dayEvents = (eventsByDate[key] ?? []).sort(
              (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
            );
            return (
              <div key={key} className="rounded-card border border-th-border-light p-4">
                <header className="mb-3 flex items-center justify-between text-sm text-muted">
                  <span className="font-semibold text-heading">
                    {new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(day)}
                  </span>
                  {isFetching ? <span className="text-xs text-faint">Refreshing…</span> : null}
                </header>
                {dayEvents.length === 0 ? (
                  <p className="text-sm text-faint">No events scheduled.</p>
                ) : (
                  <div className="space-y-2">
                    {dayEvents.map((event) => (
                      <article key={event.id} className={`rounded-card border border-th-border border-l-4 px-3 py-2 ${overlayColors[event.overlaySource]}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-heading">{event.title}</p>
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${overlayBadges[event.overlaySource].color}`}>
                              {overlayBadges[event.overlaySource].label}
                            </span>
                          </div>
                          <span className="text-xs text-muted">{formatTimeRange(event)}</span>
                        </div>
                        {event.location ? <p className="text-xs text-muted">{event.location}</p> : null}
                        {event.description && event.overlaySource !== 'calendar' ? (
                          <p className="text-xs text-muted">{event.description}</p>
                        ) : null}
                        {event.linkedCalendar?.displayName ? (
                          <p className="text-[11px] uppercase tracking-wide text-faint">{event.linkedCalendar.displayName}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default CalendarPage;
