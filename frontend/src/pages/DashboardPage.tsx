import { useState, Suspense, useCallback, useEffect, useRef } from 'react';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import DashboardSettingsBar from '../components/widgets/DashboardSettings';
import { getWidget } from '../components/widgets/widgetRegistry';
import type { DashboardWidgetSlot, DashboardConfig } from '../types/dashboard';
import { loadDashboardConfig, saveDashboardConfig, DEFAULT_DASHBOARD_CONFIG } from '../types/dashboard';
import { useUserPreferences, useUpdateUserPreferencesMutation } from '../hooks/useUserPreferences';
import { getResponsiveLayouts } from '../lib/dashboardLayouts';

function DashboardPage() {
  const [config, setConfig] = useState<DashboardConfig>(loadDashboardConfig);
  const [editMode, setEditMode] = useState(false);
  const [currentBreakpoint, setCurrentBreakpoint] = useState('lg');
  const { width, mounted, containerRef } = useContainerWidth();
  const { data: prefs } = useUserPreferences();
  const updatePrefs = useUpdateUserPreferencesMutation();
  const serverSynced = useRef(false);
  const editModeRef = useRef(editMode);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  // When server preferences load, use server dashboard config (server wins)
  useEffect(() => {
    if (prefs?.dashboardConfig && !serverSynced.current) {
      serverSynced.current = true;
      const serverConfig = prefs.dashboardConfig;
      if (serverConfig.slots?.length) {
        setConfig(serverConfig);
        saveDashboardConfig(serverConfig);
      }
    }
  }, [prefs?.dashboardConfig]);

  // Helper: save to both localStorage and server
  const persistConfig = useCallback((cfg: DashboardConfig) => {
    saveDashboardConfig(cfg);
    updatePrefs.mutate({ dashboardConfig: cfg });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      // Only persist when the user is actively editing; ignore RGL recomputations
      // (compaction, window resize) that fire outside of edit mode.
      if (!editModeRef.current) return;
      // Only persist layout changes made on the desktop (lg) breakpoint.
      // Mobile breakpoints use derived stacked layouts and should never
      // overwrite the user's saved desktop arrangement.
      if (currentBreakpoint !== 'lg') return;
      setConfig((prev) => {
        const next: DashboardConfig = {
          ...prev,
          slots: prev.slots.map((slot) => {
            const updated = newLayout.find((l) => l.i === slot.layout.i);
            if (!updated) return slot;
            return {
              ...slot,
              layout: { ...slot.layout, x: updated.x, y: updated.y, w: updated.w, h: updated.h },
            };
          }),
        };
        persistConfig(next);
        return next;
      });
    },
    [persistConfig, currentBreakpoint]
  );

  const handleAddWidget = useCallback((slot: DashboardWidgetSlot) => {
    setConfig((prev) => {
      const next: DashboardConfig = { ...prev, slots: [...prev.slots, slot] };
      persistConfig(next);
      return next;
    });
  }, [persistConfig]);

  const handleRemoveWidget = useCallback((slotKey: string) => {
    setConfig((prev) => {
      const next: DashboardConfig = { ...prev, slots: prev.slots.filter((s) => s.layout.i !== slotKey) };
      persistConfig(next);
      return next;
    });
  }, [persistConfig]);

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_DASHBOARD_CONFIG);
    persistConfig(DEFAULT_DASHBOARD_CONFIG);
  }, [persistConfig]);

  const hideWidgetBorders = config.preferences?.hideWidgetBorders ?? false;
  const backgroundImageUrl = config.preferences?.backgroundImageUrl;
  const backgroundFit = config.preferences?.backgroundFit ?? 'cover';

  const handleSetBackground = useCallback((url: string, overlay?: number) => {
    setConfig((prev) => {
      const next: DashboardConfig = {
        ...prev,
        preferences: {
          ...prev.preferences,
          backgroundImageUrl: url,
          backgroundOverlay: overlay ?? prev.preferences?.backgroundOverlay ?? 0.4,
        },
      };
      persistConfig(next);
      return next;
    });
  }, [persistConfig]);

  const handleSetBackgroundFit = useCallback((fit: 'cover' | 'contain') => {
    setConfig((prev) => {
      const next: DashboardConfig = {
        ...prev,
        preferences: { ...prev.preferences, backgroundFit: fit },
      };
      persistConfig(next);
      return next;
    });
  }, [persistConfig]);

  const handleClearBackground = useCallback(() => {
    setConfig((prev) => {
      const next: DashboardConfig = {
        ...prev,
        preferences: {
          ...prev.preferences,
          backgroundImageUrl: undefined,
          backgroundOverlay: undefined,
        },
      };
      persistConfig(next);
      return next;
    });
  }, [persistConfig]);

  const numGridRows = Math.max(6,
    config.slots.reduce((max, s) => Math.max(max, s.layout.y + s.layout.h), 0) + 2
  );

  const handleToggleBorders = useCallback(() => {
    setConfig((prev) => {
      const next: DashboardConfig = {
        ...prev,
        preferences: {
          ...prev.preferences,
          hideWidgetBorders: !prev.preferences?.hideWidgetBorders,
        },
      };
      persistConfig(next);
      return next;
    });
  }, [persistConfig]);

  return (
    <div className="space-y-4">
      <DashboardSettingsBar
        config={config}
        editMode={editMode}
        onToggleEdit={() => setEditMode((v) => !v)}
        onAddWidget={handleAddWidget}
        onReset={handleReset}
        hideWidgetBorders={hideWidgetBorders}
        onToggleBorders={handleToggleBorders}
        backgroundImageUrl={backgroundImageUrl}
        backgroundFit={backgroundFit}
        onSetBackground={handleSetBackground}
        onSetBackgroundFit={handleSetBackgroundFit}
        onClearBackground={handleClearBackground}
      />

      <div ref={containerRef} className={`relative ${hideWidgetBorders ? 'dashboard-no-borders' : ''} ${!editMode ? '[&_.react-resizable-handle]:!hidden' : ''}`}>
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
            layouts={getResponsiveLayouts(config.slots)}
            cols={{ lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 }}
            rowHeight={120}
            dragConfig={{ enabled: editMode, handle: editMode ? '.widget-drag-handle' : undefined }}
            resizeConfig={{ enabled: editMode, handles: editMode ? ['se'] : [] }}
            compactType="vertical"
            margin={[16, 16]}
            onBreakpointChange={(bp) => setCurrentBreakpoint(bp)}
            onLayoutChange={handleLayoutChange}
          >
          {config.slots.map((slot) => {
            const def = getWidget(slot.widgetId);
            const Widget = def?.component;
            return (
              <div key={slot.layout.i} className="relative h-full">
                {editMode && (
                  <>
                    <div className="widget-drag-handle absolute top-2 left-2 z-10 cursor-grab rounded-md bg-black/20 px-3 py-2 text-xs text-white backdrop-blur-sm select-none" style={{ touchAction: 'none' }}>
                      ⠿
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveWidget(slot.layout.i)}
                      aria-label="Remove widget"
                      className="absolute top-2 right-2 z-10 rounded-full bg-red-500/80 w-10 h-10 flex items-center justify-center text-white text-sm font-bold backdrop-blur-sm hover:bg-red-600 transition-colors"
                    >
                      ✕
                    </button>
                  </>
                )}
                <Suspense
                  fallback={
                    <div className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-5 animate-pulse h-full" />
                  }
                >
                  {Widget ? <Widget /> : <EmptySlot />}
                </Suspense>
              </div>
            );
          })}
          </ResponsiveGridLayout>
        )}
      </div>

      {config.slots.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] p-12 text-center">
          <p className="text-[var(--color-text-muted)] text-sm">
            No widgets on your dashboard. Click <strong>Edit dashboard</strong> → <strong>Add widget</strong> to get started.
          </p>
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

export default DashboardPage;
