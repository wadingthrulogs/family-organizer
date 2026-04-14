import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllWidgets } from './widgetRegistry';
import type { DashboardConfig, DashboardWidgetSlot } from '../../types/dashboard';
import { generateSlotId, saveDashboardConfig, DEFAULT_DASHBOARD_CONFIG } from '../../types/dashboard';
import { api } from '../../api/client';

interface DashboardSettingsSheetProps {
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
  onClose: () => void;
}

type View = 'home' | 'widgets' | 'background';

export function DashboardSettingsSheet({
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
  onClose,
}: DashboardSettingsSheetProps) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('home');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [overlayValue, setOverlayValue] = useState(config.preferences?.backgroundOverlay ?? 1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const widgets = getAllWidgets();
  const placedIds = new Set(config.slots.map((s) => s.widgetId));

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

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
    setView('home');
  };

  const handleReset = () => {
    saveDashboardConfig(DEFAULT_DASHBOARD_CONFIG);
    onReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <aside className="relative w-full max-w-xl bg-[var(--color-card)] border-l border-[var(--color-border)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">
            {view === 'home' && 'Dashboard Settings'}
            {view === 'widgets' && 'Add Widget'}
            {view === 'background' && 'Background Image'}
          </h2>
          <div className="flex items-center gap-2">
            {view !== 'home' && (
              <button
                type="button"
                onClick={() => setView('home')}
                className="min-h-[48px] px-4 rounded-xl text-base font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] touch-manipulation"
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="h-12 w-12 rounded-full flex items-center justify-center text-2xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] touch-manipulation"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {view === 'home' && (
            <div className="space-y-3">
              <SettingButton
                icon="✏️"
                label={editMode ? 'Exit edit mode' : 'Edit dashboard'}
                description={editMode ? 'Stop rearranging widgets' : 'Drag, resize, or remove widgets'}
                active={editMode}
                onClick={() => onToggleEdit()}
              />
              {editMode && (
                <SettingButton
                  icon="➕"
                  label="Add widget"
                  description="Place a new widget on the dashboard"
                  onClick={() => setView('widgets')}
                />
              )}
              {editMode && (
                <SettingButton
                  icon="↩"
                  label="Reset layout"
                  description="Restore the default dashboard layout"
                  onClick={handleReset}
                />
              )}
              <SettingButton
                icon={hideWidgetBorders ? '▫️' : '🔲'}
                label={hideWidgetBorders ? 'Show widget borders' : 'Hide widget borders'}
                description="Toggle the outline around widgets"
                active={hideWidgetBorders}
                onClick={onToggleBorders}
              />
              <SettingButton
                icon="🖼️"
                label={backgroundImageUrl ? 'Change background' : 'Set background'}
                description="Upload a photo for the dashboard backdrop"
                active={Boolean(backgroundImageUrl)}
                onClick={() => setView('background')}
              />
              <SettingButton
                icon="🖥️"
                label="Kiosk mode"
                description="Open the read-only family display"
                onClick={() => {
                  onClose();
                  navigate('/kiosk');
                }}
              />
            </div>
          )}

          {view === 'widgets' && (
            <div className="grid grid-cols-2 gap-3">
              {widgets.map((w) => {
                const placed = placedIds.has(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={placed}
                    onClick={() => handleAddWidget(w.id)}
                    className={`flex items-center gap-3 min-h-[72px] rounded-xl border px-4 py-3 text-left transition-colors touch-manipulation ${
                      placed
                        ? 'border-[var(--color-border)] bg-[var(--color-bg)]/30 opacity-40 cursor-not-allowed'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 active:scale-95'
                    }`}
                  >
                    <span className="text-3xl shrink-0">{w.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-[var(--color-text)] truncate">
                        {w.label}
                      </p>
                      {placed && (
                        <p className="text-sm text-[var(--color-text-secondary)]">Already added</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {view === 'background' && (
            <div className="space-y-4">
              {backgroundImageUrl && (
                <div
                  className="w-full h-40 rounded-xl bg-cover bg-center border border-[var(--color-border)]"
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
                className="w-full min-h-[56px] rounded-xl border border-[var(--color-border)] px-4 text-base font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 touch-manipulation active:scale-[0.98]"
              >
                {uploading ? 'Uploading…' : backgroundImageUrl ? '📷 Change photo' : '📷 Choose photo'}
              </button>

              {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}

              <div>
                <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Image opacity
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Subtle', value: 0.3 },
                    { label: 'Medium', value: 0.6 },
                    { label: 'Full', value: 1 },
                  ].map((opt) => {
                    const active = Math.abs(overlayValue - opt.value) < 0.05;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setOverlayValue(opt.value);
                          if (backgroundImageUrl) onSetBackground(backgroundImageUrl, opt.value);
                        }}
                        className={`min-h-[56px] rounded-xl border text-base font-medium transition-colors touch-manipulation ${
                          active
                            ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Image fit
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['cover', 'contain'] as const).map((fit) => (
                    <button
                      key={fit}
                      type="button"
                      onClick={() => onSetBackgroundFit(fit)}
                      className={`min-h-[56px] rounded-xl border text-base font-medium transition-colors capitalize touch-manipulation ${
                        backgroundFit === fit
                          ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                      }`}
                    >
                      {fit === 'cover' ? 'Fill' : 'Fit'}
                    </button>
                  ))}
                </div>
              </div>

              {backgroundImageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    onClearBackground();
                    setView('home');
                  }}
                  className="w-full min-h-[56px] rounded-xl border-2 border-red-400 px-4 text-base font-medium text-red-600 hover:bg-red-50 touch-manipulation active:scale-[0.98]"
                >
                  Remove background
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function SettingButton({
  icon,
  label,
  description,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 min-h-[72px] rounded-xl border px-5 py-3 text-left transition-colors touch-manipulation active:scale-[0.99] ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
          : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-accent)]'
      }`}
    >
      <span className="text-3xl shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-[var(--color-text)]">{label}</p>
        <p className="text-sm text-[var(--color-text-secondary)] truncate">{description}</p>
      </div>
    </button>
  );
}

export default DashboardSettingsSheet;
