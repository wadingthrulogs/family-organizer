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

/** Build layouts for every responsive breakpoint from the stored lg slots. */
function getResponsiveLayouts(slots: DashboardWidgetSlot[]) {
  const lgLayouts = slots.map((s) => s.layout);

  // Sort by reading order (top-to-bottom, left-to-right) for mobile stacking
  const sorted = [...slots].sort((a, b) =>
    a.layout.y !== b.layout.y ? a.layout.y - b.layout.y : a.layout.x - b.layout.x,
  );

  // Stack all widgets in a single full-width column
  const stacked = (cols: number): Layout[] => {
    let y = 0;
    return sorted.map((slot) => {
      const item = { ...slot.layout, x: 0, y, w: cols };
      y += slot.layout.h;
      return item;
    });
  };

  // Scale lg (12 cols) proportionally to md (8 cols), clamped to fit
  const mdLayouts = lgLayouts.map((l) => {
    const x = Math.min(Math.round((l.x / 12) * 8), 7);
    const w = Math.max(1, Math.min(Math.round((l.w / 12) * 8), 8 - x));
    return { ...l, x, w };
  });

  return {
    lg: lgLayouts,
    md: mdLayouts,
    sm: stacked(4),
    xs: stacked(2),
    xxs: stacked(1),
  };
}

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
        onSetBackground={handleSetBackground}
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
            isDraggable={editMode}
            isResizable={editMode}
            resizeHandles={editMode ? ['se'] : []}
            compactType="vertical"
            draggableHandle=".widget-drag-handle"
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
                    <div className="widget-drag-handle absolute top-2 left-2 z-10 cursor-grab rounded-md bg-black/20 px-1.5 py-0.5 text-xs text-white backdrop-blur-sm select-none">
                      ⠿
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveWidget(slot.layout.i)}
                      className="absolute top-2 right-2 z-10 rounded-full bg-red-500/80 w-6 h-6 flex items-center justify-center text-white text-xs font-bold backdrop-blur-sm hover:bg-red-600 transition-colors"
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
