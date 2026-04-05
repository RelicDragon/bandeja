import { useCallback, useRef } from 'react';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import {
  chatApi,
  type ChatContextType,
  type ChatMessage,
  type CreateMessageRequest,
  type OptimisticMessagePayload,
} from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { draftStorage } from '@/services/draftStorage';
import { shouldQueueChatMutation, isRetryableMutationError } from '@/services/chat/chatMutationNetwork';
import { enqueueChatMutationEdit } from '@/services/chat/chatMutationEnqueue';
import { isValidImage } from '@/components/chat/messageInputDraftUtils';
import {
  ChatImageBatchUploadError,
  uploadChatImagesForMessage,
} from '@/components/chat/messageInputImageUpload';

export type SendQueuedParams = {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  payload: OptimisticMessagePayload;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
};

type Params = {
  gameId?: string;
  bugId?: string;
  userChatId?: string;
  groupChannelId?: string;
  contextType: ChatContextType;
  finalContextId: string | undefined;
  propContextType?: ChatContextType;
  propContextId?: string;
  chatType: ChatType;
  message: string;
  setMessage: (v: string) => void;
  mentionIds: string[];
  setMentionIds: (v: string[]) => void;
  selectedImages: File[];
  setSelectedImages: (v: File[] | ((p: File[]) => File[])) => void;
  editingMessage: ChatMessage | null;
  onEditMessage?: (updated: ChatMessage) => void;
  onCancelEdit?: () => void;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  onMessageSent?: () => void;
  onOptimisticMessage?: (
    payload: OptimisticMessagePayload,
    pendingImageBlobs?: Blob[],
    pendingVoiceBlob?: Blob
  ) => string;
  onSendQueued?: (params: SendQueuedParams) => void;
  onSendFailed?: (optimisticId: string) => void;
  onMessageCreated?: (optimisticId: string, serverMessage: ChatMessage) => void;
  isDisabled: boolean;
  inputBlocked: boolean;
  voiceMode: boolean;
  saveDraftTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  userId: string | undefined;
  updateMultilineState: () => void;
  inputContainerRef: React.RefObject<HTMLDivElement | null>;
  hasLoadedDraftRef: React.MutableRefObject<boolean>;
  clearTranslationOriginals: () => void;
  setIsLoading: (v: boolean) => void;
  t: TFunction;
  queueSendRef: React.MutableRefObject<boolean>;
  onImageBatchUploadFailed?: (failedIndices: number[], recoveredFiles: File[]) => void;
  onClearImageUploadFailures?: () => void;
};

