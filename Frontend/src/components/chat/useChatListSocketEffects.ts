import { useEffect } from 'react';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { deduplicateChats, type FilterCache } from '@/utils/chatListHelpers';
import {
  patchThreadIndexClearUnread,
  patchThreadIndexSetUnreadCount,
  persistThreadIndexReplace,
} from '@/services/chat/chatThreadIndex';
import { usePlayersStore } from '@/store/playersStore';
import { useNavigationStore } from '@/store/navigationStore';
import type { ChatContextType, ChatDraft, ChatMessage } from '@/api/chat';
import type { ChatItem, ChatType } from './chatListTypes';
import { updateChatDraftInList, updateChatMessageInList } from './chatListModelMessageUpdates';
import { chatListModuleCache } from './chatListModuleCache';
import { useSocketEventsStore } from '@/store/socketEventsStore';

type SocketEventsParams = {
  chatsFilter: string;
  isDesktop: boolean;
  selectedChatId: string | null | undefined;
  selectedChatType: ChatType | null | undefined;
  userId: string | undefined;
  listChatMessageSeq: number;
  listChatUnreadSeq: number;
  lastSyncCompletedAt: number | null;
  lastNewBug: unknown;
  fetchChatsForFilter: (filter?: 'users' | 'bugs' | 'channels' | 'market') => Promise<void>;
  fetchBugs: (page?: number) => Promise<{ chats: ChatItem[]; hasMore: boolean }>;
  setChats: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  chatsCacheRef: React.MutableRefObject<Partial<Record<'users' | 'bugs' | 'channels' | 'market', FilterCache>>>;
  draftsCacheRef: React.MutableRefObject<ChatDraft[] | null>;
  applyDraftToCache: (
    draft: ChatDraft | null,
    chatContextType: string,
    contextId: string,
    chatType?: string
  ) => void;
  bugsPageRef: React.MutableRefObject<number>;
  setBugsHasMore: (v: boolean) => void;
};

