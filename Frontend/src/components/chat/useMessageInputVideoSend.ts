import { useState } from 'react';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import type { ChatContextType, ChatMessage, OptimisticMessagePayload } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { prepareChatVideoForSend } from '@/services/chat/chatVideoTranscode';
import { buildReplyToRef } from '@/utils/buildReplyToRef';

type Params = {
  isDisabled: boolean;
  inputBlocked: boolean;
  finalContextId: string | undefined;
  contextType: ChatContextType;
  chatType: ChatType;
  replyTo?: ChatMessage | null;
  onOptimisticMessage?: (
    payload: OptimisticMessagePayload,
    pendingImageBlobs?: Blob[],
    pendingVoiceBlob?: Blob,
    pendingVideoBlob?: Blob,
    pendingVideoPosterBlob?: Blob,
    videoTranscodeMs?: number
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
  t: TFunction;
};

export function useMessageInputVideoSend({
  isDisabled,
  inputBlocked,
  finalContextId,
  contextType,
  chatType,
  replyTo,
  onOptimisticMessage,
  onSendQueued,
  onMessageSent,
  onCancelReply,
  t,
}: Params) {
  const [videoBusy, setVideoBusy] = useState(false);

  const handleVideoFile = async (file: File) => {
    if (isDisabled || inputBlocked || !finalContextId || !onOptimisticMessage) return;
    setVideoBusy(true);
    const prepId = `prep-${Date.now()}`;
    const compressToast = toast.loading(
      t('chat.compressingVideo', { defaultValue: 'Compressing video…' })
    );
    try {
      const prepared = await prepareChatVideoForSend(file, prepId, {
        onTranscodeProgress: (p) => {
          const pct = Math.round(p * 100);
          if (pct > 0 && pct < 100) {
            toast.loading(
              t('chat.compressingVideoPercent', {
                defaultValue: 'Compressing video… {{percent}}%',
                percent: pct,
              }),
              { id: compressToast }
            );
          }
        },
      });
      const videoBlob = prepared.videoFile;
      const posterUrl = URL.createObjectURL(prepared.posterBlob);
      const videoPreviewUrl = URL.createObjectURL(videoBlob);
      const payload: OptimisticMessagePayload = {
        content: '',
        mediaUrls: [videoPreviewUrl],
        thumbnailUrls: [posterUrl],
        replyToId: replyTo?.id,
        replyTo: replyTo ? buildReplyToRef(replyTo) : undefined,
        chatType: normalizeChatType(chatType),
        mentionIds: [],
        messageType: 'VIDEO',
        videoDurationMs: prepared.durationMs,
        videoWidth: prepared.width,
        videoHeight: prepared.height,
      };
      const tempId = onOptimisticMessage(
        payload,
        undefined,
        undefined,
        videoBlob,
        prepared.posterBlob,
        prepared.transcodeMs
      );
      onSendQueued?.({
        tempId,
        contextType,
        contextId: finalContextId,
        payload: {
          ...payload,
          mediaUrls: [],
          thumbnailUrls: [],
          videoDurationMs: prepared.durationMs,
          videoWidth: prepared.width,
          videoHeight: prepared.height,
        },
        mediaUrls: [],
        thumbnailUrls: [],
      });
      onCancelReply?.();
      onMessageSent?.();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'video_too_long') {
        toast.error(t('chat.videoTooLong', { defaultValue: 'Video is too long (max 3 minutes)' }));
      } else if (code === 'video_too_large') {
        toast.error(t('chat.videoTooLarge', { defaultValue: 'Video file is too large' }));
      } else if (code === 'video_transcode_unavailable') {
        toast.error(
          t('chat.videoTranscodeUnavailable', {
            defaultValue: 'Video encoding is not supported in this browser.',
          })
        );
      } else if (code === 'video_transcode_failed' || code === 'video_probe_failed') {
        toast.error(t('chat.videoSendFailed', { defaultValue: 'Could not prepare video' }));
      } else {
        toast.error(t('chat.videoSendFailed', { defaultValue: 'Could not prepare video' }));
      }
    } finally {
      toast.dismiss(compressToast);
      setVideoBusy(false);
    }
  };

  return { videoBusy, handleVideoFile };
};
