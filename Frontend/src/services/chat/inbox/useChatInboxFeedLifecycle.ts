import { useEffect, useRef } from 'react';
import {
  applyDraftsToChatItems,
  deduplicateChats,
  type FilterCache,
} from '@/utils/chatListHelpers';
import { useNetworkStore } from '@/utils/networkStatus';
import { useShellNavStore } from '@/store/shellNavStore';
import { clearChatListModuleCacheWhenUserMismatch } from '@/components/chat/chatListModuleCache';
import { useChatListFeedStore, type ChatsFilterType } from '@/components/chat/chatListFeedStore';
import { shouldEnterChatListLoadingState } from '@/components/chat/chatListLoadingGate';
import type { ChatItem } from '@/components/chat/chatListTypes';
import type { ChatInboxAdapter } from './types';
import { chatInboxThreadIndex } from './chatInboxProductionAdapter';
import type { ChatInboxFetchOps } from './chatInboxFeedFetch';

type FeedLifecycleOpts = {
  userId: string | undefined;
  chatsFilter: ChatsFilterType;
  getMergedDrafts: (forceRefetch?: boolean) => Promise<import('@/api/chat').ChatDraft[]>;
  fetchOps: ChatInboxFetchOps;
  adapter: ChatInboxAdapter;
  chatsRef: React.MutableRefObject<ChatItem[]>;
  onUsersCacheApplied: (cached: FilterCache, chats: ChatItem[]) => void;
  onMutedChatsReset: () => void;
};

