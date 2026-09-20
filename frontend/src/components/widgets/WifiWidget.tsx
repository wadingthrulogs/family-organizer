import { useMemo, useState } from 'react';
import { renderSVG } from 'uqr';
import { useGuestContent } from '../../hooks/useGuestContent';
import { wifiQrPayload } from '../../api/guest';
import { useWidgetSize } from '../../hooks/useWidgetSize';

/**
 * Wi-Fi join card for guests: network name plus a QR code that phone cameras
 * recognise as a Wi-Fi credential. The QR is always black-on-white regardless
 * of theme — contrast is what makes it scannable from across a room.
 */
export default function WifiWidget() {
  const { ref, width, height, compact, tiny, baseFontSize } = useWidgetSize();
  const { data, isLoading } = useGuestContent();
  const [revealed, setRevealed] = useState(false);
  const wifi = data?.wifi ?? null;

  const qrSvg = useMemo(() => {
    if (!wifi) return null;
    return renderSVG(wifiQrPayload(wifi), { pixelSize: 4, border: 2, whiteColor: '#FFFFFF', blackColor: '#000000' });
  }, [wifi]);

  const showHeader = height > 80;
  const showPassword = !tiny && wifi?.security !== 'nopass' && Boolean(wifi?.password);
  const showHint = !compact;
  // QR gets whatever square fits after the header, hint and password rows
  // (plus the card's own padding).
  const reserved = (showHeader ? 36 : 0) + (showHint ? 24 : 0) + (showPassword ? 38 : 0) + 28;
  const qrSize = Math.max(56, Math.min(width - 24, height - reserved));

  return (
    <div ref={ref} style={{ fontSize: baseFontSize * 0.6 }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col items-center">
      {showHeader && (
        <h2 className="w-full font-semibold text-[var(--color-text)] text-[1.3em] mb-1 shrink-0 truncate text-center">
          📶 {wifi ? wifi.ssid : !tiny && 'Wi-Fi'}
        </h2>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">…</div>
      ) : !wifi || !qrSvg ? (
        <div className="flex-1 flex items-center justify-center text-center text-[var(--color-text-muted)] text-[0.95em] px-2">
          {compact ? 'No Wi-Fi set' : 'Add your network in Settings → Guest display'}
        </div>
      ) : (
        <>
          <div
            className="rounded-lg bg-white p-1 shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            style={{ width: qrSize, height: qrSize }}
            aria-label={`Wi-Fi QR code for ${wifi.ssid}`}
            role="img"
            // Our own generated SVG string, not user content.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          {showHint && (
            <p className="mt-1 text-[0.85em] text-[var(--color-text-secondary)] shrink-0">Scan to join</p>
          )}
          {showPassword && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="mt-1 min-h-[32px] max-w-full truncate rounded-md px-2 text-[0.9em] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] font-mono touch-manipulation shrink-0"
              title={revealed ? 'Hide password' : 'Show password'}
            >
              {revealed ? wifi.password : '•'.repeat(Math.min(12, wifi.password.length)) + '  tap to show'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
