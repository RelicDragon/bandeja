import { useCallback, useEffect, useRef } from 'react';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { calculateLastMessageDate, deduplicateChats, type FilterCache } from '@/utils/chatListHelpers';
import {
  patchThreadIndexClearUnread,
  patchThreadIndexFromMessage,
  persistThreadIndexReplace,
} from '@/services/chat/chatThreadIndex';
import { usePlayersStore } from '@/store/playersStore';
import { effectiveSocketUnreadCount } from '@/services/chat/unreadViewingGuard';
import {
  chatApi,
  type ChatContextType,
  type ChatDraft,
  type ChatMessage,
  type GroupChannel,
} from '@/api/chat';
import type { ChatItem, ChatType } from './chatListTypes';
import { updateChatDraftInList, updateChatMessageInList } from './chatListModelMessageUpdates';
import {
  chatMessageToGameListPreview,
  isGamePublicListPreviewMessage,
} from '@/utils/gameChatListPreview';
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

function mergeGameLatestMessageIntoChats(
  prev: ChatItem[],
  gameId: string,
  latest: ChatMessage,
  updatedAt: string
): ChatItem[] {
  if (!isGamePublicListPreviewMessage(latest)) return prev;
  const preview = chatMessageToGameListPreview(latest);
  return prev.map((chat) => {
    if (chat.type !== 'game' || chat.data.id !== gameId) return chat;
    const draft = chat.draft ?? null;
    const lastMessageDate = calculateLastMessageDate(preview, draft, updatedAt);
    return {
      ...chat,
      data: { ...chat.data, lastMessage: preview, updatedAt },
      lastMessageDate,
    };
  });
}

function mergeGroupChannelLatestMessageIntoChats(
  prev: ChatItem[],
  channelId: string,
  latest: ChatMessage,
  updatedAt: string
): ChatItem[] {
  return prev.map((chat) => {
    if ((chat.type !== 'group' && chat.type !== 'channel') || chat.data.id !== channelId) return chat;
    const draft = 'draft' in chat ? chat.draft ?? null : null;
    const lastMessageDate =
      latest || draft ? calculateLastMessageDate(latest, draft, updatedAt) : chat.lastMessageDate;
    return {
      ...chat,
      data: { ...chat.data, lastMessage: latest, updatedAt },
      lastMessageDate,
    };
  });
}

/** When fromUnreadSocket, skip in-list check — chatsRef can lag right after setChats. */
function refreshGroupChannelRowFromApi(
  channelId: string,
  setChats: React.Dispatch<React.SetStateAction<ChatItem[]>>,
  chatsRef: React.MutableRefObject<ChatItem[]>,
  fromUnreadSocket = false
): void {
  if (
    !fromUnreadSocket &&
    !chatsRef.current.some((c) => (c.type === 'group' || c.type === 'channel') && c.data.id === channelId)
  ) {
    return;
  }
  void chatApi
    .getGroupChannelMessages(channelId, 1, 1)
    .then((msgs) => {
      if (msgs?.length) {
        const latest = msgs[msgs.length - 1]!;
        const updatedAt = latest.updatedAt ?? latest.createdAt;
        setChats((prev) => mergeGroupChannelLatestMessageIntoChats(prev, channelId, latest, updatedAt));
        return;
      }
      void chatApi.getGroupChannelById(channelId).then((res) => {
        const fresh = res.data;
        if (!fresh) return;
        setChats((prev) => mergeGroupChannelSnapshotIntoChats(prev, channelId, fresh));
      });
    })
    .catch(() => {
      void chatApi.getGroupChannelById(channelId).then((res) => {
        const fresh = res.data;
        if (!fresh) return;
        setChats((prev) => mergeGroupChannelSnapshotIntoChats(prev, channelId, fresh));
      });
    });
}

