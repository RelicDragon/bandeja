import type { ChatDraft } from '@/api/chat';
import type { FilterCache } from '@/utils/chatListHelpers';

export type ChatsFilterType = 'users' | 'bugs' | 'channels' | 'market';

export const chatListModuleCache: {
  userId: string | null;
  chats: Partial<Record<ChatsFilterType, FilterCache>>;
  drafts: ChatDraft[] | null;
  lastFetchTime: number;
  inFlightByFilter: Partial<Record<ChatsFilterType, Promise<void>>>;
} = {
  userId: null,
  chats: {},
  drafts: null,
  lastFetchTime: 0,
  inFlightByFilter: {},
};

export function clearChatListModuleCacheWhenUserMismatch(userId: string | undefined) {
  if (userId && chatListModuleCache.userId && chatListModuleCache.userId !== userId) {
    chatListModuleCache.userId = null;
    chatListModuleCache.chats = {};
    chatListModuleCache.drafts = null;
    chatListModuleCache.lastFetchTime = 0;
    chatListModuleCache.inFlightByFilter = {};
  }
}
