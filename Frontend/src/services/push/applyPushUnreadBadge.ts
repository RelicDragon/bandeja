import type { PushNotificationSchema } from '@capacitor/push-notifications';
import { setAppIconBadgeCountNative } from '@/services/authBridge';

function readNonNegativeInt(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function flattenPushData(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...(nested as Record<string, unknown>) };
  }
  const { type: _type, ...rest } = raw;
  return rest;
}

export function parsePushUnreadBadgeCount(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const record = raw as Record<string, unknown>;
  const flat = flattenPushData(record);

  const fromFlat = readNonNegativeInt(flat.unreadBadgeCount);
  if (fromFlat !== undefined) return fromFlat;

  const fromRecord = readNonNegativeInt(record.unreadBadgeCount);
  if (fromRecord !== undefined) return fromRecord;

  return readNonNegativeInt(record.badge);
}

export async function applyPushUnreadBadgeFromNotification(
  notification: PushNotificationSchema
): Promise<void> {
  const fromData = parsePushUnreadBadgeCount(notification.data);
  const fromRoot = readNonNegativeInt(notification.badge);
  const count = fromData ?? fromRoot;
  if (count === undefined) return;
  await setAppIconBadgeCountNative(count);
}
