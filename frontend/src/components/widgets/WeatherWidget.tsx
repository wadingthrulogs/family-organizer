import React from 'react';
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

  // Layout decisions based on actual pixel dimensions
  const isWide = width > 280;
  const isTall = height > 200;
  const showForecast = height > 100 || width > 250;
  const forecastCount = width > 400 ? 5 : width > 250 ? 5 : width > 140 ? 3 : 3;
  const forecastHorizontal = height < 160 && width > 250;
  const showDetails = isTall && width > 160;

  // Match ClockWidget scaling for the temperature text
  const tempFontSize = Math.max(14, Math.min(72, width * 0.12, height * 0.3));

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl p-2 bg-[var(--color-card)] border border-[var(--color-border)] h-full overflow-hidden flex flex-col gap-0.5">

      {/* ── Current conditions row ── */}
      <div className={`flex items-center gap-1 shrink-0 ${forecastHorizontal ? '' : 'justify-center'}`}>
        <span style={{ fontSize: `${tempFontSize * 0.7}px` }} className="leading-none shrink-0">{weatherEmoji(data.current.icon)}</span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span
              style={{ fontSize: `${tempFontSize}px` }}
              className="font-bold text-[var(--color-text)] leading-none"
            >
              {data.current.temp}{unitSymbol}
            </span>
            {!tiny && (
              <span className="text-[0.6em] text-[var(--color-text-secondary)] capitalize truncate">
                {data.current.description}
              </span>
            )}
          </div>
          {!tiny && (
            <p className="text-[0.55em] text-[var(--color-text-secondary)] truncate leading-tight">
              {data.location} · H:{data.current.high}° L:{data.current.low}°
            </p>
          )}
        </div>
        {/* Inline details when wide enough but not tall enough for separate row */}
        {isWide && !isTall && !tiny && (
          <div className="ml-auto text-right text-[0.55em] text-[var(--color-text-secondary)] shrink-0 leading-snug">
            <p>Feels {data.current.feelsLike}{unitSymbol}</p>
            <p>💧{data.current.humidity}% 💨{data.current.windSpeed}{windUnit}</p>
          </div>
        )}
      </div>

      {/* ── Detail chips (when tall) ── */}
      {showDetails && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 shrink-0 text-[0.55em] text-[var(--color-text-secondary)] justify-center">
          <span>Feels {data.current.feelsLike}{unitSymbol}</span>
          <span>💧 {data.current.humidity}%</span>
          <span>💨 {data.current.windSpeed} {windUnit}</span>
        </div>
      )}

      {/* ── Forecast ── */}
      {showForecast && (
        <div className={`flex-1 min-h-0 flex ${forecastHorizontal ? 'items-center' : 'flex-col justify-end'}`}>
          {!forecastHorizontal && <div className="border-t border-[var(--color-border)] mb-1" />}
          <div className="grid text-center w-full"
            style={{ gridTemplateColumns: `repeat(${forecastCount}, minmax(0, 1fr))`, gap: '2px' }}
          >
            {data.daily.slice(0, forecastCount).map((d) => (
              <div key={d.date} className="flex flex-col items-center py-0.5">
                <span className="text-[0.55em] font-medium text-[var(--color-text-secondary)] leading-none">{dayLabel(d.date)}</span>
                <span className="text-[0.9em] leading-tight my-px">{weatherEmoji(d.icon)}</span>
                <span className="text-[0.55em] text-[var(--color-text)] leading-none">
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
