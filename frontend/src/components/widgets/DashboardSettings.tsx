import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllWidgets } from './widgetRegistry';
import type { DashboardConfig, DashboardWidgetSlot } from '../../types/dashboard';
import { generateSlotId, saveDashboardConfig, DEFAULT_DASHBOARD_CONFIG } from '../../types/dashboard';

interface DashboardSettingsBarProps {
  config: DashboardConfig;
  editMode: boolean;
  onToggleEdit: () => void;
  onAddWidget: (slot: DashboardWidgetSlot) => void;
  onReset: () => void;
  hideWidgetBorders: boolean;
  onToggleBorders: () => void;
}

export default function DashboardSettingsBar({
  config,
  editMode,
  onToggleEdit,
  onAddWidget,
  onReset,
  hideWidgetBorders,
  onToggleBorders,
}: DashboardSettingsBarProps) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const widgets = getAllWidgets();
  const placedIds = new Set(config.slots.map((s) => s.widgetId));

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const handleAddWidget = (widgetId: string) => {
    const def = widgets.find((w) => w.id === widgetId);
    if (!def) return;

    // Find the lowest y position to place the new widget below everything
    const maxY = config.slots.reduce((max, s) => Math.max(max, s.layout.y + s.layout.h), 0);

    const slot: DashboardWidgetSlot = {
      widgetId,
      layout: {
        i: generateSlotId(),
        x: 0,
        y: maxY,
        w: def.defaultW,
        h: def.defaultH,
        minW: def.minW,
        minH: def.minH,
      },
    };
    onAddWidget(slot);
    setPickerOpen(false);
  };

  const handleReset = () => {
    saveDashboardConfig(DEFAULT_DASHBOARD_CONFIG);
    onReset();
  };

  return (
    <div className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] px-4 py-3 flex flex-wrap items-center gap-3">
      {/* Edit mode toggle */}
      <button
        type="button"
        onClick={onToggleEdit}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          editMode
            ? 'bg-[var(--color-accent)] text-white'
            : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
        }`}
      >
        ✏️ {editMode ? 'Done editing' : 'Edit dashboard'}
      </button>

      {/* Add widget (only in edit mode) */}
      {editMode && (
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            ➕ Add widget
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-full mt-2 z-50 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg py-1">
              {widgets.map((w) => {
                const placed = placedIds.has(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={placed}
                    onClick={() => handleAddWidget(w.id)}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                      placed
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]'
                    }`}
                  >
                    <span>{w.icon}</span>
                    <span>{w.label}</span>
                    {placed && <span className="ml-auto text-xs text-[var(--color-text-muted)]">added</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Reset layout (only in edit mode) */}
      {editMode && (
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        >
          ↩ Reset layout
        </button>
      )}

      {/* Toggle widget borders */}
      <button
        type="button"
        onClick={onToggleBorders}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          hideWidgetBorders
            ? 'bg-[var(--color-accent)] text-white'
            : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
        }`}
      >
        {hideWidgetBorders ? '▫️ Borderless' : '🔲 Borders'}
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Dashboard mode button */}
      <button
        type="button"
        onClick={() => navigate('/kiosk')}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        🖥️ Dashboard mode
      </button>
    </div>
  );
}
