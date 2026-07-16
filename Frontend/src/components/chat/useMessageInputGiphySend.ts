import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import type { ChatContextType, ChatMessage, OptimisticMessagePayload } from '@/api/chat';
import { importGiphyGif, type GiphySearchItem } from '@/api/giphy';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { lightHaptic } from '@/utils/lightHaptic';
import { deleteDraftFromComposer } from '@/components/chat/draftDeleteFlow';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { waitForOutboxReady } from '@/services/chat/chatOutboxEnqueue';

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

function isGiphyCdnUrl(url: string): boolean {
  return /giphy\.com/i.test(url);
}

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
  const sendGenRef = useRef(0);

  const sendGiphy = useCallback(
    async (item: GiphySearchItem) => {
      if (isDisabled || inputBlocked || giphyBusy) return;
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        runWithProfileName(() => void sendGiphy(item));
        return;
      }
      if (!finalContextId) {
        toast.error(t('chat.missingContextId'));
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
      lightHaptic();
      setGiphyBusy(true);
      const loadingToast = toast.loading(
        t('chat.giphy.sending', { defaultValue: 'Sending GIF…' })
      );

      let optimisticId: string | undefined;
      try {
        // Import first so outbox never stores Giphy CDN URLs (no hotlink / empty-IMAGE races).
        const imported = await importGiphyGif(item.downloadUrl);
        if (sendGen !== sendGenRef.current) return;
        if (isGiphyCdnUrl(imported.mediaUrl) || isGiphyCdnUrl(imported.thumbnailUrl)) {
          throw new Error('giphy_hotlink_rejected');
        }

        const payload: OptimisticMessagePayload = {
          content: '',
          mediaUrls: [imported.mediaUrl],
          thumbnailUrls: [imported.thumbnailUrl],
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

        optimisticId = onOptimisticMessage!(payload);
        if (!optimisticId) {
          toast.error(t('chat.sendFailed'));
          return;
        }

        const ready = await waitForOutboxReady(optimisticId, 5_000);
        if (sendGen !== sendGenRef.current) {
          if (onSendFailed) onSendFailed(optimisticId);
          return;
        }
        // Persist re-hosted URLs on the outbox row (payload + top-level) for retries.
        // sendWithTimeout also waits if the row is still materializing.
        if (ready || (await messageQueueStorage.getByTempId(optimisticId))) {
          await messageQueueStorage.commitPendingImagesUploaded(
            optimisticId,
            [imported.mediaUrl],
            [imported.thumbnailUrl]
          );
        }

        onMessageSent?.();
        onCancelReply?.();
        onStopTyping?.();
        onSendQueued!({
          tempId: optimisticId,
          contextType: propContextType!,
          contextId: propContextId!,
          payload,
          mediaUrls: [imported.mediaUrl],
          thumbnailUrls: [imported.thumbnailUrl],
        });

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
        const status =
          err && typeof err === 'object'
            ? (err as { response?: { status?: number; data?: { code?: string } } }).response?.status
            : undefined;
        const code =
          err && typeof err === 'object'
            ? (err as { response?: { data?: { code?: string } } }).response?.data?.code
            : undefined;
        if (status === 429 || code === 'giphy.importRateLimited') {
          toast.error(
            t('chat.giphy.rateLimited', { defaultValue: 'Too many GIFs — try again shortly' })
          );
        } else if (status === 503 || code === 'giphy.searchUnavailable') {
          toast.error(
            t('chat.giphy.unavailable', { defaultValue: 'GIF search is unavailable right now' })
          );
        } else {
          toast.error(t('chat.giphy.sendFailed', { defaultValue: 'Could not send GIF' }));
        }
      } finally {
        if (sendGen === sendGenRef.current) {
          toast.dismiss(loadingToast);
          setGiphyBusy(false);
        } else {
          toast.dismiss(loadingToast);
        }
      }
    },
    [
      isDisabled,
      inputBlocked,
      giphyBusy,
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
