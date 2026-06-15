import { Capacitor } from '@capacitor/core';
import { selectTotalAll, useUnreadStore } from '@/store/unreadStore';
import { getAppIconBadgeCountNative, setAppIconBadgeCountNative } from '@/services/authBridge';

export async function syncAppBadgeAfterPushReply(unreadBadgeCount?: number): Promise<void> {
  if (typeof unreadBadgeCount === 'number' && Number.isFinite(unreadBadgeCount)) {
    await setAppIconBadgeCountNative(Math.max(0, Math.floor(unreadBadgeCount)));
  }

  try {
    await useUnreadStore.getState().refreshAll();
  } catch (error) {
    console.warn('[push-reply] unread refresh after reply failed', error);
  }

  if (Capacitor.getPlatform() === 'ios') {
    const count = selectTotalAll(useUnreadStore.getState());
    await setAppIconBadgeCountNative(count);
    return;
  }

  if (Capacitor.getPlatform() === 'android' && typeof unreadBadgeCount !== 'number') {
    const storedCount = await getAppIconBadgeCountNative();
    if (storedCount > 0) {
      await setAppIconBadgeCountNative(storedCount);
    }
  }
}