export function useChatInboxFeedLifecycle(opts: FeedLifecycleOpts) {
  const {
    userId,
    chatsFilter,
    getMergedDrafts,
    fetchOps,
    adapter,
    chatsRef,
    onUsersCacheApplied,
    onMutedChatsReset,
  } = opts;

  const { runCoalescedFilterFetch } = fetchOps;

  useEffect(() => {
    if (chatsFilter !== 'users' && chatsFilter !== 'bugs' && chatsFilter !== 'channels' && chatsFilter !== 'market') {
      return;
    }
    if (!userId) return;
    clearChatListModuleCacheWhenUserMismatch(userId);
    useChatListFeedStore.getState().setActiveFilter(chatsFilter);

    const applyCacheToState = (cached: FilterCache, chatsWithDrafts?: ChatItem[]) => {
      const chatsToApply = chatsWithDrafts ?? cached.chats;
      const entry: FilterCache = { ...cached, chats: chatsToApply };
      adapter.commitFilterCache(chatsFilter, entry, { userId, applyToVisible: true });
      if (chatsFilter === 'users') onMutedChatsReset();
      if (cached.cityUsers) onUsersCacheApplied(entry, chatsToApply);
    };

    const applyCacheWithDrafts = async (cached: FilterCache) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      const allDrafts = await getMergedDrafts(true);
      const withDrafts = applyDraftsToChatItems(deduplicateChats(cached.chats), allDrafts, chatsFilter, userId);
      applyCacheToState(cached, withDrafts);
      useChatListFeedStore.getState().setLoading(false);
    };

    const feedState = useChatListFeedStore.getState();
    const cached = feedState.getFilterCache(chatsFilter);
    if (cached && feedState.userId === userId) {
      void applyCacheWithDrafts(cached);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        let showedDisk = false;
        try {
          const fromUsersDex = await chatInboxThreadIndex.load(chatsFilter);
          const fromGamesDex = chatsFilter === 'users' ? await chatInboxThreadIndex.load('games') : [];
          const fromDex = deduplicateChats([...fromUsersDex, ...fromGamesDex]);
          if (!cancelled && fromDex.length > 0) {
            showedDisk = true;
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 0);
            });
            const allDrafts = await getMergedDrafts(true);
            const dexChats = applyDraftsToChatItems(deduplicateChats(fromDex), allDrafts, chatsFilter, userId);
            const dexOnly: FilterCache = { chats: dexChats };
            if (chatsFilter === 'users') {
              dexOnly.cityUsers = [];
              dexOnly.usersHasMore = false;
            }
            if (chatsFilter === 'bugs') dexOnly.bugsHasMore = false;
            if (chatsFilter === 'channels') dexOnly.channelsHasMore = false;
            if (chatsFilter === 'market') dexOnly.marketHasMore = false;
            applyCacheToState(dexOnly);
            useChatListFeedStore.getState().setLoading(false);
          } else if (!cancelled && fromDex.length === 0 && !useNetworkStore.getState().isOnline) {
            showedDisk = true;
            const empty: FilterCache = { chats: [] };
            if (chatsFilter === 'users') {
              empty.cityUsers = [];
              empty.usersHasMore = false;
            }
            if (chatsFilter === 'bugs') empty.bugsHasMore = false;
            if (chatsFilter === 'channels') empty.channelsHasMore = false;
            if (chatsFilter === 'market') empty.marketHasMore = false;
            applyCacheToState(empty);
            useChatListFeedStore.getState().setLoading(false);
            return;
          }
        } catch {
          /* ignore */
        }
        if (showedDisk && !useNetworkStore.getState().isOnline) return;
        if (showedDisk && useNetworkStore.getState().isOnline) {
          const currentFilter = chatsFilter;
          void (async () => {
            try {
              await runCoalescedFilterFetch(currentFilter);
            } catch (err) {
              console.error('Failed to fetch chats:', err);
            }
            if (cancelled) return;
            const c = useChatListFeedStore.getState().getFilterCache(currentFilter);
            if (c && useChatListFeedStore.getState().userId === userId) {
              if (useShellNavStore.getState().chatsFilter !== currentFilter) return;
              adapter.commitFilterCache(currentFilter, c, { userId, applyToVisible: true });
              if (currentFilter === 'users') onMutedChatsReset();
              if (c.cityUsers) onUsersCacheApplied(c, c.chats);
            }
          })();
          return;
        }
        const inflight = useChatListFeedStore.getState().getInFlight(chatsFilter);
        if (inflight) {
          await inflight;
          if (cancelled) return;
          const after = useChatListFeedStore.getState().getFilterCache(chatsFilter);
          if (after && useChatListFeedStore.getState().userId === userId) {
            applyCacheToState(after);
            useChatListFeedStore.getState().setLoading(false);
            return;
          }
        }
        if (shouldEnterChatListLoadingState(showedDisk, chatsRef.current.length)) {
          useChatListFeedStore.getState().setLoading(true);
        }
        const currentFilter = chatsFilter;
        await runCoalescedFilterFetch(currentFilter);
        if (cancelled) return;
        const c = useChatListFeedStore.getState().getFilterCache(chatsFilter);
        if (c) applyCacheToState(c);
      } catch (err) {
        if (!cancelled) console.error('Failed to fetch chats:', err);
      } finally {
        if (!cancelled) useChatListFeedStore.getState().setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [chatsFilter, userId, runCoalescedFilterFetch, getMergedDrafts, adapter, chatsRef, onUsersCacheApplied, onMutedChatsReset]);
}

export function useChatInboxReapplyDraftsOnGameExit(
  viewingGameChatId: string | null,
  userId: string | undefined,
  chatsFilter: ChatsFilterType,
  reapplyDraftsToList: () => void
) {
  const prevRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = viewingGameChatId;
    if (prev && !viewingGameChatId) reapplyDraftsToList();
  }, [viewingGameChatId, reapplyDraftsToList]);
}

export function useChatInboxDraftReapplyEffect(
  loading: boolean,
  userId: string | undefined,
  chatsFilter: ChatsFilterType,
  getMergedDrafts: (forceRefetch?: boolean) => Promise<import('@/api/chat').ChatDraft[]>
) {
  useEffect(() => {
    if (loading || !userId) return;
    if (chatsFilter !== 'users' && chatsFilter !== 'bugs' && chatsFilter !== 'channels' && chatsFilter !== 'market') {
      return;
    }
    let cancelled = false;
    void (async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      if (cancelled) return;
      const allDrafts = await getMergedDrafts(true);
      if (cancelled || allDrafts.length === 0) return;
      useChatListFeedStore.getState().reapplyDrafts(allDrafts, chatsFilter, userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userId, chatsFilter, getMergedDrafts]);
}
