import { useState, useEffect, useMemo } from 'react';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
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
function EventsToday({ events }: { events: CalendarEvent[] }) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  if (sorted.length === 0)
    return <p className="text-[var(--color-text-secondary)] text-[0.9em]">No events today.</p>;

  return (
    <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto">
      {sorted.map((ev) => (
        <li
          key={ev.id}
          className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-[0.8em] py-[0.5em]"
        >
          <span className="font-medium text-[var(--color-text)] truncate text-[0.9em]">
            {new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
            {ev.title}
          </span>
          {ev.location && (
            <span className="text-[0.6em] text-[var(--color-text-secondary)] truncate max-w-[100px] shrink-0 ml-1">
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
            <p
              className={`text-[0.6em] font-semibold text-center mb-1 shrink-0 ${
                isToday ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'
              }`}
            >
              {day.toLocaleDateString(undefined, { weekday: 'short' })}
              <br />
              <span className="font-bold text-[var(--color-text)] text-[1.8em]">{day.getDate()}</span>
            </p>
            <div className="flex-1 space-y-0.5 overflow-y-auto min-h-0">
              {bucket.length === 0 ? (
                <p className="text-[0.55em] text-[var(--color-text-secondary)] text-center mt-1">—</p>
              ) : (
                bucket.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-lg bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[0.6em] leading-tight"
                  >
                    <span className="font-medium text-[var(--color-text)] truncate block">{ev.title}</span>
                    <span className="text-[var(--color-text-secondary)]">
                      {new Date(ev.startAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
                    className={`text-[0.6em] font-semibold mb-0 ${
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
                          className="rounded bg-[var(--color-accent)]/15 px-0.5 py-px text-[0.5em] font-medium text-[var(--color-text)] truncate leading-tight"
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
  const events = eventsData?.items ?? [];

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
                className={`px-[0.6em] py-[0.2em] text-[0.7em] rounded-lg font-medium transition-colors ${
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
        {range === 'day' && <EventsToday events={events} />}
        {range === 'week' && <EventsWeek events={events} width={width} />}
        {range === '30days' && <EventsCalendar events={events} compact={compact} tiny={tiny} />}
      </div>

      {!compact && (
        <div className="mt-3 text-right shrink-0">
          <a href="/calendar" className="text-[0.8em] text-[var(--color-accent)] hover:underline">
            View full calendar →
          </a>
        </div>
      )}
    </div>
  );
}
