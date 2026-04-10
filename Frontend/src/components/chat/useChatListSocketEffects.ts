import { useEffect } from 'react';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { calculateLastMessageDate, deduplicateChats, type FilterCache } from '@/utils/chatListHelpers';
import {
  patchThreadIndexClearUnread,
  patchThreadIndexFromMessage,
  patchThreadIndexSetUnreadCount,
  persistThreadIndexReplace,
} from '@/services/chat/chatThreadIndex';
import { usePlayersStore } from '@/store/playersStore';
import { useNavigationStore } from '@/store/navigationStore';
import { chatApi, type ChatContextType, type ChatDraft, type ChatMessage, type GroupChannel } from '@/api/chat';
import type { ChatItem, ChatType } from './chatListTypes';
import { updateChatDraftInList, updateChatMessageInList } from './chatListModelMessageUpdates';
import { chatListModuleCache } from './chatListModuleCache';
import { useSocketEventsStore } from '@/store/socketEventsStore';

function mergeGroupChannelSnapshotIntoChats(prev: ChatItem[], channelId: string, fresh: GroupChannel): ChatItem[] {
  return prev.map((chat) => {
    if ((chat.type !== 'group' && chat.type !== 'channel') || chat.data.id !== channelId) return chat;
    const draft = 'draft' in chat ? chat.draft ?? null : null;
    const updatedAt = fresh.updatedAt ?? chat.data.updatedAt;
    const lastMessage =
      fresh.lastMessage !== undefined && fresh.lastMessage !== null ? fresh.lastMessage : chat.data.lastMessage;
    const lastMessageDate =
      lastMessage || draft ? calculateLastMessageDate(lastMessage, draft, updatedAt) : chat.lastMessageDate;
    return {
      ...chat,
      data: { ...chat.data, lastMessage, updatedAt },
      lastMessageDate,
    };
  });
}

function refreshGroupChannelRowFromApi(
  channelId: string,
  setChats: React.Dispatch<React.SetStateAction<ChatItem[]>>,
  chatsRef: React.MutableRefObject<ChatItem[]>
): void {
  const inList = chatsRef.current.some(
    (c) => (c.type === 'group' || c.type === 'channel') && c.data.id === channelId
  );
  if (!inList) return;
  void chatApi.getGroupChannelById(channelId).then((res) => {
    const fresh = res.data;
    if (!fresh) return;
    setChats((prev) => mergeGroupChannelSnapshotIntoChats(prev, channelId, fresh));
  }).catch(() => {});
}

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
  chatsRef: React.MutableRefObject<ChatItem[]>;
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
    chatsRef,
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
      (chatsFilter === 'bugs' && (contextType === 'GROUP' || contextType === 'BUG')) ||
      (chatsFilter === 'channels' && contextType === 'GROUP') ||
      (chatsFilter === 'market' && contextType === 'GROUP');

    if (shouldUpdate) {
      const raw = message as ChatMessage;
      const normalized: ChatMessage = {
        ...raw,
        chatContextType: (raw.chatContextType ?? contextType) as ChatContextType,
        contextId: raw.contextId ?? contextId,
      };
      if (contextType !== 'BUG') {
        void patchThreadIndexFromMessage(normalized, { applyUnread: false }).catch(() => {});
      }

      const isViewingThis =
        isDesktop &&
        ((contextType === 'USER' &&
          selectedChatType === 'user' &&
          selectedChatId === contextId) ||
          (contextType === 'GROUP' &&
            (selectedChatType === 'group' || selectedChatType === 'channel') &&
            selectedChatId === contextId) ||
          (contextType === 'BUG' &&
            chatsFilter === 'bugs' &&
            (selectedChatType === 'group' || selectedChatType === 'channel') &&
            !!selectedChatId &&
            chatsRef.current.some(
              (c) =>
                (c.type === 'channel' || c.type === 'group') &&
                c.data.id === selectedChatId &&
                (c.data.bug?.id === contextId || c.data.bugId === contextId)
            )));
      if (isViewingThis && contextType === 'USER') {
        usePlayersStore.getState().markChatAsRead(contextId);
      }
      setChats((prevChats) => {
        if (contextType === 'BUG' && chatsFilter === 'bugs') {
          const bugRow = prevChats.find(
            (c) =>
              (c.type === 'channel' || c.type === 'group') &&
              (c.data.bug?.id === contextId || c.data.bugId === contextId)
          );
          if (bugRow && (bugRow.type === 'group' || bugRow.type === 'channel')) {
            void patchThreadIndexFromMessage(
              { ...normalized, chatContextType: 'GROUP', contextId: bugRow.data.id },
              { applyUnread: false }
            ).catch(() => {});
          }
        }

        const chatExists = prevChats.some((chat) => {
          if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return true;
          if (
            contextType === 'BUG' &&
            chatsFilter === 'bugs' &&
            (chat.type === 'channel' || chat.type === 'group')
          ) {
            return !!(chat.data.bug?.id === contextId || chat.data.bugId === contextId);
          }
          if (contextType === 'GROUP' && (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId) {
            if (chatsFilter === 'channels') return chat.type === 'channel';
            if (chatsFilter === 'users') return chat.type === 'group' || chat.type === 'channel';
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
              if (
                contextType === 'BUG' &&
                (chat.type === 'group' || chat.type === 'channel') &&
                (chat.data.bug?.id === contextId || chat.data.bugId === contextId)
              )
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
  }, [
    listChatMessageSeq,
    chatsFilter,
    userId,
    isDesktop,
    selectedChatId,
    selectedChatType,
    fetchChatsForFilter,
    setChats,
    chatsRef,
  ]);

  useEffect(() => {
    const unreadBatch = useSocketEventsStore.getState().takeListChatUnreads();
    for (const lastChatUnreadCount of unreadBatch) {
    const { contextType, contextId, unreadCount } = lastChatUnreadCount;

    if (contextType === 'BUG') {
      if (chatsFilter !== 'bugs') continue;
      const matchBug = (c: ChatItem): boolean => {
        if (c.type !== 'channel' && c.type !== 'group') return false;
        return c.data.bug?.id === contextId || c.data.bugId === contextId;
      };
      const rowForApi = chatsRef.current.find(matchBug);
      const channelIdForApi =
        rowForApi && (rowForApi.type === 'channel' || rowForApi.type === 'group') ? rowForApi.data.id : undefined;

      setChats((prev) => {
        const row = prev.find(matchBug);
        const channelId =
          row && (row.type === 'channel' || row.type === 'group') ? row.data.id : undefined;
        const isViewingThis =
          isDesktop &&
          channelId != null &&
          selectedChatId === channelId &&
          (selectedChatType === 'group' || selectedChatType === 'channel');
        const nextCount = isViewingThis ? 0 : unreadCount;
        if (channelId) void patchThreadIndexSetUnreadCount('GROUP', channelId, nextCount);
        return prev.map((chat) => (matchBug(chat) ? { ...chat, unreadCount: nextCount } : chat));
      });
      if (channelIdForApi) refreshGroupChannelRowFromApi(channelIdForApi, setChats, chatsRef);
      continue;
    }

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
      refreshGroupChannelRowFromApi(contextId, setChats, chatsRef);
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
  }, [listChatUnreadSeq, isDesktop, selectedChatId, selectedChatType, chatsFilter, fetchChatsForFilter, setChats, chatsRef]);

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