export function useMessageInputSubmit(params: Params) {
  const editInFlightRef = useRef<string | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    const p = paramsRef.current;
    e.preventDefault();
    if (p.voiceMode) return;
    if ((!p.message.trim() && p.selectedImages.length === 0) || p.inputBlocked || p.isDisabled) return;

    const focusTextarea = () => {
      requestAnimationFrame(() => {
        (p.inputContainerRef.current?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
      });
    };

    const clearDraftAfterSend = async () => {
      if (p.saveDraftTimeoutRef.current) {
        clearTimeout(p.saveDraftTimeoutRef.current);
        p.saveDraftTimeoutRef.current = null;
      }
      if (p.finalContextId && p.userId) {
        const resolvedType = p.userChatId ? 'PUBLIC' : normalizeChatType(p.chatType);
        await draftStorage.remove(p.userId, p.contextType, p.finalContextId, resolvedType);
        try {
          await chatApi.deleteDraft(p.contextType, p.finalContextId, resolvedType);
          window.dispatchEvent(
            new CustomEvent('draft-deleted', {
              detail: { chatContextType: p.contextType, contextId: p.finalContextId, chatType: resolvedType },
            })
          );
        } catch (err) {
          console.error('Failed to delete draft:', err);
        }
      }
    };

    if (p.editingMessage && p.onEditMessage) {
      const trimmedContent = p.message.trim();
      if (!trimmedContent) return;
      editInFlightRef.current = p.editingMessage.id;
      p.setIsLoading(true);
      try {
        if (shouldQueueChatMutation() && p.propContextType && p.propContextId) {
          await enqueueChatMutationEdit({
            contextType: p.propContextType,
            contextId: p.propContextId,
            messageId: p.editingMessage.id,
            content: trimmedContent,
            mentionIds: [...p.mentionIds],
          });
          p.onEditMessage({
            ...p.editingMessage,
            content: trimmedContent,
            mentionIds: [...p.mentionIds],
            editedAt: new Date().toISOString(),
          });
        } else {
          const updated = await chatApi.editMessage(p.editingMessage.id, {
            content: trimmedContent,
            mentionIds: [...p.mentionIds],
          });
          p.onEditMessage(updated);
        }
        p.setMessage('');
        p.setMentionIds([]);
        p.clearTranslationOriginals();
        p.onCancelEdit?.();
        focusTextarea();
      } catch (err: unknown) {
        console.error('Edit message failed:', err);
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          p.onCancelEdit?.();
          toast.error(p.t('chat.editMessageDeleted', { defaultValue: 'Message was deleted' }));
        } else if (p.propContextType && p.propContextId && isRetryableMutationError(err)) {
          try {
            await enqueueChatMutationEdit({
              contextType: p.propContextType,
              contextId: p.propContextId,
              messageId: p.editingMessage.id,
              content: trimmedContent,
              mentionIds: [...p.mentionIds],
            });
            p.onEditMessage({
              ...p.editingMessage,
              content: trimmedContent,
              mentionIds: [...p.mentionIds],
              editedAt: new Date().toISOString(),
            });
            p.setMessage('');
            p.setMentionIds([]);
            p.clearTranslationOriginals();
            p.onCancelEdit?.();
            focusTextarea();
          } catch {
            toast.error(p.t('chat.sendFailed') || 'Failed to update message');
          }
        } else {
          toast.error(p.t('chat.sendFailed') || 'Failed to update message');
        }
      } finally {
        editInFlightRef.current = null;
        p.setIsLoading(false);
      }
      return;
    }

    if (editInFlightRef.current !== null) return;

    if (!p.finalContextId) {
      console.error('[MessageInput] Missing contextId:', {
        gameId: p.gameId,
        bugId: p.bugId,
        userChatId: p.userChatId,
        groupChannelId: p.groupChannelId,
      });
      toast.error(p.t('chat.missingContextId') || 'Missing chat context');
      return;
    }

    const trimmedContent = p.message.trim();
    const useOptimistic = !!p.onOptimisticMessage;
    let optimisticId: string | undefined;
    const filesSnapshot = p.selectedImages.filter(isValidImage);

    const previewUrls =
      filesSnapshot.length > 0 ? filesSnapshot.map((f) => URL.createObjectURL(f)) : [];
    const payload: OptimisticMessagePayload = {
      content: trimmedContent,
      mediaUrls: previewUrls,
      thumbnailUrls: previewUrls,
      replyToId: p.replyTo?.id,
      replyTo: p.replyTo
        ? {
            id: p.replyTo.id,
            content: p.replyTo.content,
            sender: p.replyTo.sender || { id: 'system', firstName: 'System' },
          }
        : undefined,
      chatType: p.userChatId ? 'PUBLIC' : normalizeChatType(p.chatType),
      mentionIds: [...p.mentionIds],
    };

    const useQueue =
      useOptimistic && !!p.onSendQueued && p.propContextType != null && p.propContextId != null;
    if (useQueue) paramsRef.current.queueSendRef.current = true;

    if (useOptimistic) {
      optimisticId = p.onOptimisticMessage!(payload, filesSnapshot.length ? filesSnapshot : undefined);
      if (optimisticId) {
        p.onMessageSent?.();
        p.setMessage('');
        p.setMentionIds([]);
        p.setSelectedImages([]);
        p.clearTranslationOriginals();
        p.hasLoadedDraftRef.current = false;
        setTimeout(() => p.updateMultilineState(), 100);
        p.onCancelReply?.();
        focusTextarea();
      } else {
        previewUrls.forEach((u) => URL.revokeObjectURL(u));
      }
    } else {
      p.setIsLoading(true);
      p.onMessageSent?.();
    }

    queueMicrotask(() => {
      void (async () => {
        try {
          const queueDeferImages = !!(useQueue && optimisticId && filesSnapshot.length > 0);
          let originalUrls: string[] = [];
          let thumbnailUrls: string[] = [];
          if (!queueDeferImages && filesSnapshot.length > 0) {
            const targetId = p.gameId || p.bugId || p.userChatId || p.groupChannelId;
            try {
              const up = await uploadChatImagesForMessage(filesSnapshot, targetId, p.contextType, p.t);
              originalUrls = up.originalUrls;
              thumbnailUrls = up.thumbnailUrls;
            } catch (err) {
              if (err instanceof ChatImageBatchUploadError) {
                p.onImageBatchUploadFailed?.(err.failedIndices, filesSnapshot);
                if (optimisticId && p.onSendFailed) p.onSendFailed(optimisticId);
                previewUrls.forEach((u) => URL.revokeObjectURL(u));
                return;
              }
              throw err;
            }
          }
          if (useQueue && optimisticId) {
            p.onSendQueued!({
              tempId: optimisticId,
              contextType: p.propContextType!,
              contextId: p.propContextId!,
              payload: queueDeferImages
                ? payload
                : { ...payload, mediaUrls: originalUrls, thumbnailUrls },
              ...(queueDeferImages
                ? {}
                : {
                    mediaUrls: originalUrls.length > 0 ? originalUrls : undefined,
                    thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
                  }),
            });
          } else {
            const messageData: CreateMessageRequest = {
              chatContextType: p.gameId ? 'GAME' : p.bugId ? 'BUG' : p.groupChannelId ? 'GROUP' : 'USER',
              contextId: p.finalContextId,
              content: trimmedContent || undefined,
              mediaUrls: originalUrls.length > 0 ? originalUrls : [],
              thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
              replyToId: p.replyTo?.id,
              chatType: p.userChatId ? 'PUBLIC' : normalizeChatType(p.chatType),
              mentionIds: p.mentionIds.length > 0 ? p.mentionIds : undefined,
            };
            const created = await chatApi.createMessage(messageData);
            if (useOptimistic && optimisticId && p.onMessageCreated) {
              p.onMessageCreated(optimisticId, created);
            }
          }
          await clearDraftAfterSend();
          p.onClearImageUploadFailures?.();
          if (!useOptimistic) {
            p.setMessage('');
            p.setMentionIds([]);
            p.setSelectedImages([]);
            p.clearTranslationOriginals();
            p.hasLoadedDraftRef.current = false;
            setTimeout(() => p.updateMultilineState(), 100);
            p.onCancelReply?.();
          }
        } catch (error) {
          console.error('Failed to send message:', error);
          if (optimisticId && p.onSendFailed) p.onSendFailed(optimisticId);
          else if (!useOptimistic) p.setMessage(trimmedContent);
          if (!(error instanceof ChatImageBatchUploadError)) {
            toast.error(p.t('chat.sendFailed') || 'Failed to send message');
          }
        } finally {
          if (useQueue) paramsRef.current.queueSendRef.current = false;
          if (!useQueue) p.setIsLoading(false);
          focusTextarea();
        }
      })();
    });
  }, []);

  return { handleSubmit, editInFlightRef };
}
