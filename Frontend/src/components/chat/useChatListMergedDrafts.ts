import { useCallback, useEffect, useRef } from 'react';
import { chatApi, ChatDraft } from '@/api/chat';
import { draftStorage, mergeServerAndLocalDrafts } from '@/services/draftStorage';
import { useAuthStore } from '@/store/authStore';
import {
  clearChatListModuleCacheWhenUserMismatch,
  useChatListFeedStore,
} from '@/components/chat/chatListFeedStore';

export function useChatListMergedDrafts(userId: string | undefined) {
  const draftsCacheRef = useRef<ChatDraft[] | null>(null);

  const getMergedDrafts = useCallback(
    async (forceRefetch = false): Promise<ChatDraft[]> => {
      if (!userId) return [];
      clearChatListModuleCacheWhenUserMismatch(userId);
      const feed = useChatListFeedStore.getState();
      if (feed.userId !== userId) draftsCacheRef.current = null;
      if (!forceRefetch && feed.drafts !== null && feed.userId === userId) {
        draftsCacheRef.current = feed.drafts;
        return feed.drafts;
      }
      if (!forceRefetch && draftsCacheRef.current !== null) return draftsCacheRef.current;
      const [res, local] = await Promise.all([
        chatApi.getUserDrafts(1, 1000).catch(() => ({ drafts: [] })),
        draftStorage.getLocalDraftsForUser(userId),
      ]);
      const merged = mergeServerAndLocalDrafts(res?.drafts ?? [], local);
      draftsCacheRef.current = merged;
      feed.setDrafts(merged);
      feed.setUserId(userId);
      return merged;
    },
    [userId]
  );

  useEffect(
    () => () => {
      draftsCacheRef.current = null;
    },
    [userId]
  );

  const applyDraftToCache = useCallback(
    (draft: ChatDraft | null, chatContextType: string, contextId: string, chatType?: string) => {
      const sameSlot = (d: ChatDraft) =>
        d.chatContextType === chatContextType &&
        d.contextId === contextId &&
        (draft == null || d.chatType === (chatType ?? draft.chatType));
      if (draft === null) {
        if (draftsCacheRef.current === null) return;
        draftsCacheRef.current = draftsCacheRef.current.filter(
          (d) =>
            !(
              d.chatContextType === chatContextType &&
              d.contextId === contextId &&
              (chatType == null || d.chatType === chatType)
            )
        );
      } else {
        if (draftsCacheRef.current === null) {
          draftsCacheRef.current = [draft];
        } else {
          draftsCacheRef.current = draftsCacheRef.current.filter((d) => !sameSlot(d));
          draftsCacheRef.current = [...draftsCacheRef.current, draft];
        }
      }
      if (useChatListFeedStore.getState().userId === useAuthStore.getState().user?.id) {
        useChatListFeedStore.getState().setDrafts(draftsCacheRef.current);
      }
    },
    []
  );

  return { draftsCacheRef, getMergedDrafts, applyDraftToCache };
}
