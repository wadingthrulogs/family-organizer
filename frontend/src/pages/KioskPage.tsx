import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
// Note: useMemo was removed — inline getResponsiveLayouts avoids RGL deepEqual mismatch
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveGridLayout, useContainerWidth, noCompactor } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { getWidget } from '../components/widgets/widgetRegistry';
import type { DashboardConfig, DashboardWidgetSlot } from '../types/dashboard';
import { loadDashboardConfig, saveDashboardConfig } from '../types/dashboard';
import { useUserPreferences, useUpdateUserPreferencesMutation } from '../hooks/useUserPreferences';
import { getResponsiveLayouts } from '../lib/dashboardLayouts';

const AUTO_REFRESH_MS = 120_000; // 2 minutes — family kiosks don't need 60s freshness
const CURSOR_HIDE_MS = 5_000;  // 5 seconds

// Targeted invalidation keys for the kiosk auto-refresh tick. We deliberately
// skip ∞-staleTime data (settings, userPreferences, googleIntegration,
// linkedCalendars) and self-polling queries (weather already has its own 5m
// refetchInterval). See perf-audit-2026-04 §3.
const KIOSK_REFRESH_KEYS = [
  ['tasks'],
  ['chores'],
  ['calendarEvents'],
  ['groceryLists'],
  ['inventory'],
  ['reminders'],
  ['mealPlanCalendar'],
] as const;

interface RecentlyRemovedKiosk {
  slot: DashboardWidgetSlot;
  index: number;
}

const KIOSK_UNDO_TIMEOUT_MS = 5000;

function KioskPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<DashboardConfig>(loadDashboardConfig);
  const [editMode, setEditMode] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [showExit, setShowExit] = useState(true);
  const [recentlyRemoved, setRecentlyRemoved] = useState<RecentlyRemovedKiosk | null>(null);
  const { width, mounted, containerRef } = useContainerWidth();
  const { data: prefs } = useUserPreferences();
  const updatePrefs = useUpdateUserPreferencesMutation();
  const serverSynced = useRef(false);
  const editModeRef = useRef(editMode);
  const widthRef = useRef(width);
  const undoTimerRef = useRef<number | null>(null);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { widthRef.current = width; }, [width]);
  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }, []);


  // Sync from server when preferences load (once per mount, so the 60s
  // auto-refresh doesn't clobber an in-progress local edit).
  useEffect(() => {
    if (prefs?.dashboardConfig && !serverSynced.current) {
      serverSynced.current = true;
      if (prefs.dashboardConfig.slots?.length) {
        setConfig(prefs.dashboardConfig);
      }
    }
  }, [prefs?.dashboardConfig]);

  const persistConfig = useCallback((cfg: DashboardConfig) => {
    saveDashboardConfig(cfg);
    updatePrefs.mutate({ dashboardConfig: cfg });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Auto-refresh only the widget-backing queries, not every query in cache.
  // Previous behavior (queryClient.invalidateQueries() with no args) wiped
  // settings/prefs/google integration too, causing 1,440 full-cache refetches
  // per day. See perf-audit-2026-04 §3.
  useEffect(() => {
    const interval = setInterval(() => {
      KIOSK_REFRESH_KEYS.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
      });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [queryClient]);

  // Wake Lock — prevent screen from sleeping
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let active = true;

    const requestLock = async () => {
      try {
        if (navigator.wakeLock && active) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake Lock not supported or failed
      }
    };

    requestLock();

    // Re-acquire on visibility change (e.g., tab switch)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') requestLock();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      wakeLock?.release();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Auto-hide cursor after inactivity
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      setCursorHidden(false);
      setShowExit(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setCursorHidden(true);
        setShowExit(false);
      }, CURSOR_HIDE_MS);
    };

    resetTimer();
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('touchstart', resetTimer);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, []);

  const bgImageUrl = prefs?.dashboardConfig?.preferences?.backgroundImageUrl;
  const bgOpacity = prefs?.dashboardConfig?.preferences?.backgroundOverlay ?? 1;

  // Apply kiosk class to root
  useEffect(() => {
    document.documentElement.classList.add('kiosk-mode');
    return () => document.documentElement.classList.remove('kiosk-mode');
  }, []);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    if (!editModeRef.current) return;
    if (widthRef.current < 1280) return;
    setConfig((prev) => {
      const next: DashboardConfig = {
        ...prev,
        slots: prev.slots.map((slot) => {
          const updated = newLayout.find((l) => l.i === slot.layout.i);
          if (!updated) return slot;
          return { ...slot, layout: { ...slot.layout, x: updated.x, y: updated.y, w: updated.w, h: updated.h } };
        }),
      };
      persistConfig(next);
      return next;
    });
  }, [persistConfig]);

  const handleRemoveWidget = useCallback((slotKey: string) => {
    setConfig((prev) => {
      const index = prev.slots.findIndex((s) => s.layout.i === slotKey);
      if (index === -1) return prev;
      const removed = prev.slots[index];
      const next: DashboardConfig = { ...prev, slots: prev.slots.filter((_, i) => i !== index) };
      persistConfig(next);
      setRecentlyRemoved({ slot: removed, index });
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => setRecentlyRemoved(null), KIOSK_UNDO_TIMEOUT_MS);
      return next;
    });
  }, [persistConfig]);

  const handleUndoRemove = useCallback(() => {
    setRecentlyRemoved((current) => {
      if (!current) return null;
      setConfig((prev) => {
        const slots = [...prev.slots];
        const insertAt = Math.min(current.index, slots.length);
        slots.splice(insertAt, 0, current.slot);
        const next: DashboardConfig = { ...prev, slots };
        persistConfig(next);
        return next;
      });
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      return null;
    });
  }, [persistConfig]);

  return (
    <div
      className={`min-h-screen w-full bg-page p-4 ${cursorHidden ? 'cursor-hidden' : ''}`}
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      {bgImageUrl && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${bgImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            opacity: bgOpacity,
            zIndex: 0,
          }}
        />
      )}
      {/* Exit button — fades in on mouse movement */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className={`fixed right-4 z-50 inline-flex items-center min-h-[48px] rounded-full bg-black/30 px-5 text-base text-white backdrop-blur-sm hover:bg-black/50 transition-all touch-manipulation active:scale-95 ${
          showExit ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        ✕ Exit
      </button>

      {/* Edit layout button — always visible in edit mode, fades with cursor otherwise */}
      <button
        type="button"
        onClick={() => setEditMode((v) => !v)}
        className={`fixed left-4 z-50 inline-flex items-center min-h-[48px] rounded-full px-5 text-base backdrop-blur-sm transition-all touch-manipulation active:scale-95 ${
          editMode
            ? 'bg-[var(--color-accent)] text-white opacity-100'
            : `bg-black/30 text-white hover:bg-black/50 ${showExit ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
        }`}
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        {editMode ? '✓ Done editing' : '✏️ Edit layout'}
      </button>

      {config.slots.length === 0 ? (
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-[var(--color-text-muted)] text-lg">
            No widgets configured. Set up your dashboard first.
          </p>
        </div>
      ) : (
        <div ref={containerRef} className={`relative w-full overflow-x-hidden ${config.preferences?.hideWidgetBorders ? 'dashboard-no-borders' : ''} ${!editMode ? '[&_.react-resizable-handle]:!hidden' : ''}`}>
          {mounted && (
            <ResponsiveGridLayout
              className="dashboard-grid"
              width={width}
              layouts={getResponsiveLayouts(config.slots)}
              breakpoints={{ lg: 1280, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 }}
              rowHeight={120}
              dragConfig={{ enabled: editMode, handle: editMode ? '.widget-drag-handle' : undefined }}
              resizeConfig={{ enabled: editMode, handles: editMode ? ['se', 'sw', 'ne', 'nw'] : [] }}
              compactor={noCompactor}
              margin={[16, 16]}
              onDragStop={handleLayoutChange}
              onResizeStop={handleLayoutChange}
            >
            {config.slots.map((slot) => {
              const def = getWidget(slot.widgetId);
              const Widget = def?.component;
              return (
                <div key={slot.layout.i} className="relative h-full">
                  {editMode ? (
                    <div className="flex flex-col h-full">
                      <div
                        className="widget-drag-handle flex items-center gap-2 px-3 py-2 bg-[var(--color-accent)] text-white rounded-t-2xl text-sm select-none shrink-0"
                        style={{ touchAction: 'none' }}
                      >
                        <span className="text-base leading-none" aria-hidden>⠿</span>
                        <span className="flex-1 truncate font-semibold">{def?.label ?? slot.widgetId}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemoveWidget(slot.layout.i); }}
                          onPointerDown={(e) => e.stopPropagation()}
                          aria-label={`Remove ${def?.label ?? 'widget'}`}
                          className="rounded-full bg-white/20 hover:bg-red-500 w-8 h-8 flex items-center justify-center text-white text-base font-bold transition-colors touch-manipulation active:scale-95"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex-1 min-h-0">
                        <Suspense
                          fallback={
                            <div className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-5 animate-pulse h-full" />
                          }
                        >
                          {Widget ? <Widget /> : <EmptySlot />}
                        </Suspense>
                      </div>
                    </div>
                  ) : (
                    <Suspense
                      fallback={
                        <div className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-5 animate-pulse h-full" />
                      }
                    >
                      {Widget ? <Widget /> : null}
                    </Suspense>
                  )}
                </div>
              );
            })}
            </ResponsiveGridLayout>
          )}
        </div>
      )}

      {recentlyRemoved && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 flex items-center gap-3 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] shadow-xl px-5 py-3">
          <span className="text-sm text-[var(--color-text)]">
            Removed <strong>{getWidget(recentlyRemoved.slot.widgetId)?.label ?? 'widget'}</strong>
          </span>
          <button
            type="button"
            onClick={handleUndoRemove}
            className="min-h-[40px] px-4 rounded-full bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 active:scale-95 touch-manipulation"
          >
            Undo
          </button>
        </div>
      )}

    </div>
  );
}

function EmptySlot() {
  return (
    <div className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] border-dashed p-5 h-full flex items-center justify-center">
      <p className="text-sm text-[var(--color-text-secondary)]">Widget not found</p>
    </div>
  );
}

export default KioskPage;
