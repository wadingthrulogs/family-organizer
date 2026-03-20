import { useRef, useState, useEffect, useCallback } from 'react';

export interface WidgetSize {
  width: number;
  height: number;
  /** true when width < 200 or height < 160 */
  compact: boolean;
  /** true when width < 140 or height < 100 */
  tiny: boolean;
  /** Dynamic base font-size (8-22px) derived from widget dimensions */
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

  // Real-time remeasure during pointer drag (covers RGL resize handle drags
  // which outpace ResizeObserver's async delivery).
  useEffect(() => {
    const onPointerMove = () => {
      if (!nodeRef.current) return;
      const { offsetWidth: w, offsetHeight: h } = nodeRef.current;
      setSize((prev) =>
        prev.width !== w || prev.height !== h ? { width: w, height: h } : prev
      );
    };
    document.addEventListener('pointermove', onPointerMove);
    return () => document.removeEventListener('pointermove', onPointerMove);
  }, []);

  const compact = size.width < 200 || size.height < 160;
  const tiny = size.width < 140 || size.height < 100;
  // Weighted average favoring width (60/40) so wide-but-short widgets
  // don't get crushed. Clamp between 8-22px for readability.
  const raw = (size.width * 0.6 + size.height * 0.4) * 0.05;
  const baseFontSize = Math.max(8, Math.min(22, raw));

  return { ...size, compact, tiny, baseFontSize, ref };
}
