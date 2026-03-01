export interface ReminderOwner {
  id: number;
  username: string;
  colorHex?: string | null;
}

export interface Reminder {
  id: number;
  ownerUserId: number;
  targetType: string;
  targetId?: number | null;
  title: string;
  message?: string | null;
  channelMask: number;
  leadTimeMinutes: number;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: ReminderOwner | null;
}

export const CHANNEL_FLAGS = {
  PUSH: 1,
  EMAIL: 2,
  WEBHOOK: 4,
} as const;

export const TARGET_TYPES = ['TASK', 'CHORE', 'GROCERY', 'STANDALONE'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export function channelLabels(mask: number): string[] {
  const labels: string[] = [];
  if (mask & CHANNEL_FLAGS.PUSH) labels.push('Push');
  if (mask & CHANNEL_FLAGS.EMAIL) labels.push('Email');
  if (mask & CHANNEL_FLAGS.WEBHOOK) labels.push('Webhook');
  return labels;
}

export function formatLeadTime(minutes: number): string {
  if (minutes === 0) return 'Immediate';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}
