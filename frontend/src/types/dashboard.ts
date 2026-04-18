import type { Layout } from 'react-grid-layout';

export interface DashboardWidgetSlot {
  widgetId: string;
  layout: Layout;
  /** Per-widget font scale multiplier (default 1.0). Adjustable in edit mode. */
  fontScale?: number;
}

export interface DashboardPreferences {
  hideWidgetBorders?: boolean;
  backgroundImageUrl?: string;
  backgroundOverlay?: number;
  backgroundFit?: 'cover' | 'contain';
  bottomTabKeys?: string[];
}

export interface DashboardConfig {
  slots: DashboardWidgetSlot[];
  preferences?: DashboardPreferences;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  slots: [
    // Hero strip (y:0, h:2) — time, weather, urgent alerts
    { widgetId: 'clock',         layout: { i: 'slot-0', x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 2 } },
    { widgetId: 'weather',       layout: { i: 'slot-1', x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 } },
    { widgetId: 'overdueChores', layout: { i: 'slot-2', x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 } },
    // Primary action zone (y:2, h:3)
    { widgetId: 'events', layout: { i: 'slot-3', x: 0, y: 2, w: 8, h: 3, minW: 5, minH: 3 } },
    { widgetId: 'tasks',  layout: { i: 'slot-4', x: 8, y: 2, w: 4, h: 3, minW: 3, minH: 2 } },
  ],
};

const STORAGE_KEY = 'dashboard-config';
const KIOSK_STORAGE_KEY = 'kiosk-config';
const DASHBOARD_TS_KEY = 'dashboard-config-ts';
const KIOSK_TS_KEY = 'kiosk-config-ts';
let nextSlotId = 100;

function loadConfigFromStorage(key: string): DashboardConfig | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as DashboardConfig;
      if (Array.isArray(parsed.slots)) {
        for (const slot of parsed.slots) {
          const num = parseInt(slot.layout.i.replace('slot-', ''), 10);
          if (!isNaN(num) && num >= nextSlotId) nextSlotId = num + 1;
        }
        return parsed;
      }
    }
  } catch {
    // ignore corrupt data
  }
  return null;
}

export function loadDashboardConfig(): DashboardConfig {
  return loadConfigFromStorage(STORAGE_KEY) ?? DEFAULT_DASHBOARD_CONFIG;
}

export function saveDashboardConfig(config: DashboardConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  localStorage.setItem(DASHBOARD_TS_KEY, String(Date.now()));
}

export function getDashboardConfigTimestamp(): number {
  return Number(localStorage.getItem(DASHBOARD_TS_KEY)) || 0;
}

/** True if the user has ever saved a dashboard config on this device.
 *  Used by the sync effect to decide whether local is authoritative
 *  (vs. the server copy, which is only consulted on fresh devices). */
export function hasStoredDashboardConfig(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function loadKioskConfig(): DashboardConfig {
  return loadConfigFromStorage(KIOSK_STORAGE_KEY) ?? DEFAULT_DASHBOARD_CONFIG;
}

export function saveKioskConfig(config: DashboardConfig): void {
  localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(config));
  localStorage.setItem(KIOSK_TS_KEY, String(Date.now()));
}

export function getKioskConfigTimestamp(): number {
  return Number(localStorage.getItem(KIOSK_TS_KEY)) || 0;
}

/** True if the user has ever saved a kiosk config on this device. */
export function hasStoredKioskConfig(): boolean {
  return localStorage.getItem(KIOSK_STORAGE_KEY) !== null;
}

export function generateSlotId(): string {
  return `slot-${nextSlotId++}`;
}
