import { useState, useEffect, useCallback, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { getWidget } from '../components/widgets/widgetRegistry';
import type { DashboardConfig } from '../types/dashboard';
import { loadDashboardConfig } from '../types/dashboard';
import { useUserPreferences } from '../hooks/useUserPreferences';

const AUTO_REFRESH_MS = 60_000; // 1 minute
const CURSOR_HIDE_MS = 5_000;  // 5 seconds

function KioskPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<DashboardConfig>(loadDashboardConfig);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [showExit, setShowExit] = useState(true);
  const { width, mounted, containerRef } = useContainerWidth();
  const { data: prefs } = useUserPreferences();

  // Sync from server when preferences load
  useEffect(() => {
    if (prefs?.dashboardConfig?.slots?.length) {
      setConfig(prefs.dashboardConfig);
    }
  }, [prefs?.dashboardConfig]);

  const layouts = config.slots.map((s) => s.layout);

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

  // Apply kiosk class to root
  useEffect(() => {
    document.documentElement.classList.add('kiosk-mode');
    return () => document.documentElement.classList.remove('kiosk-mode');
  }, []);

  // Noop for layout changes (read-only in kiosk)
  const handleLayoutChange = useCallback((_layout: Layout[]) => {}, []);

  return (
    <div
      className={`min-h-screen w-full bg-page p-4 ${cursorHidden ? 'cursor-hidden' : ''}`}
    >
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

      {config.slots.length === 0 ? (
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-[var(--color-text-muted)] text-lg">
            No widgets configured. Set up your dashboard first.
          </p>
        </div>
      ) : (
        <div ref={containerRef} className={`w-full ${config.preferences?.hideWidgetBorders ? 'dashboard-no-borders' : ''}`}>
          {mounted && (
            <ResponsiveGridLayout
              className="dashboard-grid"
              width={width}
              layouts={{ lg: layouts }}
              cols={{ lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 }}
              rowHeight={120}
              isDraggable={false}
              isResizable={false}
              compactType="vertical"
              margin={[16, 16]}
              onLayoutChange={handleLayoutChange}
            >
            {config.slots.map((slot) => {
              const def = getWidget(slot.widgetId);
              const Widget = def?.component;
              return (
                <div key={slot.layout.i}>
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
