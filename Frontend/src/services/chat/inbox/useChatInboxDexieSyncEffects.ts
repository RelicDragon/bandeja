import { useEffect, useRef } from 'react';
import {
  mergeChatListOutboxFromDexieSlice,
  mergeChatListFromThreadIndexDexie,
  threadIndexLiveMergeSig,
} from '@/utils/chatListHelpers';
import { chatInboxThreadIndex } from './chatInboxProductionAdapter';
import { useChatListFeedStore, type ChatsFilterType } from '@/components/chat/chatListFeedStore';
import { useChatListThreadIndexLive } from '@/components/chat/useChatListThreadIndexLive';
import { CHAT_LIST_THREAD_INDEX_LIVE_MERGE_MS } from '@/utils/chatListConstants';

export function useChatInboxDexieSyncEffects(opts: {
  userId: string | undefined;
  chatsFilter: ChatsFilterType;
  contactsMode: boolean;
  debouncedSearchQuery: string;
  chatListDexieBump: number;
}) {
  const { userId, chatsFilter, contactsMode, debouncedSearchQuery, chatListDexieBump } = opts;
  const networkSettled = useChatListFeedStore((s) => s.networkSettledByFilter[chatsFilter]);

  useEffect(() => {
    if (!userId || !networkSettled || chatListDexieBump === 0) return;
    let cancelled = false;
    void chatInboxThreadIndex.load(chatsFilter).then((fromDex) => {
      if (cancelled || fromDex.length === 0) return;
      useChatListFeedStore.getState().patchRowsForFilter(chatsFilter, (prev) =>
        mergeChatListOutboxFromDexieSlice(prev, fromDex)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [chatListDexieBump, chatsFilter, userId, networkSettled]);

  const threadIndexLiveEnabled =
    !!userId &&
    networkSettled &&
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
    if (threadIndexLiveDebounceRef.current) clearTimeout(threadIndexLiveDebounceRef.current);
    threadIndexLiveDebounceRef.current = setTimeout(() => {
      threadIndexLiveDebounceRef.current = null;
      useChatListFeedStore.getState().patchRowsForFilter(chatsFilter, (prev) =>
        mergeChatListFromThreadIndexDexie(prev, slice)
      );
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
