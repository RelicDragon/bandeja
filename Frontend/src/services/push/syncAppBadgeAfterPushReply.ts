import { chatApi } from '@/api/chat';
import { selectTotalAll, useUnreadStore } from '@/store/unreadStore';
import { syncAppIconBadgeFromStore } from '@/services/chat/syncAppIconBadgeFromStore';

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

  syncAppIconBadgeFromStore(badgeCount);
}
