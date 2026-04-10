import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  mergeChatListOutboxFromDexieSlice,
  mergeChatListFromThreadIndexDexie,
  threadIndexLiveMergeSig,
  type FilterCache,
} from '@/utils/chatListHelpers';
import { loadThreadIndexForList } from '@/services/chat/chatThreadIndex';
import { chatListModuleCache, type ChatsFilterType } from '@/components/chat/chatListModuleCache';
import type { ChatItem } from './chatListTypes';
import { useChatListThreadIndexLive } from '@/components/chat/useChatListThreadIndexLive';
import { CHAT_LIST_THREAD_INDEX_LIVE_MERGE_MS } from '@/utils/chatListConstants';

type ChatsCacheRef = MutableRefObject<Partial<Record<ChatsFilterType, FilterCache>>>;

export function useChatListDexieSyncEffects(opts: {
  userId: string | undefined;
  chatsFilter: ChatsFilterType;
  contactsMode: boolean;
  debouncedSearchQuery: string;
  chatListDexieBump: number;
  setChats: Dispatch<SetStateAction<ChatItem[]>>;
  chatsCacheRef: ChatsCacheRef;
}) {
  const {
    userId,
    chatsFilter,
    contactsMode,
    debouncedSearchQuery,
    chatListDexieBump,
    setChats,
    chatsCacheRef,
  } = opts;

  useEffect(() => {
    if (!userId || chatListDexieBump === 0) return;
    let cancelled = false;
    void loadThreadIndexForList(chatsFilter).then((fromDex) => {
      if (cancelled || fromDex.length === 0) return;
      setChats((prev) => mergeChatListOutboxFromDexieSlice(prev, fromDex));
      const cur = chatsCacheRef.current[chatsFilter];
      if (cur) {
        chatsCacheRef.current[chatsFilter] = {
          ...cur,
          chats: mergeChatListOutboxFromDexieSlice(cur.chats, fromDex),
        };
      }
      const mc = chatListModuleCache.chats[chatsFilter];
      if (mc && chatListModuleCache.userId === userId) {
        chatListModuleCache.chats[chatsFilter] = {
          ...mc,
          chats: mergeChatListOutboxFromDexieSlice(mc.chats, fromDex),
        };
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chatListDexieBump, chatsFilter, userId, setChats, chatsCacheRef]);

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
      setChats((prev) => mergeChatListFromThreadIndexDexie(prev, slice, chatsFilter, uid));
      const cur = chatsCacheRef.current[chatsFilter];
      if (cur) {
        chatsCacheRef.current[chatsFilter] = {
          ...cur,
          chats: mergeChatListFromThreadIndexDexie(cur.chats, slice, chatsFilter, uid),
        };
      }
      const mc = chatListModuleCache.chats[chatsFilter];
      if (mc && chatListModuleCache.userId === uid) {
        chatListModuleCache.chats[chatsFilter] = {
          ...mc,
          chats: mergeChatListFromThreadIndexDexie(mc.chats, slice, chatsFilter, uid),
        };
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
    setChats,
    chatsCacheRef,
  ]);
}
