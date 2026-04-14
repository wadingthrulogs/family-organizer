import { useWeather } from '../../hooks/useWeather';
import { useWidgetSize } from '../../hooks/useWidgetSize';

const ICON_MAP: Record<string, string> = {
  '01d': '☀️', '01n': '🌙',
  '02d': '⛅', '02n': '☁️',
  '03d': '☁️', '03n': '☁️',
  '04d': '☁️', '04n': '☁️',
  '09d': '🌧️', '09n': '🌧️',
  '10d': '🌦️', '10n': '🌧️',
  '11d': '⛈️', '11n': '⛈️',
  '13d': '🌨️', '13n': '🌨️',
  '50d': '🌫️', '50n': '🌫️',
};

function weatherEmoji(icon: string): string {
  return ICON_MAP[icon] || '🌡️';
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export default function WeatherWidget() {
  const { data, isLoading, isError, error } = useWeather();
  const { ref, width, height, compact, tiny, baseFontSize } = useWidgetSize();

  if (!data && !isLoading && !isError) {
    return (
      <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl p-2 bg-[var(--color-card)] border border-[var(--color-border)] text-center h-full overflow-hidden flex items-center justify-center">
        <p className="text-[var(--color-text-secondary)] text-[1em]">
          🌤️ Set location in <strong>Settings</strong>
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl p-2 bg-[var(--color-card)] border border-[var(--color-border)] text-center animate-pulse h-full overflow-hidden flex items-center justify-center">
        <p className="text-[var(--color-text-secondary)]">Loading…</p>
      </div>
    );
  }

  if (isError || !data) {
    const msg = (error as any)?.response?.data?.error?.message || 'Weather unavailable';
    return (
      <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl p-2 bg-[var(--color-card)] border border-[var(--color-border)] text-center h-full overflow-hidden flex items-center justify-center">
        <p className="text-red-400 text-[1em]">⚠️ {msg}</p>
      </div>
    );
  }

  const unitSymbol = data.units === 'metric' ? '°C' : '°F';
  const windUnit = data.units === 'metric' ? 'm/s' : 'mph';

  const isTall = height > 200;
  const showForecast = height > 120 && width > 180;
  const forecastCount = width > 400 ? 5 : width > 250 ? 4 : 3;
  const showDetails = isTall && width > 180;

  // Temperature hero font
  const tempFontSize = Math.max(16, Math.min(72, width * 0.14, height * 0.32));

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl p-3 bg-[var(--color-card)] border border-[var(--color-border)] h-full overflow-hidden flex flex-col gap-2">

      {/* ── Current conditions row ── */}
      <div className="flex items-center gap-3 shrink-0">
        <span style={{ fontSize: `${tempFontSize * 0.85}px` }} className="leading-none shrink-0">
          {weatherEmoji(data.current.icon)}
        </span>
        <div className="min-w-0 flex-1">
          <span
            style={{ fontSize: `${tempFontSize}px`, fontVariantNumeric: 'tabular-nums' }}
            className="font-bold text-[var(--color-text)] leading-none block"
          >
            {data.current.temp}{unitSymbol}
          </span>
          {!tiny && (
            <p className="text-[0.9em] text-[var(--color-text-secondary)] capitalize truncate mt-1">
              {data.current.description}
            </p>
          )}
          {!tiny && (
            <p className="text-[0.85em] text-[var(--color-text-secondary)] truncate">
              {data.location} · H:{data.current.high}° L:{data.current.low}°
            </p>
          )}
        </div>
      </div>

      {/* ── Detail chips (when tall enough) ── */}
      {showDetails && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 shrink-0 text-[0.9em] text-[var(--color-text-secondary)] justify-center">
          <span>Feels {data.current.feelsLike}{unitSymbol}</span>
          <span>💧 {data.current.humidity}%</span>
          <span>💨 {data.current.windSpeed} {windUnit}</span>
        </div>
      )}

      {/* ── Forecast tiles ── */}
      {showForecast && (
        <div className="flex-1 min-h-0 flex flex-col justify-end">
          <div className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${forecastCount}, minmax(0, 1fr))` }}>
            {data.daily.slice(0, forecastCount).map((d) => (
              <div
                key={d.date}
                className="flex flex-col items-center gap-1 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg)]/60 p-2"
              >
                <span className="text-[0.85em] font-medium text-[var(--color-text-secondary)] leading-none">
                  {dayLabel(d.date)}
                </span>
                <span className="text-[1.4em] leading-none">{weatherEmoji(d.icon)}</span>
                <span className="text-[0.85em] text-[var(--color-text)] leading-none tabular-nums">
                  <span className="font-semibold">{d.high}°</span>
                  <span className="text-[var(--color-text-secondary)]"> {d.low}°</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
