import { api } from './client';

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface GuestWifi {
  ssid: string;
  security: WifiSecurity;
  password: string;
  hidden: boolean;
}

export interface GuestBook {
  id: string;
  title: string;
  author: string;
  /** Who's reading it — free text. */
  reader: string;
  /** 0–100 */
  progress: number | null;
  coverAttachmentId: number | null;
  /** Filled by the lookup service unless written by hand. */
  synopsis: string;
  year: number | null;
  /** Lookup bookkeeping — server-owned, ignored on write. */
  enrichStatus: 'pending' | 'done' | 'failed' | null;
  enrichError: string | null;
  enrichRequestedAt: string | null;
  enrichedAt: string | null;
}

export interface GuestContent {
  wifi: GuestWifi | null;
  books: GuestBook[];
  /** The host-side lookup bridge is configured, so new books get looked up. */
  lookupEnabled: boolean;
}

export async function fetchGuestContent(): Promise<GuestContent> {
  const { data } = await api.get<GuestContent>('/guest/content');
  return data;
}

export type GuestBookInput = Partial<Pick<GuestBook, 'id' | 'author' | 'reader' | 'progress' | 'coverAttachmentId' | 'synopsis' | 'year'>> & Pick<GuestBook, 'title'>;

export async function updateGuestContent(
  payload: { wifi?: GuestWifi | null; books?: GuestBookInput[] }
): Promise<GuestContent> {
  const { data } = await api.patch<GuestContent>('/guest/content', payload);
  return data;
}

/** Re-run the cover/synopsis lookup for one book. */
export async function requestBookLookup(bookId: string): Promise<GuestContent> {
  const { data } = await api.post<GuestContent>(`/guest/books/${encodeURIComponent(bookId)}/lookup`);
  return data;
}

/**
 * The de-facto Wi-Fi QR payload (ZXing format), understood by iOS and Android
 * camera apps. Backslash, semicolon, comma, colon and double-quote are escaped.
 */
export function wifiQrPayload(wifi: GuestWifi): string {
  const esc = (v: string) => v.replace(/([\\;,:"])/g, '\\$1');
  const parts = [`T:${wifi.security}`, `S:${esc(wifi.ssid)}`];
  if (wifi.security !== 'nopass' && wifi.password) parts.push(`P:${esc(wifi.password)}`);
  if (wifi.hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}
