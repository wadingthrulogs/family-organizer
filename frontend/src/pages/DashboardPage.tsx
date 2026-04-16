import { useState, Suspense, useCallback, useEffect, useRef } from 'react';
import { ResponsiveGridLayout, useContainerWidth, noCompactor } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { DashboardSettingsSheet } from '../components/widgets/DashboardSettings';
import { getWidget } from '../components/widgets/widgetRegistry';
import type { DashboardWidgetSlot, DashboardConfig } from '../types/dashboard';
import { loadDashboardConfig, saveDashboardConfig, DEFAULT_DASHBOARD_CONFIG } from '../types/dashboard';
import { useUserPreferences, useUpdateUserPreferencesMutation } from '../hooks/useUserPreferences';
import { getResponsiveLayouts } from '../lib/dashboardLayouts';

interface RecentlyRemoved {
  slot: DashboardWidgetSlot;
  index: number;
}

const UNDO_TIMEOUT_MS = 5000;

function DashboardPage() {
  const [config, setConfig] = useState<DashboardConfig>(loadDashboardConfig);
  const [editMode, setEditMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentlyRemoved, setRecentlyRemoved] = useState<RecentlyRemoved | null>(null);
  const { width, mounted, containerRef } = useContainerWidth();
  const { data: prefs } = useUserPreferences();
  const updatePrefs = useUpdateUserPreferencesMutation();
  const serverSynced = useRef(false);
  const editModeRef = useRef(editMode);
  const undoTimerRef = useRef<number | null>(null);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }, []);

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
      // Skip layout persistence on narrow viewports where RGL uses derived
      // stacked layouts — those should never overwrite the user's desktop
      // arrangement. We infer "narrow" from the layout itself: stacked
      // layouts always have x=0 on every item.
      if (newLayout.length > 1 && newLayout.every((l) => l.x === 0)) return;
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
      const index = prev.slots.findIndex((s) => s.layout.i === slotKey);
      if (index === -1) return prev;
      const removed = prev.slots[index];
      const next: DashboardConfig = { ...prev, slots: prev.slots.filter((_, i) => i !== index) };
      persistConfig(next);
      setRecentlyRemoved({ slot: removed, index });
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => setRecentlyRemoved(null), UNDO_TIMEOUT_MS);
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
    <div>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label="Dashboard settings"
        className="fixed bottom-24 right-6 md:bottom-6 z-30 h-14 w-14 rounded-full bg-[var(--color-accent)] text-white shadow-lg flex items-center justify-center text-2xl hover:opacity-90 active:scale-95 touch-manipulation"
      >
        ⚙
      </button>

      {settingsOpen && (
        <DashboardSettingsSheet
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
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div ref={containerRef} className={`relative overflow-x-hidden ${hideWidgetBorders ? 'dashboard-no-borders' : ''} ${!editMode ? '[&_.react-resizable-handle]:!hidden' : ''}`}>
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
                    {Widget ? <Widget /> : <EmptySlot />}
                  </Suspense>
                )}
              </div>
            );
          })}
          </ResponsiveGridLayout>
        )}
      </div>

      {recentlyRemoved && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 flex items-center gap-3 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] shadow-xl px-5 py-3 animate-in slide-in-from-bottom-4">
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
