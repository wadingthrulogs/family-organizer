import { useState, useEffect, useMemo } from 'react';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useMealPlanCalendar } from '../../hooks/useMealPlans';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import type { CalendarEvent } from '../../types/calendar';

type EventRange = 'day' | 'week' | '30days';
const RANGE_KEY = 'dashboard-event-range';

function getRange(range: EventRange): { start: string; end: string } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(startOfDay);
  switch (range) {
    case 'day':
      end.setDate(end.getDate() + 1);
      break;
    case 'week':
      end.setDate(end.getDate() + 7);
      break;
    case '30days':
      end.setDate(end.getDate() + 30);
      break;
  }
  return { start: startOfDay.toISOString(), end: end.toISOString() };
}

function buildEventMap(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = ev.startAt ? new Date(ev.startAt).toDateString() : 'NO_DATE';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  for (const [, bucket] of map) {
    bucket.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }
  return map;
}

/* ─── Today ─── */
function EventsToday({ events, width }: { events: CalendarEvent[]; width: number }) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  if (sorted.length === 0)
    return <p className="text-[var(--color-text-secondary)] text-[0.9em]">No events today.</p>;

  const cols = width > 900 ? 2 : 1;
  return (
    <ul
      className="grid gap-2 flex-1 min-h-0 overflow-y-auto"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {sorted.map((ev) => (
        <li
          key={ev.id}
          className="flex items-center gap-3 min-h-[56px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2"
        >
          {!ev.allDay && (
            <span className="font-mono text-[0.85em] text-[var(--color-text-secondary)] w-[70px] shrink-0 text-right">
              {new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <span className="font-medium text-[var(--color-text)] truncate text-[1em] flex-1">
            {ev.title}
          </span>
          {ev.location && (
            <span className="text-[0.75em] text-[var(--color-text-secondary)] truncate max-w-[30%] shrink-0">
              {ev.location}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ─── Week ─── */
function EventsWeek({ events, width }: { events: CalendarEvent[]; width: number }) {
  const visibleDays = width > 500 ? 7 : width > 300 ? 5 : width > 180 ? 3 : 2;
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const arr: Date[] = [];
    for (let i = 0; i < visibleDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [visibleDays]);

  const eventMap = useMemo(() => buildEventMap(events), [events]);

  return (
    <div className={`grid gap-1.5 flex-1 min-h-0`} style={{ gridTemplateColumns: `repeat(${visibleDays}, minmax(0, 1fr))` }}>
      {days.map((day) => {
        const dateKey = day.toDateString();
        const bucket = eventMap.get(dateKey) ?? [];
        const isToday = day.toDateString() === new Date().toDateString();
        return (
          <div
            key={dateKey}
            className={`rounded-xl border p-1.5 flex flex-col min-h-0 overflow-hidden ${
              isToday
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                : 'border-[var(--color-border)] bg-[var(--color-bg)]'
            }`}
          >
            <div className="flex flex-col items-center mb-1 shrink-0">
              <p className={`text-[0.95em] font-bold uppercase tracking-wide ${
                isToday ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'
              }`}>
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
              <span className={`text-[0.8em] mt-0.5 ${
                isToday
                  ? 'inline-flex items-center justify-center w-[1.8em] h-[1.8em] rounded-full bg-[var(--color-accent)] text-white font-bold'
                  : 'text-[var(--color-text-secondary)]'
              }`}>
                {day.getDate()}
              </span>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto min-h-0">
              {bucket.length === 0 ? (
                <p className="text-[0.55em] text-[var(--color-text-secondary)] text-center mt-1">—</p>
              ) : (
                bucket.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-lg border-l-[3px] border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-1 text-[0.8em] leading-tight"
                  >
                    <span className="font-medium text-[var(--color-text)] truncate block">
                      {ev.allDay ? '' : `${new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} `}
                      {ev.title}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── 30-Day Calendar ─── */
function EventsCalendar({ events, compact, tiny }: { events: CalendarEvent[]; compact: boolean; tiny: boolean }) {
  const { weeks, monthLabel } = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const gridEnd = new Date(lastOfMonth);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const allDays: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      allDays.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const weeks: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }

    const monthLabel = firstOfMonth.toLocaleDateString(undefined, {
      month: compact ? 'short' : 'long',
      year: 'numeric',
    });

    return { weeks, monthLabel };
  }, [compact]);

  const eventMap = useMemo(() => buildEventMap(events), [events]);
  const todayStr = new Date().toDateString();
  const currentMonth = new Date().getMonth();
  const maxEvents = tiny ? 1 : compact ? 2 : 3;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <p className="text-[0.9em] font-semibold text-[var(--color-text-secondary)] text-center mb-1 shrink-0">
        {monthLabel}
      </p>
      {!tiny && (
        <div className="grid grid-cols-7 gap-px mb-1 shrink-0">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div
              key={i}
              className="text-[0.55em] font-semibold text-[var(--color-text-secondary)] text-center py-0.5 uppercase"
            >
              {d}
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-px flex-1 min-h-0 overflow-y-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-px">
            {week.map((day) => {
              const dateKey = day.toDateString();
              const isToday = dateKey === todayStr;
              const isCurrentMonth = day.getMonth() === currentMonth;
              const bucket = eventMap.get(dateKey) ?? [];

              return (
                <div
                  key={dateKey}
                  className={`${compact ? 'min-h-[36px]' : 'min-h-[52px]'} rounded-lg border p-0.5 ${
                    isToday
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                  } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                >
                  <p
                    className={`text-[0.8em] font-semibold mb-0 ${
                      isToday ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {day.getDate()}
                  </p>
                  {!tiny && (
                    <div className="space-y-0.5 overflow-hidden">
                      {bucket.slice(0, maxEvents).map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded bg-[var(--color-accent)]/15 px-0.5 py-px text-[0.8em] font-medium text-[var(--color-text)] truncate leading-tight"
                          title={`${new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${ev.title}`}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {bucket.length > maxEvents && (
                        <p className="text-[0.45em] text-[var(--color-text-secondary)] pl-0.5">
                          +{bucket.length - maxEvents}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Events Widget ─── */
export default function EventsWidget() {
  const { ref, compact, tiny, width, height, baseFontSize } = useWidgetSize();

  const [range, setRange] = useState<EventRange>(() => {
    return (localStorage.getItem(RANGE_KEY) as EventRange) || 'week';
  });

  useEffect(() => {
    localStorage.setItem(RANGE_KEY, range);
  }, [range]);

  const { start, end } = getRange(range);
  const { data: eventsData } = useCalendarEvents({ start, end });

  const mealStart = start.slice(0, 10);
  const mealEnd = new Date(new Date(end).getTime() - 1).toISOString().slice(0, 10);
  const { data: mealEntriesData } = useMealPlanCalendar(mealStart, mealEnd);

  const mealEmoji: Record<string, string> = { BREAKFAST: '🌅', LUNCH: '🥗', DINNER: '🍽️', SNACK: '🍎' };
  const mealLocalHour: Record<string, string> = { BREAKFAST: 'T08:00:00', LUNCH: 'T12:00:00', DINNER: 'T18:00:00', SNACK: 'T15:00:00' };
  const events: CalendarEvent[] = useMemo(() => {
    const base: CalendarEvent[] = eventsData?.items ?? [];
    const meals: CalendarEvent[] = (mealEntriesData?.items ?? []).map((entry) => {
      const localTime = mealLocalHour[entry.mealType] ?? 'T12:00:00';
      const startAt = entry.actualDate + localTime;
      return {
        id: -30000 - entry.id,
        title: `${mealEmoji[entry.mealType] ?? '🍽️'} ${entry.title}`,
        startAt,
        endAt: startAt,
        allDay: true,
        timezone: 'local',
        attendees: [],
      };
    });
    return [...base, ...meals];
  }, [eventsData, mealEntriesData]);

  const rangeButtons: { label: string; value: EventRange }[] = [
    { label: 'Today', value: 'day' },
    { label: 'Week', value: 'week' },
    { label: '30d', value: '30days' },
  ];

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className={`rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] ${compact ? 'p-2' : 'p-5'} h-full overflow-hidden flex flex-col`}>
      {height > 80 && (
        <div className={`${compact ? 'mb-1' : 'mb-4'} flex items-center justify-between flex-wrap gap-1 shrink-0`}>
          {!tiny && (
            <h2 className="text-[1.2em] font-semibold text-[var(--color-text)]">📅 Events</h2>
          )}
          <div className="flex items-center gap-0.5">
            {rangeButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setRange(btn.value)}
                style={{ touchAction: 'manipulation' }}
                className={`min-h-[48px] px-5 text-[0.85em] rounded-xl font-medium transition-colors touch-manipulation ${
                  range === btn.value
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {range === 'day' && <EventsToday events={events} width={width} />}
        {range === 'week' && <EventsWeek events={events} width={width} />}
        {range === '30days' && <EventsCalendar events={events} compact={compact} tiny={tiny} />}
      </div>

      {!compact && (
        <div className="mt-3 flex justify-end shrink-0">
          <a
            href="/calendar"
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center justify-center min-h-[44px] px-4 text-[0.85em] font-medium text-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent)]/10 transition-colors touch-manipulation"
          >
            View full calendar →
          </a>
        </div>
      )}
    </div>
  );
}
