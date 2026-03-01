import { api } from './client';

/* ─── VAPID public key ─── */

export async function getVapidPublicKey(): Promise<string> {
  const { data } = await api.get<{ publicKey: string }>('/notifications/vapid-public-key');
  return data.publicKey;
}

/* ─── Push subscription management ─── */

export async function subscribePush(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await api.post('/notifications/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
  });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await api.delete('/notifications/subscribe', { data: { endpoint } });
}

export interface PushSubscriptionInfo {
  id: number;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
}

export async function listSubscriptions(): Promise<{ items: PushSubscriptionInfo[]; total: number }> {
  const { data } = await api.get<{ items: PushSubscriptionInfo[]; total: number }>('/notifications/subscriptions');
  return data;
}

/* ─── Notification log ─── */

export interface NotificationLogEntry {
  id: number;
  channel: string;
  title: string;
  body: string | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
  reminder: { id: number; title: string } | null;
}

export async function fetchNotificationLog(limit = 50): Promise<{ items: NotificationLogEntry[]; total: number }> {
  const { data } = await api.get<{ items: NotificationLogEntry[]; total: number }>(`/notifications/log?limit=${limit}`);
  return data;
}

/* ─── Manual actions ─── */

export async function triggerReminder(reminderId: number): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`/notifications/trigger/${reminderId}`);
  return data;
}

export async function processNotifications(): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>('/notifications/process');
  return data;
}

export async function sendDigest(): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>('/notifications/digest');
  return data;
}
