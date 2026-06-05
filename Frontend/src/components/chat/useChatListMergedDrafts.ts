import { useCallback } from 'react';
import { chatApi, ChatDraft } from '@/api/chat';
import { draftStorage, mergeServerAndLocalDrafts } from '@/services/draftStorage';
import { useAuthStore } from '@/store/authStore';
import {
  clearChatListModuleCacheWhenUserMismatch,
  useChatListFeedStore,
} from '@/components/chat/chatListFeedStore';

export function useChatListMergedDrafts(userId: string | undefined) {
  const getMergedDrafts = useCallback(
    async (forceRefetch = false): Promise<ChatDraft[]> => {
      if (!userId) return [];
      clearChatListModuleCacheWhenUserMismatch(userId);
      const feed = useChatListFeedStore.getState();
      if (!forceRefetch && feed.drafts !== null && feed.userId === userId) {
        return feed.drafts;
      }
      const [res, local] = await Promise.all([
        chatApi.getUserDrafts(1, 1000).catch(() => ({ drafts: [] })),
        draftStorage.getLocalDraftsForUser(userId),
      ]);
      const merged = mergeServerAndLocalDrafts(res?.drafts ?? [], local);
      feed.setDrafts(merged);
      feed.setUserId(userId);
      return merged;
    },
    [userId]
  );

  const applyDraftToCache = useCallback(
    (draft: ChatDraft | null, chatContextType: string, contextId: string, chatType?: string) => {
      const feed = useChatListFeedStore.getState();
      if (feed.userId !== useAuthStore.getState().user?.id) return;

      const sameSlot = (d: ChatDraft) =>
        d.chatContextType === chatContextType &&
        d.contextId === contextId &&
        (draft == null || d.chatType === (chatType ?? draft.chatType));

      const current = feed.getDrafts() ?? [];
      let next: ChatDraft[] | null;
      if (draft === null) {
        if (feed.getDrafts() === null) return;
        next = current.filter(
          (d) =>
            !(
              d.chatContextType === chatContextType &&
              d.contextId === contextId &&
              (chatType == null || d.chatType === chatType)
            )
        );
      } else {
        next = [...current.filter((d) => !sameSlot(d)), draft];
      }
      feed.setDrafts(next);
    },
    []
  );

  return { getMergedDrafts, applyDraftToCache };
}
