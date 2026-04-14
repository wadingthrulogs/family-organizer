import type { Layout } from 'react-grid-layout';

export interface DashboardWidgetSlot {
  widgetId: string;
  layout: Layout;
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
let nextSlotId = 100;

export function loadDashboardConfig(): DashboardConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DashboardConfig;
      if (parsed.slots?.length) {
        // Recover nextSlotId from existing slots
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
  return DEFAULT_DASHBOARD_CONFIG;
}

export function saveDashboardConfig(config: DashboardConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function generateSlotId(): string {
  return `slot-${nextSlotId++}`;
}
