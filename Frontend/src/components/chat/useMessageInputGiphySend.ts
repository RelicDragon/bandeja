import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import type { ChatContextType, ChatMessage, OptimisticMessagePayload } from '@/api/chat';
import type { GiphySearchItem } from '@/api/giphy';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { lightHaptic } from '@/utils/lightHaptic';
import { deleteDraftFromComposer } from '@/components/chat/draftDeleteFlow';
import type { PendingGiphyOutboxMedia } from '@/services/chat/chatLocalDb';
import { toPendingGiphyOutboxMedia } from '@/services/chat/chatOutboxGiphy';
import { primeChatMediaDimensions } from '@/services/chat/chatMediaAssetCache';
import { useNetworkStore } from '@/utils/networkStatus';
import { waitForOutboxReady } from '@/services/chat/chatOutboxEnqueue';
import { isGifProviderHostedUrl } from '@/utils/gifProviderUrl';

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
    pendingVoiceBlob?: Blob,
    pendingVideoBlob?: Blob,
    pendingVideoPosterBlob?: Blob,
    videoTranscodeMs?: number,
    pendingGiphy?: PendingGiphyOutboxMedia
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

export function useMessageInputGiphySend({
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
  const [giphyBusy, setGiphyBusy] = useState(false);
  const busyRef = useRef(false);
  const sendGenRef = useRef(0);

  const sendGiphy = useCallback(
    async (item: GiphySearchItem) => {
      if (isDisabled || inputBlocked || busyRef.current) return;
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        runWithProfileName(() => void sendGiphy(item));
        return;
      }
      if (!finalContextId) {
        toast.error(t('chat.missingContextId'));
        return;
      }
      if (
        !isGifProviderHostedUrl(item.downloadUrl) ||
        !isGifProviderHostedUrl(item.previewUrl)
      ) {
        toast.error(t('chat.giphy.sendFailed', { defaultValue: 'Could not queue GIF' }));
        return;
      }

      const useOptimistic = !!onOptimisticMessage;
      const useQueue =
        useOptimistic && !!onSendQueued && propContextType != null && propContextId != null;
      if (!useQueue) {
        toast.error(t('chat.sendFailed'));
        return;
      }

      const sendGen = ++sendGenRef.current;
      busyRef.current = true;
      lightHaptic();
      setGiphyBusy(true);

      let optimisticId: string | undefined;
      try {
        const pendingGiphy = toPendingGiphyOutboxMedia(item);
        primeChatMediaDimensions(item.previewUrl, {
          width: item.width,
          height: item.height,
        });
        const payload: OptimisticMessagePayload = {
          content: '',
          mediaUrls: [item.previewUrl],
          thumbnailUrls: [item.previewUrl],
          replyToId: replyTo?.id,
          replyTo: replyTo
            ? {
                id: replyTo.id,
                content: replyTo.content,
                sender: replyTo.sender || { id: 'system', firstName: 'System' },
                messageType: replyTo.messageType,
              }
            : undefined,
          chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
          mentionIds: [],
          messageType: 'IMAGE',
        };

        optimisticId = onOptimisticMessage!(
          payload,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          pendingGiphy
        );
        if (!optimisticId) {
          toast.error(t('chat.sendFailed'));
          return;
        }

        const outboxReady = await waitForOutboxReady(optimisticId);
        if (!outboxReady) {
          throw new Error('giphy_outbox_persist_failed');
        }
        onMessageSent?.();
        onCancelReply?.();
        onStopTyping?.();
        if (useNetworkStore.getState().isOnline) {
          onSendQueued!({
            tempId: optimisticId,
            contextType: propContextType!,
            contextId: propContextId!,
            payload,
            mediaUrls: [],
            thumbnailUrls: [],
          });
        }

        if (finalContextId && userId) {
          const resolvedType = userChatId ? 'PUBLIC' : normalizeChatType(chatType);
          try {
            await deleteDraftFromComposer({
              userId,
              contextType,
              contextId: finalContextId,
              chatType: resolvedType,
              previousDraft: null,
            });
          } catch {
            /* noop */
          }
        }
      } catch (err) {
        if (optimisticId && onSendFailed) onSendFailed(optimisticId);
        if (sendGen !== sendGenRef.current) return;
        console.error('Giphy send failed:', err);
        toast.error(t('chat.giphy.sendFailed', { defaultValue: 'Could not queue GIF' }));
      } finally {
        if (sendGen === sendGenRef.current) {
          busyRef.current = false;
          setGiphyBusy(false);
        }
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

  return { sendGiphy, giphyBusy };
}
