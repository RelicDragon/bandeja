import { useEffect, useRef } from 'react';
import {
  mergeChatListOutboxFromDexieSlice,
  mergeChatListFromThreadIndexDexie,
  threadIndexLiveMergeSig,
} from '@/utils/chatListHelpers';
import { loadThreadIndexForList } from '@/services/chat/chatThreadIndex';
import { useChatListFeedStore, type ChatsFilterType } from '@/components/chat/chatListFeedStore';
import { useChatListThreadIndexLive } from '@/components/chat/useChatListThreadIndexLive';
import { CHAT_LIST_THREAD_INDEX_LIVE_MERGE_MS } from '@/utils/chatListConstants';

export function useChatListDexieSyncEffects(opts: {
  userId: string | undefined;
  chatsFilter: ChatsFilterType;
  contactsMode: boolean;
  debouncedSearchQuery: string;
  chatListDexieBump: number;
}) {
  const { userId, chatsFilter, contactsMode, debouncedSearchQuery, chatListDexieBump } = opts;

  useEffect(() => {
    if (!userId || chatListDexieBump === 0) return;
    let cancelled = false;
    void loadThreadIndexForList(chatsFilter).then((fromDex) => {
      if (cancelled || fromDex.length === 0) return;
      const feed = useChatListFeedStore.getState();
      feed.patchRows((prev) => mergeChatListOutboxFromDexieSlice(prev, fromDex));
      const cached = feed.getFilterCache(chatsFilter);
      if (cached) {
        feed.setFilterCache(chatsFilter, {
          ...cached,
          chats: mergeChatListOutboxFromDexieSlice(cached.chats, fromDex),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chatListDexieBump, chatsFilter, userId]);

  const threadIndexLiveEnabled =
    !!userId &&
    !contactsMode &&
    debouncedSearchQuery.trim() === '' &&
    (chatsFilter === 'users' ||
      chatsFilter === 'bugs' ||
      chatsFilter === 'channels' ||
      chatsFilter === 'market');

  const dexThreadSlice = useChatListThreadIndexLive(
    threadIndexLiveEnabled ? chatsFilter : null,
    threadIndexLiveEnabled
  );

  const threadIndexLiveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadIndexLiveSigRef = useRef<string>('');

  useEffect(() => {
    threadIndexLiveSigRef.current = '';
  }, [chatsFilter, contactsMode, debouncedSearchQuery]);

  useEffect(() => {
    if (!threadIndexLiveEnabled || userId == null) return;
    if (dexThreadSlice === undefined) return;
    const sig = `${dexThreadSlice.length}|${threadIndexLiveMergeSig(dexThreadSlice)}`;
    if (sig === threadIndexLiveSigRef.current) return;
    threadIndexLiveSigRef.current = sig;
    const slice = dexThreadSlice;
    const uid = userId;
    if (threadIndexLiveDebounceRef.current) clearTimeout(threadIndexLiveDebounceRef.current);
    threadIndexLiveDebounceRef.current = setTimeout(() => {
      threadIndexLiveDebounceRef.current = null;
      const feed = useChatListFeedStore.getState();
      feed.patchRows((prev) => mergeChatListFromThreadIndexDexie(prev, slice, chatsFilter, uid));
      const cached = feed.getFilterCache(chatsFilter);
      if (cached) {
        feed.setFilterCache(chatsFilter, {
          ...cached,
          chats: mergeChatListFromThreadIndexDexie(cached.chats, slice, chatsFilter, uid),
        });
      }
    }, CHAT_LIST_THREAD_INDEX_LIVE_MERGE_MS);
    return () => {
      if (threadIndexLiveDebounceRef.current) {
        clearTimeout(threadIndexLiveDebounceRef.current);
        threadIndexLiveDebounceRef.current = null;
      }
    };
  }, [
    threadIndexLiveEnabled,
    dexThreadSlice,
    chatsFilter,
    userId,
    contactsMode,
    debouncedSearchQuery,
  ]);
}
