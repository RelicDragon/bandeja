import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { chatApi, type ChatContextType, type ChatMessage } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { draftStorage } from '@/services/draftStorage';
import {
  DRAFT_MAX_CONTENT_LENGTH,
  draftLoadingCache,
  emitDraftUpdatedEvent,
  withDraftRetry,
} from '@/components/chat/messageInputDraftUtils';
import { deleteDraftFromComposer } from '@/components/chat/draftDeleteFlow';
import {
  planDraftSlotTransition,
  shouldApplyLoadedDraft,
  shouldCommitLastSavedAfterPersist,
  type DraftComposerSlot,
} from '@/components/chat/messageInputDraftSwitch';

function mentionIdsEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

type Params = {
  finalContextId: string | undefined;
  userId: string | undefined;
  contextType: ChatContextType;
  resolvedChatType: ChatType;
  chatType: ChatType;
  userChatId?: string;
  messageRef: React.MutableRefObject<string>;
  mentionIdsRef: React.MutableRefObject<string[]>;
  editingMessageRef: React.MutableRefObject<ChatMessage | null>;
  setMessage: (v: string) => void;
  setMentionIds: (v: string[]) => void;
  setOriginalMessageBeforeTranslate: (v: string | null) => void;
  setOriginalMentionIdsBeforeTranslate: (v: string[] | null) => void;
  updateMultilineState: () => void;
};