function mergeUserChatLastMessageIntoChats(
  prev: ChatItem[],
  chatId: string,
  lastMessage: ChatMessage | null,
  updatedAt: string
): ChatItem[] {
  return prev.map((chat) => {
    if (chat.type !== 'user' || chat.data.id !== chatId) return chat;
    const draft = chat.draft ?? null;
    const lastMessageDate =
      lastMessage || draft ? calculateLastMessageDate(lastMessage, draft, updatedAt) : chat.lastMessageDate;
    return {
      ...chat,
      data: { ...chat.data, lastMessage, updatedAt },
      lastMessageDate,
    };
  });
}

function refreshUserChatRowFromApi(
  chatId: string,
  setChats: React.Dispatch<React.SetStateAction<ChatItem[]>>,
  chatsRef: React.MutableRefObject<ChatItem[]>
): void {
  const inList = chatsRef.current.some((c) => c.type === 'user' && c.data.id === chatId);
  if (!inList) return;
  void chatApi.getUserChatMessages(chatId, 1, 1).then((msgs) => {
    if (!msgs?.length) return;
    const latest = msgs[msgs.length - 1]!;
    const updatedAt = latest.updatedAt ?? latest.createdAt;
    usePlayersStore.getState().patchUserChatPreview(chatId, latest, updatedAt);
    setChats((prev) => mergeUserChatLastMessageIntoChats(prev, chatId, latest, updatedAt));
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

  const pendingGroupRowRefreshIdsRef = useRef(new Set<string>());
  const pendingUserRowRefreshIdsRef = useRef(new Set<string>());
  const rowRefreshMicroFlushScheduledRef = useRef(false);

  const flushPendingListRowRefreshes = useCallback(() => {
    rowRefreshMicroFlushScheduledRef.current = false;
    const groupIds = [...pendingGroupRowRefreshIdsRef.current];
    pendingGroupRowRefreshIdsRef.current.clear();
    const userIds = [...pendingUserRowRefreshIdsRef.current];
    pendingUserRowRefreshIdsRef.current.clear();
    if (groupIds.length === 0 && userIds.length === 0) return;
    if (groupIds.length + userIds.length === 1) {
      if (groupIds.length === 1) {
        refreshGroupChannelRowFromApi(groupIds[0]!, setChats, chatsRef, true);
      } else {
        refreshUserChatRowFromApi(userIds[0]!, setChats, chatsRef);
      }
      return;
    }
    const PREVIEW_MAX = 400;
    void (async () => {
      const gotGroup = new Set<string>();
      const gotUser = new Set<string>();
      let gIdx = 0;
      let uIdx = 0;
      const applyPreviewPayload = (data: Awaited<ReturnType<typeof chatApi.postChatListRowPreviews>>) => {
        setChats((prev) => {
          let next = prev;
          for (const id of Object.keys(data.groupChannels)) {
            const msg = data.groupChannels[id];
            if (!msg?.id) continue;
            const updatedAt = msg.updatedAt ?? msg.createdAt;
            next = mergeGroupChannelLatestMessageIntoChats(next, id, msg, updatedAt);
          }
          for (const id of Object.keys(data.userChats)) {
            const msg = data.userChats[id];
            if (!msg?.id) continue;
            const updatedAt = msg.updatedAt ?? msg.createdAt;
            usePlayersStore.getState().patchUserChatPreview(id, msg, updatedAt);
            next = mergeUserChatLastMessageIntoChats(next, id, msg, updatedAt);
          }
          return next;
        });
        for (const id of Object.keys(data.groupChannels)) gotGroup.add(id);
        for (const id of Object.keys(data.userChats)) gotUser.add(id);
      };
      try {
        while (gIdx < groupIds.length || uIdx < userIds.length) {
          const gPart = groupIds.slice(gIdx, Math.min(gIdx + PREVIEW_MAX, groupIds.length));
          const uPart = userIds.slice(uIdx, Math.min(uIdx + PREVIEW_MAX, userIds.length));
          if (gPart.length === 0 && uPart.length === 0) break;
          gIdx += gPart.length;
          uIdx += uPart.length;
          const data = await chatApi.postChatListRowPreviews({
            groupChannelIds: gPart,
            userChatIds: uPart,
          });
          applyPreviewPayload(data);
        }
      } catch {
        for (const id of groupIds) {
          refreshGroupChannelRowFromApi(id, setChats, chatsRef, true);
        }
        for (const id of userIds) {
          refreshUserChatRowFromApi(id, setChats, chatsRef);
        }
        return;
      }
      for (const id of groupIds) {
        if (!gotGroup.has(id)) refreshGroupChannelRowFromApi(id, setChats, chatsRef, true);
      }
      for (const id of userIds) {
        if (!gotUser.has(id)) refreshUserChatRowFromApi(id, setChats, chatsRef);
      }
    })();
  }, [setChats, chatsRef]);

  const scheduleCoalescedListRowRefreshes = useCallback(() => {
    if (rowRefreshMicroFlushScheduledRef.current) return;
    rowRefreshMicroFlushScheduledRef.current = true;
    queueMicrotask(() => {
      flushPendingListRowRefreshes();
    });
  }, [flushPendingListRowRefreshes]);

  const enqueueGroupChannelRowRefresh = useCallback(
    (channelId: string) => {
      pendingGroupRowRefreshIdsRef.current.add(channelId);
      scheduleCoalescedListRowRefreshes();
    },
    [scheduleCoalescedListRowRefreshes]
  );

  const enqueueUserChatRowRefresh = useCallback(
    (chatId: string) => {
      pendingUserRowRefreshIdsRef.current.add(chatId);
      scheduleCoalescedListRowRefreshes();
    },
    [scheduleCoalescedListRowRefreshes]
  );

  useEffect(
    () => () => {
      rowRefreshMicroFlushScheduledRef.current = false;
      pendingGroupRowRefreshIdsRef.current.clear();
      pendingUserRowRefreshIdsRef.current.clear();
    },
    []
  );

  useEffect(() => {
    const handleRefresh = () => {
      draftsCacheRef.current = null;
      chatListModuleCache.drafts = null;
      if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels' || chatsFilter === 'market') {
        void fetchChatsForFilter(chatsFilter as 'users' | 'bugs' | 'channels' | 'market');
      }
    };

    const syncListCache = (next: ChatItem[]) => {
      if (
        chatsFilter !== 'users' &&
        chatsFilter !== 'bugs' &&
        chatsFilter !== 'channels' &&
        chatsFilter !== 'market'
      ) {
        return;
      }
      const cached = chatsCacheRef.current[chatsFilter];
      if (!cached) return;
      chatsCacheRef.current[chatsFilter] = { ...cached, chats: next };
      if (chatListModuleCache.userId === userId) {
        chatListModuleCache.chats[chatsFilter] = chatsCacheRef.current[chatsFilter];
      }
    };

    const handleDraftUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        draft: ChatDraft;
        chatContextType: string;
        contextId: string;
      }>;
      const { draft, chatContextType, contextId } = customEvent.detail;
      applyDraftToCache(draft, chatContextType, contextId);
      const draftForList =
        draftsCacheRef.current != null
          ? matchDraftToChat(draftsCacheRef.current, chatContextType as ChatContextType, contextId) ?? draft
          : draft;
      setChats((prev) => {
        const next = deduplicateChats(
          updateChatDraftInList(prev, chatContextType, contextId, draftForList, chatsFilter, userId)
        );
        syncListCache(next);
        if (
          chatContextType === 'GAME' &&
          chatsFilter === 'users' &&
          !next.some((c) => c.type === 'game' && c.data.id === contextId)
        ) {
          void fetchChatsForFilter('users');
        }
        return next;
      });
    };

    const handleDraftDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{
        chatContextType: string;
        contextId: string;
        chatType?: string;
      }>;
      const { chatContextType, contextId, chatType } = customEvent.detail;
      applyDraftToCache(null, chatContextType, contextId, chatType);
      const remainingDraft = draftsCacheRef.current
        ? matchDraftToChat(draftsCacheRef.current, chatContextType as ChatContextType, contextId)
        : null;
      setChats((prev) => {
        const next = deduplicateChats(
          updateChatDraftInList(prev, chatContextType, contextId, remainingDraft, chatsFilter, userId)
        );
        syncListCache(next);
        return next;
      });
    };

    const handleViewingClearUnread = (event: Event) => {
      const customEvent = event as CustomEvent<{ contextType: string; contextId: string }>;
      const { contextType, contextId } = customEvent.detail;
      void patchThreadIndexClearUnread(contextType as ChatContextType, contextId);
      setChats((prev) =>
        prev.map((chat) => {
          if (contextType === 'GAME' && chat.type === 'game' && chat.data.id === contextId) {
            return { ...chat, unreadCount: 0 };
          }
          if (
            (contextType === 'GROUP' || contextType === 'BUG') &&
            (chat.type === 'group' || chat.type === 'channel') &&
            chat.data.id === contextId
          ) {
            return { ...chat, unreadCount: 0 };
          }
          return chat;
        })
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
  }, [fetchChatsForFilter, chatsFilter, userId, applyDraftToCache, setChats, draftsCacheRef, chatsCacheRef]);

  useEffect(() => {
    const batch = useSocketEventsStore.getState().takeListChatMessages();
    type Work = { contextType: string; contextId: string; message: ChatMessage; normalized: ChatMessage };
    const work: Work[] = [];
    for (const lastChatMessage of batch) {
      const { contextType, contextId, message } = lastChatMessage;
      const shouldUpdate =
        (chatsFilter === 'users' && (contextType === 'USER' || contextType === 'GROUP' || contextType === 'GAME')) ||
        (chatsFilter === 'bugs' && (contextType === 'GROUP' || contextType === 'BUG')) ||
        (chatsFilter === 'channels' && contextType === 'GROUP') ||
        (chatsFilter === 'market' && contextType === 'GROUP');
      if (!shouldUpdate) continue;
      const raw = message as ChatMessage;
      const normalized: ChatMessage = {
        ...raw,
        chatContextType: (raw.chatContextType ?? contextType) as ChatContextType,
        contextId: raw.contextId ?? contextId,
      };
      work.push({ contextType, contextId, message: raw, normalized });
    }
    if (work.length === 0) return;

    for (const w of work) {
      if (w.contextType !== 'BUG') {
        queueMicrotask(() => {
          void patchThreadIndexFromMessage(w.normalized, { applyUnread: false }).catch(() => {});
        });
      }
    }

    const isViewingMessage = (contextType: string, contextId: string, list: ChatItem[]) =>
      isDesktop &&
      ((contextType === 'USER' && selectedChatType === 'user' && selectedChatId === contextId) ||
        (contextType === 'GAME' && selectedChatType === 'game' && selectedChatId === contextId) ||
        (contextType === 'GROUP' &&
          (selectedChatType === 'group' || selectedChatType === 'channel') &&
          selectedChatId === contextId) ||
        (contextType === 'BUG' &&
          chatsFilter === 'bugs' &&
          (selectedChatType === 'group' || selectedChatType === 'channel') &&
          !!selectedChatId &&
          list.some(
            (c) =>
              (c.type === 'channel' || c.type === 'group') &&
              c.data.id === selectedChatId &&
              (c.data.bug?.id === contextId || c.data.bugId === contextId)
          )));

    for (const w of work) {
      if (isViewingMessage(w.contextType, w.contextId, chatsRef.current) && w.contextType === 'USER') {
        usePlayersStore.getState().markChatAsRead(w.contextId);
      }
    }

    let needsUserListRefetch = false;
    setChats((prevChats) => {
      let next = prevChats;
      for (const { contextType, contextId, message, normalized } of work) {
        if (contextType === 'BUG' && chatsFilter === 'bugs') {
          const bugRow = next.find(
            (c) =>
              (c.type === 'channel' || c.type === 'group') &&
              (c.data.bug?.id === contextId || c.data.bugId === contextId)
          );
          if (bugRow && (bugRow.type === 'group' || bugRow.type === 'channel')) {
            const patchMsg = { ...normalized, chatContextType: 'GROUP' as const, contextId: bugRow.data.id };
            queueMicrotask(() => {
              void patchThreadIndexFromMessage(patchMsg, { applyUnread: false }).catch(() => {});
            });
          }
        }

        const chatExists = next.some((chat) => {
          if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return true;
          if (contextType === 'GAME' && chat.type === 'game' && chat.data.id === contextId) return true;
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
          next = deduplicateChats(updateChatMessageInList(next, contextType, contextId, message as ChatMessage, chatsFilter, userId));
          if (isViewingMessage(contextType, contextId, next)) {
            next = next.map((chat) => {
              if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return { ...chat, unreadCount: 0 };
              if (contextType === 'GAME' && chat.type === 'game' && chat.data.id === contextId) return { ...chat, unreadCount: 0 };
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
        } else if ((contextType === 'USER' || contextType === 'GAME') && chatsFilter === 'users') {
          needsUserListRefetch = true;
        }
      }
      return next;
    });
    if (needsUserListRefetch) {
      usePlayersStore.getState().invalidateUserChatsCache();
      void fetchChatsForFilter('users');
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
    if (unreadBatch.length === 0) return;

    const groupRefreshIds = new Set<string>();
    const userRefreshIds = new Set<string>();
    let userListRefetchFromGameUnread = false;

    for (const u of unreadBatch) {
      if (u.contextType !== 'USER') continue;
      const isViewingThis = isDesktop && selectedChatType === 'user' && selectedChatId === u.contextId;
      const nextCount = isViewingThis ? 0 : effectiveSocketUnreadCount('USER', u.contextId, u.unreadCount);
      usePlayersStore.getState().updateUnreadCount(u.contextId, nextCount);
    }

    let userListRefetchFromUnread = false;
    setChats((prev) => {
      let next = prev;
      for (const lastChatUnreadCount of unreadBatch) {
        const { contextType, contextId, unreadCount, lastMessage: lmRaw } = lastChatUnreadCount as {
          contextType: string;
          contextId: string;
          unreadCount: number;
          lastMessage?: unknown;
        };
        const lm =
          lmRaw && typeof lmRaw === 'object' && 'id' in (lmRaw as object)
            ? (lmRaw as ChatMessage)
            : null;

        if (contextType === 'BUG') {
          if (chatsFilter !== 'bugs') continue;
          const matchBug = (c: ChatItem): boolean => {
            if (c.type !== 'channel' && c.type !== 'group') return false;
            return c.data.bug?.id === contextId || c.data.bugId === contextId;
          };
          const row = next.find(matchBug);
          const channelId = row && (row.type === 'channel' || row.type === 'group') ? row.data.id : undefined;
          const isViewingThis =
            isDesktop &&
            channelId != null &&
            selectedChatId === channelId &&
            (selectedChatType === 'group' || selectedChatType === 'channel');
          const nextCount = isViewingThis ? 0 : unreadCount;
          if (channelId) {
            if (!lm) groupRefreshIds.add(channelId);
          }
          next = next.map((chat) => (matchBug(chat) ? { ...chat, unreadCount: nextCount } : chat));
          if (lm && channelId) {
            const updatedAt = lm.updatedAt ?? lm.createdAt;
            next = mergeGroupChannelLatestMessageIntoChats(next, channelId, lm, updatedAt);
          }
          continue;
        }

        if (contextType === 'GROUP') {
          const isViewingThis =
            isDesktop &&
            selectedChatId === contextId &&
            (selectedChatType === 'group' || selectedChatType === 'channel');
          const nextCount = isViewingThis ? 0 : unreadCount;
          if (!lm) groupRefreshIds.add(contextId);
          next = next.map((chat) =>
            (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId ? { ...chat, unreadCount: nextCount } : chat
          );
          if (lm) {
            const updatedAt = lm.updatedAt ?? lm.createdAt;
            next = mergeGroupChannelLatestMessageIntoChats(next, contextId, lm, updatedAt);
          }
          continue;
        }

        if (contextType === 'GAME') {
          if (chatsFilter !== 'users') continue;
          const isViewingThis = isDesktop && selectedChatType === 'game' && selectedChatId === contextId;
          const nextCount = isViewingThis ? 0 : effectiveSocketUnreadCount('GAME', contextId, unreadCount);
          const exists = next.some((c) => c.type === 'game' && c.data.id === contextId);
          if (!exists && nextCount > 0) {
            userListRefetchFromGameUnread = true;
            continue;
          }
          next = next.map((chat) =>
            chat.type === 'game' && chat.data.id === contextId ? { ...chat, unreadCount: nextCount } : chat
          );
          if (lm && typeof lm === 'object') {
            const updatedAt =
              (lm as { updatedAt?: string; createdAt?: string }).updatedAt ??
              (lm as { createdAt?: string }).createdAt ??
              new Date().toISOString();
            const previewStr = (lm as { preview?: string }).preview;
            if (typeof previewStr === 'string') {
              const preview = { preview: previewStr, updatedAt };
              next = next.map((chat) => {
                if (chat.type !== 'game' || chat.data.id !== contextId) return chat;
                const draft = chat.draft ?? null;
                return {
                  ...chat,
                  data: { ...chat.data, lastMessage: preview, updatedAt },
                  lastMessageDate: calculateLastMessageDate(preview, draft, updatedAt),
                };
              });
            } else {
              next = mergeGameLatestMessageIntoChats(next, contextId, lm as ChatMessage, updatedAt);
            }
          }
          continue;
        }

        if (contextType === 'USER') {
          if (chatsFilter !== 'users') continue;
          const isViewingThis = isDesktop && selectedChatType === 'user' && selectedChatId === contextId;
          const nextCount = isViewingThis ? 0 : effectiveSocketUnreadCount('USER', contextId, unreadCount);
          const exists = next.some((c) => c.type === 'user' && c.data.id === contextId);
          if (!exists && nextCount > 0) {
            userListRefetchFromUnread = true;
            continue;
          }
          next = next.map((chat) =>
            chat.type === 'user' && chat.data.id === contextId ? { ...chat, unreadCount: nextCount } : chat
          );
          if (!lm) {
            userRefreshIds.add(contextId);
          } else {
            const updatedAt = lm.updatedAt ?? lm.createdAt;
            usePlayersStore.getState().patchUserChatPreview(contextId, lm, updatedAt);
            next = mergeUserChatLastMessageIntoChats(next, contextId, lm, updatedAt);
          }
        }
      }
      return next;
    });

    if (userListRefetchFromUnread || userListRefetchFromGameUnread) {
      usePlayersStore.getState().invalidateUserChatsCache();
      void fetchChatsForFilter('users');
    }

    for (const id of groupRefreshIds) {
      enqueueGroupChannelRowRefresh(id);
    }
    for (const id of userRefreshIds) {
      enqueueUserChatRowRefresh(id);
    }
  }, [
    listChatUnreadSeq,
    isDesktop,
    selectedChatId,
    selectedChatType,
    chatsFilter,
    fetchChatsForFilter,
    setChats,
    chatsRef,
    enqueueGroupChannelRowRefresh,
    enqueueUserChatRowRefresh,
  ]);

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
