import type { Layout } from 'react-grid-layout';
import type { DashboardWidgetSlot } from '../types/dashboard';
import { getWidget } from '../components/widgets/widgetRegistry';

/** Build layouts for every responsive breakpoint from the stored lg slots. */
export function getResponsiveLayouts(slots: DashboardWidgetSlot[]) {
  // Refresh per-slot minW/minH from the registry on every render so that
  // saved layouts immediately benefit when a widget's mins are tightened —
  // no migration of stored data needed.
  const lgLayouts = slots.map((s) => {
    const def = getWidget(s.widgetId);
    return def ? { ...s.layout, minW: def.minW, minH: def.minH } : s.layout;
  });

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