export function useMessageInputDraftSync({
  finalContextId,
  userId,
  contextType,
  resolvedChatType,
  chatType,
  userChatId,
  messageRef,
  mentionIdsRef,
  editingMessageRef,
  setMessage,
  setMentionIds,
  setOriginalMessageBeforeTranslate,
  setOriginalMentionIdsBeforeTranslate,
  updateMultilineState,
}: Params) {
  const saveDraftTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedDraftRef = useRef(false);
  const loadingDraftKeyRef = useRef<string | null>(null);
  const currentContextRef = useRef<{ contextType: string; contextId: string; chatType: ChatType }>({
    contextType: '',
    contextId: '',
    chatType: 'PUBLIC',
  });
  const lastSavedContentRef = useRef<string>('');
  const lastSavedMentionIdsRef = useRef<string[]>([]);
  const draftSlotRef = useRef<DraftComposerSlot>({
    contextType,
    contextId: '',
    chatType: resolvedChatType,
    userId: undefined,
  });
  const loadDraftRef = useRef<() => Promise<void>>(async () => {});

  const persistDraftToSlot = useCallback(
    async (
      slot: DraftComposerSlot,
      content: string,
      mentionIds: string[],
      options?: { updateLastSaved?: boolean; force?: boolean }
    ) => {
      if (!slot.contextId || !slot.userId) return;

      const trimmedContent = (content?.trim() ?? '').slice(0, DRAFT_MAX_CONTENT_LENGTH);
      const safeMentionIds = (mentionIds ?? []).slice(0, 50);
      const updateLastSaved = options?.updateLastSaved !== false;

      if (!trimmedContent && safeMentionIds.length === 0) {
        if (lastSavedContentRef.current === '' && lastSavedMentionIdsRef.current.length === 0) return;
        const previousContent = lastSavedContentRef.current;
        const previousMentionIds = lastSavedMentionIdsRef.current.slice();
        try {
          await deleteDraftFromComposer({
            userId: slot.userId,
            contextType: slot.contextType,
            contextId: slot.contextId,
            chatType: slot.chatType,
            previousDraft: { content: previousContent, mentionIds: previousMentionIds },
          });
          if (shouldCommitLastSavedAfterPersist(draftSlotRef.current, slot, updateLastSaved)) {
            lastSavedContentRef.current = '';
            lastSavedMentionIdsRef.current = [];
          }
        } catch (error) {
          console.error('Failed to delete draft:', error);
        }
        return;
      }

      if (
        !options?.force &&
        updateLastSaved &&
        trimmedContent === lastSavedContentRef.current &&
        mentionIdsEqual(safeMentionIds, lastSavedMentionIdsRef.current)
      ) {
        return;
      }

      await draftStorage.set(
        slot.userId,
        slot.contextType,
        slot.contextId,
        slot.chatType,
        trimmedContent,
        safeMentionIds
      );
      emitDraftUpdatedEvent(
        slot.userId,
        slot.contextType,
        slot.contextId,
        slot.chatType,
        trimmedContent,
        safeMentionIds
      );
      const payload = {
        chatContextType: slot.contextType,
        contextId: slot.contextId,
        chatType: slot.chatType,
        content: trimmedContent || undefined,
        mentionIds: safeMentionIds.length > 0 ? safeMentionIds : undefined,
      };
      try {
        const savedDraft = await withDraftRetry(() => chatApi.saveDraft(payload));
        if (shouldCommitLastSavedAfterPersist(draftSlotRef.current, slot, updateLastSaved)) {
          lastSavedContentRef.current = trimmedContent;
          lastSavedMentionIdsRef.current = safeMentionIds.slice();
        }
        window.dispatchEvent(
          new CustomEvent('draft-updated', {
            detail: {
              draft: savedDraft,
              chatContextType: slot.contextType,
              contextId: slot.contextId,
            },
          })
        );
      } catch (error) {
        console.error('Failed to save draft to server:', error);
      }
    },
    []
  );

  const saveDraft = useCallback(
    async (content: string, mentionIds: string[]) => {
      if (!finalContextId || !userId) return;
      await persistDraftToSlot(
        {
          contextType,
          contextId: finalContextId,
          chatType: resolvedChatType,
          userId,
        },
        content,
        mentionIds
      );
    },
    [finalContextId, userId, contextType, resolvedChatType, persistDraftToSlot]
  );

  const debouncedSaveDraft = useCallback(
    (content: string, mentionIds: string[]) => {
      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
      }
      saveDraftTimeoutRef.current = setTimeout(() => {
        saveDraft(content, mentionIds);
        saveDraftTimeoutRef.current = null;
      }, 800);
    },
    [saveDraft]
  );

  const loadDraft = useCallback(async () => {
    if (!finalContextId || !userId) return;

    const draftKey = `${contextType}-${finalContextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;
    currentContextRef.current = { contextType, contextId: finalContextId, chatType: resolvedChatType };
    loadingDraftKeyRef.current = draftKey;
    hasLoadedDraftRef.current = true;

    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = null;
    }

    const applyDraftToState = (content: string, ids: string[], markAsSaved: boolean): boolean => {
      const hasUserTyped = messageRef.current.trim().length > 0 || mentionIdsRef.current.length > 0;
      if (!shouldApplyLoadedDraft(hasUserTyped)) return false;
      setMessage(content || '');
      setMentionIds(ids ?? []);
      setTimeout(() => updateMultilineState(), 100);
      if (markAsSaved) {
        const trimmed = (content ?? '').trim().slice(0, DRAFT_MAX_CONTENT_LENGTH);
        const safeIds = (ids ?? []).slice(0, 50);
        lastSavedContentRef.current = trimmed;
        lastSavedMentionIdsRef.current = safeIds.slice();
      }
      return true;
    };

    let appliedLocal = false;
    const local = await draftStorage.get(userId, contextType, finalContextId, resolvedChatType);
    if (local && loadingDraftKeyRef.current === draftKey) {
      appliedLocal = applyDraftToState(local.content, local.mentionIds, true);
    }

    let serverPromise: Promise<Awaited<ReturnType<typeof chatApi.getDraft>>>;
    if (draftLoadingCache.has(draftKey)) {
      serverPromise = draftLoadingCache.get(draftKey)!;
    } else {
      serverPromise = chatApi
        .getDraft(contextType, finalContextId, resolvedChatType)
        .then((draft) => {
          setTimeout(() => draftLoadingCache.delete(draftKey), 5000);
          return draft;
        })
        .catch((error) => {
          draftLoadingCache.delete(draftKey);
          throw error;
        });
      draftLoadingCache.set(draftKey, serverPromise);
    }

    try {
      const serverDraft = await serverPromise;
      if (loadingDraftKeyRef.current !== draftKey) return;

      const localUpdated = local ? new Date(local.updatedAt).getTime() : 0;
      const serverUpdated = serverDraft ? new Date(serverDraft.updatedAt).getTime() : 0;
      const useLocal = local && (!serverDraft || localUpdated >= serverUpdated);
      if (useLocal && local) {
        if (appliedLocal && (!serverDraft || localUpdated > serverUpdated)) {
          const pushSlot: DraftComposerSlot = {
            contextType,
            contextId: finalContextId,
            chatType: resolvedChatType,
            userId,
          };
          draftStorage
            .set(userId, contextType, finalContextId, resolvedChatType, local.content, local.mentionIds)
            .then(() => {
              const cur = currentContextRef.current;
              if (cur.contextType !== pushSlot.contextType || cur.contextId !== pushSlot.contextId || cur.chatType !== pushSlot.chatType)
                return;
              if (loadingDraftKeyRef.current !== draftKey) return;
              if (local.content.trim() || local.mentionIds.length > 0) {
                void persistDraftToSlot(pushSlot, local.content, local.mentionIds, { force: true });
              }
            });
        }
      } else if (serverDraft) {
        const appliedServer = applyDraftToState(serverDraft.content ?? '', serverDraft.mentionIds ?? [], true);
        if (appliedServer) {
          await draftStorage.set(
            userId,
            contextType,
            finalContextId,
            resolvedChatType,
            serverDraft.content ?? '',
            serverDraft.mentionIds ?? [],
            serverDraft.updatedAt
          );
        }
      }
    } catch (error) {
      console.error('Failed to load draft from server:', error);
    }
  }, [
    finalContextId,
    userId,
    contextType,
    chatType,
    userChatId,
    resolvedChatType,
    updateMultilineState,
    persistDraftToSlot,
    messageRef,
    mentionIdsRef,
    setMessage,
    setMentionIds,
  ]);

  loadDraftRef.current = loadDraft;

  useLayoutEffect(() => {
    const nextSlot: DraftComposerSlot = {
      contextType,
      contextId: finalContextId ?? '',
      chatType: resolvedChatType,
      userId,
    };
    const plan = planDraftSlotTransition({
      prev: draftSlotRef.current,
      next: nextSlot,
      content: messageRef.current ?? '',
      mentionIds: mentionIdsRef.current ?? [],
      isEditing: !!editingMessageRef.current,
    });

    if (plan.flush) {
      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
        saveDraftTimeoutRef.current = null;
      }
      void persistDraftToSlot(plan.flush.slot, plan.flush.content, plan.flush.mentionIds, {
        updateLastSaved: false,
      }).catch((error) => {
        console.error('Failed to save draft:', error);
      });
    }

    draftSlotRef.current = nextSlot;
    currentContextRef.current = {
      contextType,
      contextId: finalContextId ?? '',
      chatType: resolvedChatType,
    };

    if (!plan.adoptNext) return;

    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = null;
    }
    lastSavedContentRef.current = '';
    lastSavedMentionIdsRef.current = [];
    messageRef.current = '';
    mentionIdsRef.current = [];
    const draftKey = `${contextType}-${finalContextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;
    if (loadingDraftKeyRef.current !== draftKey) {
      hasLoadedDraftRef.current = false;
      draftLoadingCache.delete(draftKey);
    }
    setMessage('');
    setMentionIds([]);
    setOriginalMessageBeforeTranslate(null);
    setOriginalMentionIdsBeforeTranslate(null);
    void loadDraftRef.current();
  }, [
    finalContextId,
    contextType,
    chatType,
    userChatId,
    resolvedChatType,
    userId,
    persistDraftToSlot,
    editingMessageRef,
    messageRef,
    mentionIdsRef,
    setMessage,
    setMentionIds,
    setOriginalMessageBeforeTranslate,
    setOriginalMentionIdsBeforeTranslate,
  ]);

  useEffect(() => {
    const handleDraftUpdated = (event: CustomEvent) => {
      const { chatContextType, contextId } = event.detail;
      const dk = `${chatContextType}-${contextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;
      draftLoadingCache.delete(dk);
    };
    const handleDraftDeleted = (event: CustomEvent) => {
      const { chatContextType, contextId } = event.detail;
      const dk = `${chatContextType}-${contextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;
      draftLoadingCache.delete(dk);
    };
    window.addEventListener('draft-updated', handleDraftUpdated as EventListener);
    window.addEventListener('draft-deleted', handleDraftDeleted as EventListener);
    return () => {
      window.removeEventListener('draft-updated', handleDraftUpdated as EventListener);
      window.removeEventListener('draft-deleted', handleDraftDeleted as EventListener);
    };
  }, [contextType, finalContextId, chatType, userChatId]);

  useEffect(() => {
    const flushActiveSlot = () => {
      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
        saveDraftTimeoutRef.current = null;
      }
      if (editingMessageRef.current) return;
      const slot = draftSlotRef.current;
      if (!slot.contextId || !slot.userId) return;
      const currentMessage = messageRef.current?.trim() ?? '';
      const currentMentionIds = mentionIdsRef.current || [];
      if (currentMessage || currentMentionIds.length > 0) {
        void persistDraftToSlot(slot, currentMessage, currentMentionIds).catch((error) => {
          console.error('Failed to save draft:', error);
        });
      }
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushActiveSlot();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', flushActiveSlot);
    window.addEventListener('pagehide', flushActiveSlot);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', flushActiveSlot);
      window.removeEventListener('pagehide', flushActiveSlot);
      flushActiveSlot();
    };
  }, [editingMessageRef, messageRef, mentionIdsRef, persistDraftToSlot]);

  return {
    saveDraft,
    debouncedSaveDraft,
    saveDraftTimeoutRef,
    hasLoadedDraftRef,
    loadDraft,
  };
}
