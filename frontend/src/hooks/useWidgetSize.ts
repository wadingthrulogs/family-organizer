import { useRef, useState, useEffect, useCallback } from 'react';

export interface WidgetSize {
  width: number;
  height: number;
  /** true when width < 200 or height < 160 */
  compact: boolean;
  /** true when width < 140 or height < 100 */
  tiny: boolean;
  /** Dynamic base font-size (14-32px) derived from widget dimensions */
  baseFontSize: number;
}

/**
 * Measures a widget's container element and returns reactive width/height
 * plus convenience flags for compact / tiny sizing.
 */
export function useWidgetSize(): WidgetSize & { ref: React.RefCallback<HTMLElement> } {
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 400, height: 300 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    nodeRef.current = node;

    if (node) {
      // Measure immediately
      setSize({ width: node.offsetWidth, height: node.offsetHeight });

      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          setSize({ width, height });
        }
      });
      observerRef.current.observe(node);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Remeasure on window resize and tab visibility change to handle cases where
  // the ResizeObserver doesn't fire (e.g. react-grid-layout lag during live resize).
  useEffect(() => {
    let rafId: number;

    const remeasure = () => {
      if (nodeRef.current) {
        setSize({
          width: nodeRef.current.offsetWidth,
          height: nodeRef.current.offsetHeight,
        });
      }
    };

    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(remeasure);
    };

    const handleVisibility = () => {
      if (!document.hidden) remeasure();
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // NOTE: A global `pointermove` listener used to live here as a
  // belt-and-suspenders remeasure for react-grid-layout drag/resize lag.
  // It forced a layout read (offsetWidth/offsetHeight) on every mouse move —
  // with 10 dashboard widgets, that was ~10 reflows per pointer event and
  // the #1 CPU hog on the Pi 5 kiosk. Removed per perf-audit-2026-04 §1.
  // ResizeObserver above handles the real case; RGL's onDragStop / onResizeStop
  // provide a final settle on DashboardPage / KioskPage.

  const compact = size.width < 200 || size.height < 160;
  const tiny = size.width < 140 || size.height < 100;
  // Weighted average favoring width (60/40) so wide-but-short widgets
  // don't get crushed. Clamp between 14-32px for touch-kiosk readability.
  const raw = (size.width * 0.6 + size.height * 0.4) * 0.05;
  const baseFontSizeRaw = Math.max(14, Math.min(32, raw));

  // Per-widget font scale: read from the closest ancestor's data-font-scale
  // attribute (set by DashboardPage/KioskPage on the grid item div).
  // This avoids prop drilling or context — widgets scale automatically.
  const scaleAttr = nodeRef.current?.closest('[data-font-scale]')?.getAttribute('data-font-scale');
  const fontScale = scaleAttr ? parseFloat(scaleAttr) : 1;
  const baseFontSize = baseFontSizeRaw * (Number.isFinite(fontScale) ? fontScale : 1);

  return { ...size, compact, tiny, baseFontSize, ref };
}
