import { Capacitor } from '@capacitor/core';
import { chatApi } from '@/api/chat';
import { selectTotalAll, useUnreadStore } from '@/store/unreadStore';
import { getAppIconBadgeCountNative, setAppIconBadgeCountNative } from '@/services/authBridge';

async function resolvePushReplyBadgeCount(unreadBadgeCount?: number): Promise<number | undefined> {
  if (typeof unreadBadgeCount === 'number' && Number.isFinite(unreadBadgeCount)) {
    return Math.max(0, Math.floor(unreadBadgeCount));
  }

  try {
    const response = await chatApi.getUnreadTotals();
    const total = response?.data?.total;
    if (typeof total === 'number' && Number.isFinite(total)) {
      return Math.max(0, Math.floor(total));
    }
  } catch (error) {
    console.warn('[push-reply] cheap unread totals fetch failed', error);
  }

  return selectTotalAll(useUnreadStore.getState());
}

export async function syncAppBadgeAfterPushReply(unreadBadgeCount?: number): Promise<void> {
  const badgeCount = await resolvePushReplyBadgeCount(unreadBadgeCount);
  if (typeof badgeCount !== 'number') return;

  await setAppIconBadgeCountNative(badgeCount);

  if (Capacitor.getPlatform() === 'android' && typeof unreadBadgeCount !== 'number') {
    const storedCount = await getAppIconBadgeCountNative();
    if (storedCount > 0) {
      await setAppIconBadgeCountNative(storedCount);
    }
  }
}
