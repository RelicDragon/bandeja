import { chatApi, ChatContextType, ChatMessage, CreateMessageRequest } from '@/api/chat';
import { mediaApi } from '@/api/media';
import { uploadChatImageFileWithRetry } from '@/services/chat/chatImageUploadRetry';
import { messageQueueStorage, QueuedMessage } from './chatMessageQueueStorage';
import { withMessageCreateRetry } from '@/services/chat/chatHttpRetry';
import { normalizeChatType } from '@/utils/chatType';
import { loadOutboxImageBlobs, loadOutboxVoiceBlob } from '@/services/chat/chatOutboxMediaBlobs';
import { logChatOutboxBlobMismatch } from '@/services/chat/chatDiagnostics';

const SEND_ABSOLUTE_DEADLINE_MS = 900_000;

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

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
const contextByTempId = new Map<string, string>();

function contextKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

function clearDeadlineFor(tempId: string): void {
  const t = timeouts.get(tempId);
  if (t) {
    clearTimeout(t);
    timeouts.delete(tempId);
    contextByTempId.delete(tempId);
  }
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
  const { onFailed, onSuccess } = callbacks;

  clearDeadlineFor(tempId);

  const deadlineId = setTimeout(() => {
    timeouts.delete(tempId);
    contextByTempId.delete(tempId);
    messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed').catch(err => { console.error('[messageQueue] updateStatus', err); });
    onFailed(tempId);
  }, SEND_ABSOLUTE_DEADLINE_MS);
  timeouts.set(tempId, deadlineId);
  contextByTempId.set(tempId, contextKey(contextType, contextId));

  void (async () => {
    let finalMedia = [...mediaUrls];
    let finalThumb = [...thumbnailUrls];
    const row = await messageQueueStorage.getByTempId(tempId);
    const resolvedClientMutationId = clientMutationId ?? row?.clientMutationId;

    if (row?.hasPendingVoiceBlob) {
      const vb = await loadOutboxVoiceBlob(tempId);
      if (!vb) {
        logChatOutboxBlobMismatch('send', { tempId, contextType, contextId, kind: 'voice' });
        clearDeadlineFor(tempId);
        await messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed');
        onFailed(tempId);
        return;
      }
      try {
        const ext = vb.type.includes('mp4') ? 'm4a' : 'webm';
        const uploaded = await mediaApi.uploadChatAudio(vb, `voice.${ext}`, contextId, contextType);
        await messageQueueStorage.commitPendingVoiceUploaded(tempId, uploaded.audioUrl);
        finalMedia = [uploaded.audioUrl];
        finalThumb = [];
      } catch {
        clearDeadlineFor(tempId);
        await messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed');
        onFailed(tempId);
        return;
      }
    } else {
      const pendingImgCount = row?.pendingImageBlobCount ?? 0;
      const imageBlobs =
        pendingImgCount > 0 ? await loadOutboxImageBlobs(tempId, pendingImgCount) : [];
      if (pendingImgCount > 0 && imageBlobs.length !== pendingImgCount) {
        logChatOutboxBlobMismatch('send', {
          tempId,
          contextType,
          contextId,
          expected: pendingImgCount,
          got: imageBlobs.length,
          kind: 'image',
        });
        clearDeadlineFor(tempId);
        await messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed');
        onFailed(tempId);
        return;
      }
      if (imageBlobs.length > 0) {
        try {
          const parts = await Promise.all(
            imageBlobs.map((blob, i) =>
              uploadChatImageFileWithRetry(imageFileForBlob(blob, i), contextId, contextType)
            )
          );
          finalMedia = parts.map((p) => p.originalUrl);
          finalThumb = parts.map((p) => p.thumbnailUrl);
          await messageQueueStorage.commitPendingImagesUploaded(tempId, finalMedia, finalThumb);
        } catch {
          clearDeadlineFor(tempId);
          await messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed');
          onFailed(tempId);
          return;
        }
      } else if (finalMedia.length === 0 && row?.mediaUrls?.length) {
        finalMedia = [...row.mediaUrls];
        finalThumb = [...(row.thumbnailUrls ?? [])];
      }
    }

    await messageQueueStorage
      .updateStatus(tempId, contextType, contextId, 'sending', finalMedia, finalThumb)
      .catch((err) => console.error('[messageQueue] updateStatus', err));

    const latest = await messageQueueStorage.getByTempId(tempId);
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
      waveformData: p.waveformData,
      ...(resolvedClientMutationId ? { clientMutationId: resolvedClientMutationId } : {}),
    };

    withMessageCreateRetry(() => chatApi.createMessage(request)).then(
      (created) => {
        clearDeadlineFor(tempId);
        onSuccess?.(created);
        void messageQueueStorage.remove(tempId, contextType, contextId).catch((err) => {
          console.error('[messageQueue] remove after send success', err);
        });
      },
      () => {
        clearDeadlineFor(tempId);
        messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed').catch((err) => {
          console.error('[messageQueue] updateStatus', err);
        });
        onFailed(tempId);
      }
    );
  })();
}

export function isSending(tempId: string): boolean {
  return contextByTempId.has(tempId);
}

export function cancelSend(tempId: string): void {
  clearDeadlineFor(tempId);
}

export function cancelAllForContext(contextType: ChatContextType, contextId: string): void {
  const k = contextKey(contextType, contextId);
  const toCancel = [...contextByTempId.entries()].filter(([, ctx]) => ctx === k).map(([tempId]) => tempId);
  toCancel.forEach(clearDeadlineFor);
}

export async function resend(tempId: string, contextType: ChatContextType, contextId: string, callbacks: SendQueuedCallbacks): Promise<void> {
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
