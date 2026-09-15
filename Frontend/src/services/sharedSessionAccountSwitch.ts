import type { User } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { clearChatLocalStores } from '@/services/chat/chatThreadIndex';
import { clearChatThreadMemory } from '@/services/chat/chatThreadMemoryCache';
import { clearChatSyncScheduler } from '@/services/chat/chatSyncScheduler';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';
import pushNotificationService from '@/services/pushNotificationService';

export async function clearUserScopedCachesForAccountSwitch(previousUserId: string): Promise<void> {
  pushNotificationService.resetForLogout();
  try {
    const { clearWidgetNextGamesCache } = await import('@/services/widgetNextGamesSync');
    await clearWidgetNextGamesCache();
  } catch (e) {
    console.warn('[auth:shared-session] widget cache clear failed', e);
  }

  try {
    const warm = await import('@/services/chat/chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await clearChatLocalStores();
    clearChatSyncScheduler();
    warm.clearChatSyncWarmDrainQueue();
    useChatSyncStore.getState().resetChatListDexieBump();
    clearChatThreadMemory();
  } catch (e) {
    console.warn('[auth:shared-session] chat cache clear failed', e);
  }

  try {
    const { invalidateBooktimeAllUpcomingCache } = await import(
      '@/integrations/booktime/booktimeAllUpcomingLoader'
    );
    invalidateBooktimeAllUpcomingCache();
  } catch (e) {
    console.warn('[auth:shared-session] booktime cache clear failed', e);
  }

  try {
    const [{ clearAllMyTabCaches }, { queryClient }, { queryKeys }] = await Promise.all([
      import('@/api/me'),
      import('@/queries/queryClient'),
      import('@/queries/queryKeys'),
    ]);
    clearAllMyTabCaches();
    queryClient.removeQueries({ queryKey: queryKeys.games.my(previousUserId) });
    queryClient.removeQueries({ queryKey: queryKeys.questionnaire.all });
  } catch (e) {
    console.warn('[auth:shared-session] my tab cache clear failed', e);
  }

  try {
    useShellNavStore.getState().setMyGamesSelectedDay(null);
    useShellNavStore.getState().setFindSelectedDay(null);
    useShellNavStore.getState().setFindListWeekStartDay(null);
    useReactionEmojiUsageStore.getState().reset();
    const [{ resetCoordinator }, { useUnreadStore }, { useChatListFeedStore }] = await Promise.all([
      import('@/services/chat/unreadCoordinator'),
      import('@/store/unreadStore'),
      import('@/components/chat/chatListFeedStore'),
    ]);
    resetCoordinator();
    useUnreadStore.getState().reset();
    useChatListFeedStore.getState().resetForTests();
    void import('@/store/browseCityStore').then(({ useBrowseCityStore }) => {
      useBrowseCityStore.getState().resetToHome({ clearRecents: true });
    });
  } catch (e) {
    console.warn('[auth:shared-session] shell cache clear failed', e);
  }
}

export async function applySharedSessionUser(nextUser: User): Promise<void> {
  try {
    localStorage.setItem('user', JSON.stringify(nextUser));
  } catch {
    /* no-op */
  }
  useAuthStore.setState({ user: nextUser, isAuthenticated: true });
}

export async function applySharedSessionAccountSwitch(
  previousUserId: string,
  nextUser: User,
): Promise<void> {
  await clearUserScopedCachesForAccountSwitch(previousUserId);
  try {
    const { clearOtherUsersMyTabCaches } = await import('@/api/me');
    clearOtherUsersMyTabCaches(String(nextUser.id));
  } catch (e) {
    console.warn('[auth:shared-session] my tab handoff failed', e);
  }
  await applySharedSessionUser(nextUser);
}
