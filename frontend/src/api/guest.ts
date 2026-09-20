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
}

export interface GuestContent {
  wifi: GuestWifi | null;
  books: GuestBook[];
}

export async function fetchGuestContent(): Promise<GuestContent> {
  const { data } = await api.get<GuestContent>('/guest/content');
  return data;
}

export async function updateGuestContent(
  payload: { wifi?: GuestWifi | null; books?: Omit<GuestBook, 'id'>[] | GuestBook[] }
): Promise<GuestContent> {
  const { data } = await api.patch<GuestContent>('/guest/content', payload);
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
