import { ChatContextType, ChatMessage, CreateMessageRequest } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { mediaApi } from '@/api/media';
import { uploadChatImageFileWithRetry } from '@/services/chat/chatImageUploadRetry';
import { uploadChatVideoFileWithRetry } from '@/services/chat/chatVideoUploadRetry';
import { messageQueueStorage, QueuedMessage } from './chatMessageQueueStorage';
import { normalizeChatType } from '@/utils/chatType';
import {
  loadOutboxImageBlobs,
  loadOutboxVideoBlob,
  loadOutboxVideoPosterBlob,
  loadOutboxVoiceBlob,
} from '@/services/chat/chatOutboxMediaBlobs';
import { SEND_VIDEO_UPLOAD_PHASE_MS } from '@/constants/chatVideo';
import { logChatOutboxBlobMismatch } from '@/services/chat/chatDiagnostics';
import { waitForOutboxReady } from '@/services/chat/chatOutboxEnqueue';
import {
  OUTBOX_READY_WAIT_MS,
  SEND_API_PHASE_MS,
  SEND_UPLOAD_PHASE_MS,
  armPhaseDeadline,
  beginChatSend,
  clearDeadlineTimer,
  sealChatSendAttempt,
  teardownChatSendAttempt,
  invalidateChatSend,
  invalidateChatSendsForContext,
  isAbortError,
  isActiveSendGeneration,
  isSending,
  runWithAbort,
  throwIfAborted,
} from '@/services/chat/chatSendCoordinator';
import { recordChatSendMetric } from '@/services/chat/chatSendMetrics';
import { createMessageWithSocketAck } from '@/services/chat/chatSendMessageCreate';
import { dispatchChatOutboxSuccess } from '@/services/chat/chatOutboxEvents';
import { reconcileAbortedChatSendIfDelivered } from '@/services/chat/chatOutboxReconcile';
import { useVideoUploadProgressStore } from '@/store/videoUploadProgressStore';
function completeChatSendSuccess(
  tempId: string,
  contextType: ChatContextType,
  contextId: string,
  created: ChatMessage,
  callbacks: SendQueuedCallbacks
): void {
  callbacks.onSuccess?.(created);
  dispatchChatOutboxSuccess({ tempId, contextType, contextId, message: created });
  void messageQueueStorage.remove(tempId, contextType, contextId).catch((err) => {
    console.error('[messageQueue] remove after send success', err);
  });
}

function imageFileForBlob(blob: Blob, index: number): File {
  const t = (blob.type || '').toLowerCase();
  let ext = 'jpg';
  if (t.includes('png')) ext = 'png';
  else if (t.includes('webp')) ext = 'webp';
  else if (t.includes('gif')) ext = 'gif';
  else if (t.includes('jpeg') || t.includes('jpg')) ext = 'jpg';
  const name = `photo-${index}.${ext}`;
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

function rowNeedsMediaUpload(row: QueuedMessage | undefined): boolean {
  if (!row) return false;
  return !!(
    row.hasPendingVoiceBlob ||
    row.hasPendingVideoBlob ||
    (row.pendingImageBlobCount ?? 0) > 0
  );
}

function uploadPhaseMsForRow(row: QueuedMessage | undefined): number {
  return row?.hasPendingVideoBlob ? SEND_VIDEO_UPLOAD_PHASE_MS : SEND_UPLOAD_PHASE_MS;
}

async function failSendAttempt(
  tempId: string,
  generation: number,
  contextType: ChatContextType,
  contextId: string,
  onFailed: (tempId: string) => void,
  reason: string
): Promise<void> {
  if (!isActiveSendGeneration(tempId, generation)) return;
  teardownChatSendAttempt(tempId);
  await messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed').catch((err) => {
    console.error('[messageQueue] updateStatus', err);
  });
  recordChatSendMetric({
    kind: 'chat_send_failed',
    tempId,
    contextType,
    contextId,
    reason,
  });
  onFailed(tempId);
  sealChatSendAttempt(tempId);
}

export interface SendQueuedParams {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  payload: QueuedMessage['payload'];
  mediaUrls?: string[];
  thumbnailUrls?: string[];
  clientMutationId?: string;
}

export interface SendQueuedCallbacks {
  onFailed: (tempId: string) => void;
  onSuccess?: (message: ChatMessage) => void;
  onRemoved?: (tempId: string) => void;
}

