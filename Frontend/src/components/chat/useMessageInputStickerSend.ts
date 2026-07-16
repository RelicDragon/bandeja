import { useCallback } from 'react';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import type { ChatContextType, ChatMessage, OptimisticMessagePayload } from '@/api/chat';
import type { StickerDto } from '@/api/stickers';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { deleteDraftFromComposer } from '@/components/chat/draftDeleteFlow';
import { putCachedSticker } from '@/services/stickers/stickerCatalogCache';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { lightHaptic } from '@/utils/lightHaptic';

type Params = {
  isDisabled: boolean;
  inputBlocked: boolean;
  finalContextId: string | undefined;
  contextType: ChatContextType;
  userChatId?: string;
  chatType: ChatType;
  replyTo?: ChatMessage | null;
  propContextType?: ChatContextType;
  propContextId?: string;
  userId: string | undefined;
  onOptimisticMessage?: (
    payload: OptimisticMessagePayload,
    pendingImageBlobs?: Blob[],
    pendingVoiceBlob?: Blob
  ) => string;
  onSendQueued?: (params: {
    tempId: string;
    contextType: ChatContextType;
    contextId: string;
    payload: OptimisticMessagePayload;
    mediaUrls?: string[];
    thumbnailUrls?: string[];
  }) => void;
  onMessageSent?: () => void;
  onCancelReply?: () => void;
  onSendFailed?: (optimisticId: string) => void;
  onStopTyping?: () => void;
  t: TFunction;
};

export function useMessageInputStickerSend({
  isDisabled,
  inputBlocked,
  finalContextId,
  contextType,
  userChatId,
  chatType,
  replyTo,
  propContextType,
  propContextId,
  userId,
  onOptimisticMessage,
  onSendQueued,
  onMessageSent,
  onCancelReply,
  onSendFailed,
  onStopTyping,
  t,
}: Params) {
  const sendSticker = useCallback(
    (sticker: StickerDto) => {
      if (isDisabled || inputBlocked) return;
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        runWithProfileName(() => sendSticker(sticker));
        return;
      }
      if (!finalContextId) {
        toast.error(t('chat.missingContextId'));
        return;
      }
      if (!sticker.id) {
        toast.error(t('chat.sendFailed'));
        return;
      }
      if (!onOptimisticMessage || !onSendQueued || propContextType == null || propContextId == null) {
        toast.error(t('chat.sendFailed'));
        return;
      }

      putCachedSticker(sticker);
      lightHaptic();

      const payload: OptimisticMessagePayload = {
        content: '',
        mediaUrls: [],
        thumbnailUrls: [],
        replyToId: replyTo?.id,
        replyTo: replyTo
          ? {
              id: replyTo.id,
              content: replyTo.content ?? '',
              sender: replyTo.sender || { id: 'system', firstName: 'System' },
              messageType: replyTo.messageType,
              stickerId: replyTo.stickerId,
              stickerEmoji: replyTo.stickerEmoji,
            }
          : undefined,
        chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
        mentionIds: [],
        messageType: 'STICKER',
        stickerId: sticker.id,
        stickerEmoji: sticker.emoji || undefined,
      };

      let optimisticId = '';
      try {
        optimisticId = onOptimisticMessage(payload);
        if (!optimisticId) {
          toast.error(t('chat.sendFailed'));
          return;
        }
        onMessageSent?.();
        onCancelReply?.();
        onSendQueued({
          tempId: optimisticId,
          contextType: propContextType,
          contextId: propContextId,
          payload,
        });
        onStopTyping?.();
      } catch (err) {
        if (optimisticId && onSendFailed) onSendFailed(optimisticId);
        console.error('Sticker send failed:', err);
        toast.error(t('chat.sendFailed'));
        return;
      }

      if (userId) {
        const resolvedType = userChatId ? 'PUBLIC' : normalizeChatType(chatType);
        void deleteDraftFromComposer({
          userId,
          contextType,
          contextId: finalContextId,
          chatType: resolvedType,
          previousDraft: null,
        }).catch(() => {
          /* noop */
        });
      }
    },
    [
      isDisabled,
      inputBlocked,
      finalContextId,
      contextType,
      userChatId,
      chatType,
      replyTo,
      propContextType,
      propContextId,
      userId,
      onOptimisticMessage,
      onSendQueued,
      onMessageSent,
      onCancelReply,
      onSendFailed,
      onStopTyping,
      t,
    ]
  );

  return { sendSticker, stickerBusy: false as const };
}
