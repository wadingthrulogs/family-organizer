import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllWidgets } from './widgetRegistry';
import type { DashboardConfig, DashboardWidgetSlot } from '../../types/dashboard';
import { generateSlotId, saveDashboardConfig, DEFAULT_DASHBOARD_CONFIG } from '../../types/dashboard';
import { api } from '../../api/client';

interface DashboardSettingsBarProps {
  config: DashboardConfig;
  editMode: boolean;
  onToggleEdit: () => void;
  onAddWidget: (slot: DashboardWidgetSlot) => void;
  onReset: () => void;
  hideWidgetBorders: boolean;
  onToggleBorders: () => void;
  backgroundImageUrl?: string;
  backgroundFit?: 'cover' | 'contain';
  onSetBackground: (url: string, overlay?: number) => void;
  onSetBackgroundFit: (fit: 'cover' | 'contain') => void;
  onClearBackground: () => void;
}

export default function DashboardSettingsBar({
  config,
  editMode,
  onToggleEdit,
  onAddWidget,
  onReset,
  hideWidgetBorders,
  onToggleBorders,
  backgroundImageUrl,
  backgroundFit = 'cover',
  onSetBackground,
  onSetBackgroundFit,
  onClearBackground,
}: DashboardSettingsBarProps) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [overlayValue, setOverlayValue] = useState(1);
  const bgPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Close background picker on outside click
  useEffect(() => {
    if (!bgPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (bgPickerRef.current && !bgPickerRef.current.contains(e.target as Node)) {
        setBgPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bgPickerOpen]);

  // Sync overlay slider with saved value when popover opens
  useEffect(() => {
    if (bgPickerOpen) {
      setOverlayValue(config.preferences?.backgroundOverlay ?? 1);
      setUploadError('');
    }
  }, [bgPickerOpen, config.preferences?.backgroundOverlay]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{ id: number }>('/attachments', formData);
      const url = `/api/v1/attachments/${data.id}/download`;
      onSetBackground(url, overlayValue);
      setBgPickerOpen(false);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
    <div className="rounded-2xl bg-card border border-[var(--color-border)] px-4 py-3 flex flex-wrap items-center gap-3">
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
            <div className="absolute left-0 top-full mt-2 z-50 w-56 rounded-xl border border-[var(--color-border)] bg-card shadow-lg py-1">
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

      {/* Background photo */}
      <div className="relative" ref={bgPickerRef}>
        <button
          type="button"
          onClick={() => setBgPickerOpen((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            backgroundImageUrl
              ? 'bg-[var(--color-accent)] text-white'
              : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
          }`}
        >
          🖼️ {backgroundImageUrl ? 'Background set' : 'Background'}
        </button>

        {bgPickerOpen && (
          <div className="absolute left-0 top-full mt-2 z-50 w-64 rounded-xl border border-[var(--color-border)] bg-card shadow-lg p-4 space-y-3">
            {backgroundImageUrl && (
              <div
                className="w-full h-20 rounded-lg bg-cover bg-center border border-[var(--color-border)]"
                style={{ backgroundImage: `url(${backgroundImageUrl})` }}
              />
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : backgroundImageUrl ? '📷 Change photo' : '📷 Choose photo'}
            </button>

            {uploadError && (
              <p className="text-xs text-red-500">{uploadError}</p>
            )}

            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">
                Image opacity: {Math.round(overlayValue * 100)}%
              </label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={overlayValue}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setOverlayValue(v);
                  if (backgroundImageUrl) onSetBackground(backgroundImageUrl, v);
                }}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Image fit</label>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs font-medium">
                {(['cover', 'contain'] as const).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => onSetBackgroundFit(fit)}
                    className={`flex-1 py-1.5 transition-colors capitalize ${
                      backgroundFit === fit
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                    }`}
                  >
                    {fit === 'cover' ? 'Fill' : 'Fit'}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                {backgroundFit === 'cover' ? 'Fills the screen — image may be cropped.' : 'Shows full image — may leave space at edges.'}
              </p>
            </div>

            {backgroundImageUrl && (
              <button
                type="button"
                onClick={() => { onClearBackground(); setBgPickerOpen(false); }}
                className="w-full rounded-lg border border-red-300 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
              >
                Remove background
              </button>
            )}
          </div>
        )}
      </div>

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