export function sendWithTimeout(
  params: SendQueuedParams,
  callbacks: SendQueuedCallbacks
): void {
  const {
    tempId,
    contextType,
    contextId,
    payload,
    mediaUrls = [],
    thumbnailUrls = [],
    clientMutationId,
  } = params;
  const { onFailed } = callbacks;

  const gateUser = useAuthStore.getState().user;
  if (gateUser && gateUser.nameIsSet !== true) {
    runWithProfileName(() => sendWithTimeout(params, callbacks));
    return;
  }

  invalidateChatSend(tempId);
  const { generation, signal } = beginChatSend(tempId, contextType, contextId);
  const startedAt = Date.now();

  recordChatSendMetric({
    kind: 'chat_send_started',
    tempId,
    contextType,
    contextId,
    hasVideo: payload.messageType === 'VIDEO',
  });

  void (async () => {
    try {
      const outboxReady = await waitForOutboxReady(tempId, OUTBOX_READY_WAIT_MS);
      throwIfAborted(signal);
      if (!isActiveSendGeneration(tempId, generation)) return;
      if (!outboxReady) {
        await failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'outbox_missing');
        return;
      }

      let finalMedia = [...mediaUrls];
      let finalThumb = [...thumbnailUrls];
      let videoUploadBytes: number | undefined;
      const row = await messageQueueStorage.getByTempId(tempId);
      throwIfAborted(signal);
      if (!isActiveSendGeneration(tempId, generation)) return;

      const hasMediaUpload = rowNeedsMediaUpload(row);
      const resolvedClientMutationId = clientMutationId ?? row?.clientMutationId;

      if (hasMediaUpload) {
        armPhaseDeadline(tempId, generation, uploadPhaseMsForRow(row), () => {
          void failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'upload_deadline');
        });
      }

      if (row?.hasPendingVideoBlob) {
        const vb = await loadOutboxVideoBlob(tempId);
        const poster = await loadOutboxVideoPosterBlob(tempId);
        throwIfAborted(signal);
        if (!isActiveSendGeneration(tempId, generation)) return;
        if (!vb) {
          logChatOutboxBlobMismatch('send', { tempId, contextType, contextId, kind: 'video' });
          await failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'video_blob_missing');
          return;
        }
        const durationMs = row.payload.videoDurationMs ?? row.videoDurationMs ?? 0;
        const width = row.payload.videoWidth ?? 0;
        const height = row.payload.videoHeight ?? 0;
        try {
          const videoFile =
            vb instanceof File ? vb : new File([vb], 'chat-video.mp4', { type: vb.type || 'video/mp4' });
          const posterFile =
            poster instanceof File
              ? poster
              : poster
                ? new File([poster], 'poster.jpg', { type: poster.type || 'image/jpeg' })
                : undefined;
          const uploaded = await runWithAbort(signal, () =>
            uploadChatVideoFileWithRetry(
              videoFile,
              posterFile,
              contextId,
              contextType,
              durationMs,
              width,
              height,
              3,
              signal,
              (progress) => useVideoUploadProgressStore.getState().setProgress(tempId, progress)
            )
          );
          useVideoUploadProgressStore.getState().clear(tempId);
          videoUploadBytes = videoFile.size;
          if (!isActiveSendGeneration(tempId, generation)) return;
          await messageQueueStorage.commitPendingVideoUploaded(
            tempId,
            uploaded.videoUrl,
            uploaded.thumbnailUrl,
            uploaded.durationMs || durationMs
          );
          finalMedia = [uploaded.videoUrl];
          finalThumb = [uploaded.thumbnailUrl];
        } catch (e) {
          useVideoUploadProgressStore.getState().clear(tempId);
          if (isAbortError(e) || !isActiveSendGeneration(tempId, generation)) return;
          await failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'video_upload_failed');
          return;
        }
      } else if (row?.hasPendingVoiceBlob) {
        const vb = await loadOutboxVoiceBlob(tempId);
        throwIfAborted(signal);
        if (!isActiveSendGeneration(tempId, generation)) return;
        if (!vb) {
          logChatOutboxBlobMismatch('send', { tempId, contextType, contextId, kind: 'voice' });
          await failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'voice_blob_missing');
          return;
        }
        try {
          const ext = vb.type.includes('mp4') ? 'm4a' : 'webm';
          const uploaded = await runWithAbort(signal, () =>
            mediaApi.uploadChatAudio(vb, `voice.${ext}`, contextId, contextType, { signal })
          );
          if (!isActiveSendGeneration(tempId, generation)) return;
          await messageQueueStorage.commitPendingVoiceUploaded(tempId, uploaded.audioUrl);
          finalMedia = [uploaded.audioUrl];
          finalThumb = [];
        } catch (e) {
          if (isAbortError(e) || !isActiveSendGeneration(tempId, generation)) return;
          await failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'voice_upload_failed');
          return;
        }
      } else {
        const pendingImgCount = row?.pendingImageBlobCount ?? 0;
        const imageBlobs =
          pendingImgCount > 0 ? await loadOutboxImageBlobs(tempId, pendingImgCount) : [];
        throwIfAborted(signal);
        if (!isActiveSendGeneration(tempId, generation)) return;
        if (pendingImgCount > 0 && imageBlobs.length !== pendingImgCount) {
          logChatOutboxBlobMismatch('send', {
            tempId,
            contextType,
            contextId,
            expected: pendingImgCount,
            got: imageBlobs.length,
            kind: 'image',
          });
          await failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'image_blob_missing');
          return;
        }
        if (imageBlobs.length > 0) {
          try {
            const parts = await Promise.all(
              imageBlobs.map((blob, i) =>
                runWithAbort(signal, () =>
                  uploadChatImageFileWithRetry(
                    imageFileForBlob(blob, i),
                    contextId,
                    contextType,
                    3,
                    signal
                  )
                )
              )
            );
            if (!isActiveSendGeneration(tempId, generation)) return;
            finalMedia = parts.map((p) => p.originalUrl);
            finalThumb = parts.map((p) => p.thumbnailUrl);
            await messageQueueStorage.commitPendingImagesUploaded(tempId, finalMedia, finalThumb);
          } catch (e) {
            if (isAbortError(e) || !isActiveSendGeneration(tempId, generation)) return;
            await failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'image_upload_failed');
            return;
          }
        } else if (finalMedia.length === 0 && row?.mediaUrls?.length) {
          finalMedia = [...row.mediaUrls];
          finalThumb = [...(row.thumbnailUrls ?? [])];
        }
      }

      if (!isActiveSendGeneration(tempId, generation)) return;

      clearDeadlineTimer(tempId);
      armPhaseDeadline(tempId, generation, SEND_API_PHASE_MS, () => {
        recordChatSendMetric({
          kind: 'chat_send_deadline',
          tempId,
          contextType,
          contextId,
          phase: 'api',
          durationMs: Date.now() - startedAt,
        });
        void failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'api_deadline');
      });

      await messageQueueStorage
        .updateStatus(tempId, contextType, contextId, 'sending', finalMedia, finalThumb)
        .catch((err) => console.error('[messageQueue] updateStatus', err));

      const latest = await messageQueueStorage.getByTempId(tempId);
      throwIfAborted(signal);
      if (!isActiveSendGeneration(tempId, generation)) return;
      const p = latest?.payload ?? payload;

      const request: CreateMessageRequest = {
        chatContextType: contextType,
        contextId,
        content: p.content || undefined,
        mediaUrls: finalMedia.length > 0 ? finalMedia : [],
        thumbnailUrls: finalThumb.length > 0 ? finalThumb : undefined,
        replyToId: p.replyToId,
        chatType: p.chatType ? normalizeChatType(p.chatType) : undefined,
        mentionIds: p.mentionIds?.length ? p.mentionIds : undefined,
        messageType: p.messageType,
        audioDurationMs: p.audioDurationMs,
        videoDurationMs: p.videoDurationMs,
        videoWidth: p.videoWidth,
        videoHeight: p.videoHeight,
        waveformData: p.waveformData,
        ...(resolvedClientMutationId ? { clientMutationId: resolvedClientMutationId } : {}),
      };

      const created = await createMessageWithSocketAck(
        request,
        contextType,
        contextId,
        resolvedClientMutationId,
        signal,
        tempId
      );
      const generationStale = !isActiveSendGeneration(tempId, generation);
      if (!generationStale) sealChatSendAttempt(tempId);
      recordChatSendMetric({
        kind: 'chat_send_succeeded',
        tempId,
        contextType,
        contextId,
        hasMedia: hasMediaUpload,
        hasVideo: p.messageType === 'VIDEO',
        transcodeMs: latest?.videoTranscodeMs,
        uploadBytes: videoUploadBytes,
        durationMs: Date.now() - startedAt,
      });
      completeChatSendSuccess(tempId, contextType, contextId, created, callbacks);
    } catch (e) {
      if (isAbortError(e) || !isActiveSendGeneration(tempId, generation)) {
        await reconcileAbortedChatSendIfDelivered(tempId, contextType, contextId);
        return;
      }
      await failSendAttempt(tempId, generation, contextType, contextId, onFailed, 'send_error');
    }
  })();
}

export { isSending };

export function cancelSend(tempId: string): void {
  invalidateChatSend(tempId);
}

export function cancelAllForContext(contextType: ChatContextType, contextId: string): void {
  invalidateChatSendsForContext(contextType, contextId);
  void messageQueueStorage.requeueSendingForContext(contextType, contextId).catch((err) => {
    console.error('[messageQueue] requeueSendingForContext', err);
  });
}

export async function resend(
  tempId: string,
  contextType: ChatContextType,
  contextId: string,
  callbacks: SendQueuedCallbacks
): Promise<void> {
  const list = await messageQueueStorage.getByContext(contextType, contextId);
  const item = list.find((m) => m.tempId === tempId);
  if (!item) return;
  await messageQueueStorage.updateStatus(tempId, contextType, contextId, 'queued');
  sendWithTimeout(
    {
      tempId,
      contextType,
      contextId,
      payload: item.payload,
      mediaUrls: item.mediaUrls,
      thumbnailUrls: item.thumbnailUrls,
      clientMutationId: item.clientMutationId,
    },
    callbacks
  );
}
