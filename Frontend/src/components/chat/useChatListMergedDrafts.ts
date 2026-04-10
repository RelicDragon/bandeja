import { useCallback, useEffect, useRef } from 'react';
import { chatApi, ChatDraft } from '@/api/chat';
import { draftStorage, mergeServerAndLocalDrafts } from '@/services/draftStorage';
import { useAuthStore } from '@/store/authStore';
import {
  chatListModuleCache,
  clearChatListModuleCacheWhenUserMismatch,
} from '@/components/chat/chatListModuleCache';

export function useChatListMergedDrafts(userId: string | undefined) {
  const draftsCacheRef = useRef<ChatDraft[] | null>(null);

  const getMergedDrafts = useCallback(
    async (forceRefetch = false): Promise<ChatDraft[]> => {
      if (!userId) return [];
      clearChatListModuleCacheWhenUserMismatch(userId);
      if (chatListModuleCache.userId !== userId) draftsCacheRef.current = null;
      if (!forceRefetch && chatListModuleCache.drafts !== null && chatListModuleCache.userId === userId) {
        draftsCacheRef.current = chatListModuleCache.drafts;
        return chatListModuleCache.drafts;
      }
      if (!forceRefetch && draftsCacheRef.current !== null) return draftsCacheRef.current;
      const [res, local] = await Promise.all([
        chatApi.getUserDrafts(1, 1000).catch(() => ({ drafts: [] })),
        draftStorage.getLocalDraftsForUser(userId),
      ]);
      const merged = mergeServerAndLocalDrafts(res?.drafts ?? [], local);
      draftsCacheRef.current = merged;
      chatListModuleCache.drafts = merged;
      chatListModuleCache.userId = userId;
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
      if (draftsCacheRef.current === null) return;
      const sameSlot = (d: ChatDraft) =>
        d.chatContextType === chatContextType &&
        d.contextId === contextId &&
        (draft == null || d.chatType === (chatType ?? draft.chatType));
      if (draft === null) {
        draftsCacheRef.current = draftsCacheRef.current.filter(
          (d) =>
            !(
              d.chatContextType === chatContextType &&
              d.contextId === contextId &&
              (chatType == null || d.chatType === chatType)
            )
        );
      } else {
        draftsCacheRef.current = draftsCacheRef.current.filter((d) => !sameSlot(d));
        draftsCacheRef.current = [...draftsCacheRef.current, draft];
      }
      if (chatListModuleCache.userId === useAuthStore.getState().user?.id) {
        chatListModuleCache.drafts = draftsCacheRef.current;
      }
    },
    []
  );

  return { draftsCacheRef, getMergedDrafts, applyDraftToCache };
}