export function useChatListSocketEffects(p: SocketEventsParams) {
  const {
    chatsFilter,
    isDesktop,
    selectedChatId,
    selectedChatType,
    userId,
    listChatMessageSeq,
    listChatUnreadSeq,
    lastSyncCompletedAt,
    lastNewBug,
    fetchChatsForFilter,
    fetchBugs,
    setChats,
    chatsCacheRef,
    draftsCacheRef,
    applyDraftToCache,
    bugsPageRef,
    setBugsHasMore,
  } = p;

  useEffect(() => {
    const handleRefresh = () => {
      draftsCacheRef.current = null;
      chatListModuleCache.drafts = null;
      if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels' || chatsFilter === 'market') {
        void fetchChatsForFilter(chatsFilter as 'users' | 'bugs' | 'channels' | 'market');
      }
    };

    const handleDraftUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        draft: ChatDraft;
        chatContextType: string;
        contextId: string;
      }>;
      const { draft, chatContextType, contextId } = customEvent.detail;
      if (draftsCacheRef.current !== null) applyDraftToCache(draft, chatContextType, contextId);
      setChats((prev) =>
        deduplicateChats(updateChatDraftInList(prev, chatContextType, contextId, draft, chatsFilter, userId))
      );
    };

    const handleDraftDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{
        chatContextType: string;
        contextId: string;
        chatType?: string;
      }>;
      const { chatContextType, contextId, chatType } = customEvent.detail;
      if (draftsCacheRef.current !== null) applyDraftToCache(null, chatContextType, contextId, chatType);
      const remainingDraft = draftsCacheRef.current
        ? matchDraftToChat(draftsCacheRef.current, chatContextType as ChatContextType, contextId)
        : null;
      setChats((prev) =>
        deduplicateChats(updateChatDraftInList(prev, chatContextType, contextId, remainingDraft, chatsFilter, userId))
      );
    };

    const handleViewingClearUnread = (event: Event) => {
      const customEvent = event as CustomEvent<{ contextType: string; contextId: string }>;
      const { contextType, contextId } = customEvent.detail;
      void patchThreadIndexClearUnread(contextType as ChatContextType, contextId);
      setChats((prev) =>
        prev.map((chat) =>
          (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId ? { ...chat, unreadCount: 0 } : chat
        )
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') draftsCacheRef.current = null;
    };

    window.addEventListener('refresh-chat-list', handleRefresh);
    window.addEventListener('draft-updated', handleDraftUpdate);
    window.addEventListener('draft-deleted', handleDraftDelete);
    window.addEventListener('chat-viewing-clear-unread', handleViewingClearUnread);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('refresh-chat-list', handleRefresh);
      window.removeEventListener('draft-updated', handleDraftUpdate);
      window.removeEventListener('draft-deleted', handleDraftDelete);
      window.removeEventListener('chat-viewing-clear-unread', handleViewingClearUnread);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchChatsForFilter, chatsFilter, userId, applyDraftToCache, setChats, draftsCacheRef]);

  useEffect(() => {
    const batch = useSocketEventsStore.getState().takeListChatMessages();
    for (const lastChatMessage of batch) {
    const { contextType, contextId, message } = lastChatMessage;

    const shouldUpdate =
      (chatsFilter === 'users' && (contextType === 'USER' || contextType === 'GROUP')) ||
      (chatsFilter === 'bugs' && contextType === 'GROUP') ||
      (chatsFilter === 'channels' && contextType === 'GROUP') ||
      (chatsFilter === 'market' && contextType === 'GROUP');

    if (shouldUpdate) {
      const isViewingThis =
        isDesktop &&
        selectedChatId === contextId &&
        ((contextType === 'USER' && selectedChatType === 'user') ||
          (contextType === 'GROUP' && (selectedChatType === 'group' || selectedChatType === 'channel')));
      if (isViewingThis && contextType === 'USER') {
        usePlayersStore.getState().markChatAsRead(contextId);
      }
      setChats((prevChats) => {
        const chatExists = prevChats.some((chat) => {
          if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return true;
          if (contextType === 'GROUP' && (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId) {
            if (chatsFilter === 'channels') return chat.type === 'channel';
            if (chatsFilter === 'users') return chat.type === 'group';
            if (chatsFilter === 'bugs') return chat.type === 'channel' && chat.data.bug;
            if (chatsFilter === 'market') return chat.type === 'channel' && chat.data.marketItemId;
            return true;
          }
          return false;
        });

        if (chatExists) {
          let next = deduplicateChats(
            updateChatMessageInList(prevChats, contextType, contextId, message as ChatMessage, chatsFilter, userId)
          );
          if (isViewingThis) {
            next = next.map((chat) => {
              if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return { ...chat, unreadCount: 0 };
              if (contextType === 'GROUP' && (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId)
                return { ...chat, unreadCount: 0 };
              return chat;
            });
          }
          return next;
        }

        if (contextType === 'USER' && chatsFilter === 'users') {
          usePlayersStore.getState().invalidateUserChatsCache();
          void fetchChatsForFilter('users');
        }

        return prevChats;
      });
    }
    }
  }, [listChatMessageSeq, chatsFilter, userId, isDesktop, selectedChatId, selectedChatType, fetchChatsForFilter, setChats]);

  useEffect(() => {
    const unreadBatch = useSocketEventsStore.getState().takeListChatUnreads();
    for (const lastChatUnreadCount of unreadBatch) {
    const { contextType, contextId, unreadCount } = lastChatUnreadCount;

    if (contextType === 'GROUP') {
      const isViewingThis =
        isDesktop &&
        selectedChatId === contextId &&
        (selectedChatType === 'group' || selectedChatType === 'channel');
      const nextCount = isViewingThis ? 0 : unreadCount;
      void patchThreadIndexSetUnreadCount('GROUP', contextId, nextCount);
      setChats((prev) =>
        prev.map((chat) =>
          (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId ? { ...chat, unreadCount: nextCount } : chat
        )
      );
      continue;
    }

    if (contextType === 'USER') {
      const isViewingThis = isDesktop && selectedChatType === 'user' && selectedChatId === contextId;
      const nextCount = isViewingThis ? 0 : unreadCount;
      void patchThreadIndexSetUnreadCount('USER', contextId, nextCount);
      usePlayersStore.getState().updateUnreadCount(contextId, nextCount);
      if (chatsFilter === 'users') {
        setChats((prev) => {
          const exists = prev.some((c) => c.type === 'user' && c.data.id === contextId);
          if (!exists && nextCount > 0) {
            usePlayersStore.getState().invalidateUserChatsCache();
            void fetchChatsForFilter('users');
            return prev;
          }
          return prev.map((chat) =>
            chat.type === 'user' && chat.data.id === contextId ? { ...chat, unreadCount: nextCount } : chat
          );
        });
      }
      continue;
    }

    if (contextType === 'GAME') {
      const viewingGameId = useNavigationStore.getState().viewingGameChatId;
      const nextCount = viewingGameId === contextId ? 0 : unreadCount;
      void patchThreadIndexSetUnreadCount('GAME', contextId, nextCount);
    }
    }
  }, [listChatUnreadSeq, isDesktop, selectedChatId, selectedChatType, chatsFilter, fetchChatsForFilter, setChats]);

  useEffect(() => {
    if (lastSyncCompletedAt == null) return;
    if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels' || chatsFilter === 'market') {
      void fetchChatsForFilter(chatsFilter as 'users' | 'bugs' | 'channels' | 'market');
    }
  }, [lastSyncCompletedAt, chatsFilter, fetchChatsForFilter]);

  useEffect(() => {
    if (!lastNewBug || chatsFilter !== 'bugs') return;
    let cancelled = false;
    fetchBugs(1)
      .then(({ chats, hasMore }) => {
        if (cancelled) return;
        const deduped = deduplicateChats(chats);
        chatsCacheRef.current.bugs = { chats: deduped, bugsHasMore: hasMore };
        void persistThreadIndexReplace('bugs', deduped);
        setChats(deduped);
        setBugsHasMore(hasMore);
        bugsPageRef.current = 1;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lastNewBug, chatsFilter, fetchBugs, chatsCacheRef, setChats, setBugsHasMore, bugsPageRef]);
}
