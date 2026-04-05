import { useCallback, useEffect, useRef } from 'react';
import { chatApi, type ChatContextType, type ChatMessage } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { draftStorage } from '@/services/draftStorage';
import {
  DRAFT_MAX_CONTENT_LENGTH,
  draftLoadingCache,
  withDraftRetry,
} from '@/components/chat/messageInputDraftUtils';

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

  const saveDraft = useCallback(
    async (content: string, mentionIds: string[]) => {
      if (!finalContextId || !userId) return;

      const trimmedContent = (content?.trim() ?? '').slice(0, DRAFT_MAX_CONTENT_LENGTH);
      const safeMentionIds = (mentionIds ?? []).slice(0, 50);
      if (!trimmedContent && safeMentionIds.length === 0) {
        if (lastSavedContentRef.current === '' && lastSavedMentionIdsRef.current.length === 0) return;
        lastSavedContentRef.current = '';
        lastSavedMentionIdsRef.current = [];
        await draftStorage.remove(userId, contextType, finalContextId, resolvedChatType);
        try {
          await withDraftRetry(() => chatApi.deleteDraft(contextType, finalContextId, resolvedChatType));
          window.dispatchEvent(
            new CustomEvent('draft-deleted', {
              detail: { chatContextType: contextType, contextId: finalContextId, chatType: resolvedChatType },
            })
          );
        } catch (error) {
          console.error('Failed to delete draft:', error);
        }
        return;
      }

      if (
        trimmedContent === lastSavedContentRef.current &&
        mentionIdsEqual(safeMentionIds, lastSavedMentionIdsRef.current)
      ) {
        return;
      }

      await draftStorage.set(userId, contextType, finalContextId, resolvedChatType, trimmedContent, safeMentionIds);
      const payload = {
        chatContextType: contextType,
        contextId: finalContextId,
        chatType: resolvedChatType,
        content: trimmedContent || undefined,
        mentionIds: safeMentionIds.length > 0 ? safeMentionIds : undefined,
      };
      try {
        const savedDraft = await withDraftRetry(() => chatApi.saveDraft(payload));
        lastSavedContentRef.current = trimmedContent;
        lastSavedMentionIdsRef.current = safeMentionIds.slice();
        window.dispatchEvent(
          new CustomEvent('draft-updated', {
            detail: { draft: savedDraft, chatContextType: contextType, contextId: finalContextId },
          })
        );
      } catch (error) {
        console.error('Failed to save draft to server:', error);
      }
    },
    [finalContextId, userId, contextType, resolvedChatType]
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

    const applyDraftToState = (content: string, ids: string[], markAsSaved: boolean) => {
      const hasUserTyped = messageRef.current.trim().length > 0 || mentionIdsRef.current.length > 0;
      if (!hasUserTyped) {
        setMessage(content || '');
        setMentionIds(ids ?? []);
        setTimeout(() => updateMultilineState(), 100);
      }
      if (markAsSaved) {
        const trimmed = (content ?? '').trim().slice(0, DRAFT_MAX_CONTENT_LENGTH);
        const safeIds = (ids ?? []).slice(0, 50);
        lastSavedContentRef.current = trimmed;
        lastSavedMentionIdsRef.current = safeIds.slice();
      }
    };

    const local = await draftStorage.get(userId, contextType, finalContextId, resolvedChatType);
    if (local && loadingDraftKeyRef.current === draftKey) {
      applyDraftToState(local.content, local.mentionIds, false);
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
        if (!serverDraft || localUpdated > serverUpdated) {
          const pushContext = { contextType, contextId: finalContextId, chatType: resolvedChatType };
          draftStorage
            .set(userId, contextType, finalContextId, resolvedChatType, local.content, local.mentionIds)
            .then(() => {
              const cur = currentContextRef.current;
              if (cur.contextType !== pushContext.contextType || cur.contextId !== pushContext.contextId || cur.chatType !== pushContext.chatType)
                return;
              if (loadingDraftKeyRef.current !== draftKey) return;
              if (local.content.trim() || local.mentionIds.length > 0) {
                saveDraft(local.content, local.mentionIds);
              }
            });
        }
      } else if (serverDraft) {
        applyDraftToState(serverDraft.content ?? '', serverDraft.mentionIds ?? [], true);
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
    saveDraft,
    messageRef,
    mentionIdsRef,
    setMessage,
    setMentionIds,
  ]);

  useEffect(() => {
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = null;
    }
    lastSavedContentRef.current = '';
    lastSavedMentionIdsRef.current = [];
    currentContextRef.current = { contextType, contextId: finalContextId ?? '', chatType: resolvedChatType };
    const draftKey = `${contextType}-${finalContextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;
    if (loadingDraftKeyRef.current !== draftKey) {
      hasLoadedDraftRef.current = false;
      draftLoadingCache.delete(draftKey);
    }
    setMessage('');
    setMentionIds([]);
    setOriginalMessageBeforeTranslate(null);
    setOriginalMentionIdsBeforeTranslate(null);
    void loadDraft();
  }, [
    finalContextId,
    contextType,
    chatType,
    loadDraft,
    userChatId,
    resolvedChatType,
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
    const flush = () => {
      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
        saveDraftTimeoutRef.current = null;
      }
      if (editingMessageRef.current) return;
      if (finalContextId && userId) {
        const currentMessage = messageRef.current?.trim();
        const currentMentionIds = mentionIdsRef.current || [];
        if (currentMessage || currentMentionIds.length > 0) {
          saveDraft(currentMessage || '', currentMentionIds).catch((error) => {
            console.error('Failed to save draft:', error);
          });
        }
      }
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [finalContextId, userId, saveDraft, editingMessageRef, messageRef, mentionIdsRef]);

  return {
    saveDraft,
    debouncedSaveDraft,
    saveDraftTimeoutRef,
    hasLoadedDraftRef,
    loadDraft,
  };
}
