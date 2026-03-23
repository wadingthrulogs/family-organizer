import { useState, useEffect, useCallback, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { getWidget } from '../components/widgets/widgetRegistry';
import type { DashboardConfig } from '../types/dashboard';
import { loadDashboardConfig, saveDashboardConfig } from '../types/dashboard';
import { useUserPreferences, useUpdateUserPreferencesMutation } from '../hooks/useUserPreferences';

const AUTO_REFRESH_MS = 60_000; // 1 minute
const CURSOR_HIDE_MS = 5_000;  // 5 seconds

function KioskPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<DashboardConfig>(loadDashboardConfig);
  const [editMode, setEditMode] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [showExit, setShowExit] = useState(true);
  const { width, mounted, containerRef } = useContainerWidth();
  const { data: prefs } = useUserPreferences();
  const updatePrefs = useUpdateUserPreferencesMutation();

  // Sync from server when preferences load
  useEffect(() => {
    if (prefs?.dashboardConfig?.slots?.length) {
      setConfig(prefs.dashboardConfig);
    }
  }, [prefs?.dashboardConfig]);

  const persistConfig = useCallback((cfg: DashboardConfig) => {
    saveDashboardConfig(cfg);
    updatePrefs.mutate({ dashboardConfig: cfg });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numGridRows = Math.max(6,
    config.slots.reduce((max, s) => Math.max(max, s.layout.y + s.layout.h), 0) + 2
  );

  // Auto-refresh all queries periodically
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries();
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
    if (!editMode) return;
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
  }, [editMode, persistConfig]);

  return (
    <div
      className={`min-h-screen w-full bg-page p-4 ${cursorHidden ? 'cursor-hidden' : ''}`}
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
        className={`fixed top-4 right-4 z-50 rounded-full bg-black/30 px-4 py-2 text-sm text-white backdrop-blur-sm hover:bg-black/50 transition-all ${
          showExit ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        ✕ Exit
      </button>

      {/* Edit layout button — always visible in edit mode, fades with cursor otherwise */}
      <button
        type="button"
        onClick={() => setEditMode((v) => !v)}
        className={`fixed top-4 left-4 z-50 rounded-full px-4 py-2 text-sm backdrop-blur-sm transition-all ${
          editMode
            ? 'bg-[var(--color-accent)] text-white opacity-100'
            : `bg-black/30 text-white hover:bg-black/50 ${showExit ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
        }`}
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
        <div ref={containerRef} className={`relative w-full ${config.preferences?.hideWidgetBorders ? 'dashboard-no-borders' : ''} ${!editMode ? '[&_.react-resizable-handle]:!hidden' : ''}`}>
          {mounted && editMode && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(12, 1fr)',
                gridAutoRows: '120px',
                gap: '16px',
                zIndex: 0,
              }}
            >
              {Array.from({ length: 12 * numGridRows }).map((_, i) => (
                <div
                  key={i}
                  style={{ border: '1px dashed rgba(128,128,128,0.2)', borderRadius: '8px' }}
                />
              ))}
            </div>
          )}
          {mounted && (
            <ResponsiveGridLayout
              className="dashboard-grid"
              width={width}
              layouts={{ lg: config.slots.map((s) => s.layout) }}
              cols={{ lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 }}
              rowHeight={120}
              isDraggable={editMode}
              isResizable={editMode}
              resizeHandles={editMode ? ['se'] : []}
              compactType="vertical"
              draggableHandle=".widget-drag-handle"
              margin={[16, 16]}
              onLayoutChange={handleLayoutChange}
            >
            {config.slots.map((slot) => {
              const def = getWidget(slot.widgetId);
              const Widget = def?.component;
              return (
                <div key={slot.layout.i} className="relative h-full">
                  {editMode && (
                    <div className="widget-drag-handle absolute top-2 left-2 z-10 cursor-grab rounded-md bg-black/20 px-1.5 py-0.5 text-xs text-white backdrop-blur-sm select-none">
                      ⠿
                    </div>
                  )}
                  <Suspense
                    fallback={
                      <div className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-5 animate-pulse h-full" />
                    }
                  >
                    {Widget ? <Widget /> : null}
                  </Suspense>
                </div>
              );
            })}
            </ResponsiveGridLayout>
          )}
        </div>
      )}
    </div>
  );
}

export default KioskPage;
