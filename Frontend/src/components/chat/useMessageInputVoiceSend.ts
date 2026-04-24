import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import { chatApi } from '@/api/chat';
import type { ChatContextType, ChatMessage, OptimisticMessagePayload } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { mediaApi } from '@/api/media';
import { draftStorage } from '@/services/draftStorage';
import {
  extractWaveformPeaksFromBlob,
  placeholderWaveform,
  VOICE_MESSAGE_MAX_MS,
} from '@/components/audio/audioWaveformUtils';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
type VoiceRecorder = {
  start: () => Promise<boolean>;
  stop: () => Promise<{ blob: Blob; durationMs: number } | null>;
  cancel: () => void;
  error: 'denied' | 'insecure' | 'unknown' | null;
  durationMs: number;
  liveLevels: number[];
};

type Params = {
  voiceRecorder: VoiceRecorder;
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
  onMessageCreated?: (optimisticId: string, serverMessage: ChatMessage) => void;
  onSendFailed?: (optimisticId: string) => void;
  onStopTyping?: () => void;
  t: TFunction;
};

export function useMessageInputVoiceSend({
  voiceRecorder,
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
  onMessageCreated,
  onSendFailed,
  onStopTyping,
  t,
}: Params) {
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);

  useEffect(() => {
    if (voiceRecorder.error === 'denied') {
      toast.error(t('chat.micPermissionDenied', { defaultValue: 'Microphone access denied' }));
    } else if (voiceRecorder.error === 'insecure') {
      toast.error(t('chat.micNeedsHttps', { defaultValue: 'Microphone requires HTTPS' }));
    }
  }, [voiceRecorder.error, t]);

  const handleStartVoice = async () => {
    if (isDisabled || inputBlocked) return;
    const ok = await voiceRecorder.start();
    if (ok) setVoiceMode(true);
  };

  const handleVoiceCancel = () => {
    voiceRecorder.cancel();
    setVoiceMode(false);
  };

  const handleVoiceConfirm = async () => {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleVoiceConfirm());
      return;
    }
    const result = await voiceRecorder.stop();
    setVoiceMode(false);
    if (!result || result.durationMs < 500) {
      toast.error(t('chat.voiceTooShort', { defaultValue: 'Recording too short' }));
      return;
    }
    if (result.durationMs > VOICE_MESSAGE_MAX_MS) {
      toast.error(t('chat.voiceMaxDuration', { defaultValue: 'Recording cannot exceed 30 minutes' }));
      return;
    }
    const durationMs = Math.min(result.durationMs, VOICE_MESSAGE_MAX_MS);
    if (!finalContextId) {
      toast.error(t('chat.missingContextId'));
      return;
    }
    let optimisticId: string | undefined;
    setVoiceBusy(true);
    try {
      let peaks: number[] = [];
      try {
        peaks = await extractWaveformPeaksFromBlob(result.blob);
      } catch {
        peaks = placeholderWaveform(48);
      }
      if (!peaks.length) peaks = placeholderWaveform(48);
      const useOptimistic = !!onOptimisticMessage;
      const useQueue = useOptimistic && !!onSendQueued && propContextType != null && propContextId != null;

      if (useQueue && onOptimisticMessage) {
        const blobUrl = URL.createObjectURL(result.blob);
        const payload: OptimisticMessagePayload = {
          content: '',
          mediaUrls: [blobUrl],
          thumbnailUrls: [],
          replyToId: replyTo?.id,
          replyTo: replyTo
            ? {
                id: replyTo.id,
                content: replyTo.content,
                sender: replyTo.sender || { id: 'system', firstName: 'System' },
              }
            : undefined,
          chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
          mentionIds: [],
          messageType: 'VOICE',
          audioDurationMs: durationMs,
          waveformData: peaks,
        };
        optimisticId = onOptimisticMessage(payload, undefined, result.blob);
        if (optimisticId) {
          onMessageSent?.();
          onCancelReply?.();
        }
        if (optimisticId) {
          onSendQueued!({
            tempId: optimisticId,
            contextType: propContextType!,
            contextId: propContextId!,
            payload: { ...payload, mediaUrls: [], thumbnailUrls: [] },
          });
          onStopTyping?.();
        }
      } else {
        const ext = result.blob.type.includes('mp4') ? 'm4a' : 'webm';
        const uploaded = await mediaApi.uploadChatAudio(result.blob, `voice.${ext}`, finalContextId, contextType);
        const payload: OptimisticMessagePayload = {
          content: '',
          mediaUrls: [uploaded.audioUrl],
          thumbnailUrls: [],
          replyToId: replyTo?.id,
          replyTo: replyTo
            ? {
                id: replyTo.id,
                content: replyTo.content,
                sender: replyTo.sender || { id: 'system', firstName: 'System' },
              }
            : undefined,
          chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
          mentionIds: [],
          messageType: 'VOICE',
          audioDurationMs: durationMs,
          waveformData: peaks,
        };
        if (useOptimistic) {
          optimisticId = onOptimisticMessage!(payload);
          if (optimisticId) {
            onMessageSent?.();
            onCancelReply?.();
          }
        }
        const messageData = {
          chatContextType: contextType,
          contextId: finalContextId,
          mediaUrls: [uploaded.audioUrl],
          replyToId: replyTo?.id,
          chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
          messageType: 'VOICE' as const,
          audioDurationMs: durationMs,
          waveformData: peaks,
        };
        const created = await chatApi.createMessage(messageData);
        if (useOptimistic && optimisticId && onMessageCreated) {
          onMessageCreated(optimisticId, created);
        }
        onStopTyping?.();
      }
      if (finalContextId && userId) {
        const resolvedType = userChatId ? 'PUBLIC' : normalizeChatType(chatType);
        await draftStorage.remove(userId, contextType, finalContextId, resolvedType);
        try {
          await chatApi.deleteDraft(contextType, finalContextId, resolvedType);
          window.dispatchEvent(
            new CustomEvent('draft-deleted', {
              detail: { chatContextType: contextType, contextId: finalContextId, chatType: resolvedType },
            })
          );
        } catch {
          /* noop */
        }
      }
    } catch (err) {
      if (optimisticId && onSendFailed) {
        onSendFailed(optimisticId);
      }
      console.error('Voice send failed:', err);
      toast.error(t('chat.sendFailed'));
    } finally {
      setVoiceBusy(false);
    }
  };

  return {
    voiceMode,
    voiceBusy,
    handleStartVoice,
    handleVoiceCancel,
    handleVoiceConfirm,
  };
}
