import type { ChatContextType, ChatMessageWithStatus } from '@/api/chat';
import type { BasicUser, ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { messageQueueStorage, type QueuedMessage } from '@/services/chatMessageQueueStorage';
import {
  loadOutboxImageBlobs,
  loadOutboxDocumentBlob,
  loadOutboxVideoBlob,
  loadOutboxVideoPosterBlob,
  loadOutboxVoiceBlob,
} from '@/services/chat/chatOutboxMediaBlobs';
import { logChatOutboxBlobMismatch } from '@/services/chat/chatDiagnostics';
import { reconcileUnsendableOutboxRow } from '@/services/chat/chatOutboxReconcile';
import { registerOutboxRehydrateBlobUrls } from '@/services/chat/chatOutboxRehydrateUrls';
import { serverMessageMatchesQueuedItem } from '@/services/applyQueuedMessagesToState';
import { primeChatMediaDimensions } from '@/services/chat/chatMediaAssetCache';

type HydrateOk = { kind: 'ok'; q: QueuedMessage; mediaUrls: string[]; thumbnailUrls: string[] };

/** Hydrate outbox rows for open snapshot merge (no setMessages). */
export async function buildOutboxOptimisticsForOpen(params: {
  contextType: ChatContextType;
  contextId: string;
  currentChatType: ChatType;
  userId: string;
  user: BasicUser | null;
  existingMessages: readonly ChatMessageWithStatus[];
}): Promise<{ optimistics: ChatMessageWithStatus[]; hydratedOk: HydrateOk[] }> {
  const { contextType, contextId, currentChatType, userId, user, existingMessages } = params;
  const queue = await messageQueueStorage.getByContext(contextType, contextId);
  const normalizedCurrent = normalizeChatType(currentChatType);
  const queueForTab = queue.filter((q) => normalizeChatType(q.payload.chatType) === normalizedCurrent);
  if (queueForTab.length === 0) return { optimistics: [], hydratedOk: [] };

  const serverMessages = existingMessages.filter((m) => !m._optimisticId);
  const matchedTempIds = queueForTab
    .filter((q) =>
      serverMessages.some((m) => {
        const st = m;
        const cid = m.clientMutationId ?? st._clientMutationId ?? null;
        return serverMessageMatchesQueuedItem(
          q,
          {
            id: m.id,
            senderId: m.senderId,
            content: m.content ?? '',
            chatType: m.chatType,
            replyToId: m.replyToId,
            mentionIds: m.mentionIds,
            clientMutationId: cid,
          },
          userId
        );
      })
    )
    .map((q) => q.tempId);
  matchedTempIds.forEach((tempId) =>
    messageQueueStorage.remove(tempId, contextType, contextId).catch(() => {})
  );
  const queueForTabFiltered = queueForTab.filter((q) => !matchedTempIds.includes(q.tempId));

  const hydrateResults = await Promise.all(
    queueForTabFiltered.map(async (q): Promise<HydrateOk | { kind: 'broken'; q: QueuedMessage }> => {
      if (q.pendingGiphy) {
        primeChatMediaDimensions(q.pendingGiphy.previewUrl, {
          width: q.pendingGiphy.width,
          height: q.pendingGiphy.height,
        });
      }
      let mediaUrls = q.payload.mediaUrls ?? q.mediaUrls ?? [];
      let thumbnailUrls = q.payload.thumbnailUrls ?? q.thumbnailUrls ?? [];
      const imgCount = q.pendingImageBlobCount ?? 0;
      if (imgCount > 0) {
        const blobs = await loadOutboxImageBlobs(q.tempId, imgCount);
        if (blobs.length !== imgCount) {
          logChatOutboxBlobMismatch('rehydrate', {
            tempId: q.tempId,
            contextType: q.contextType,
            contextId: q.contextId,
            expected: imgCount,
            got: blobs.length,
            kind: 'image',
          });
          return { kind: 'broken', q };
        }
        mediaUrls = blobs.map((b) => URL.createObjectURL(b));
        thumbnailUrls = [...mediaUrls];
      } else if (q.payload.messageType === 'VIDEO' && q.hasPendingVideoBlob) {
        const vb = await loadOutboxVideoBlob(q.tempId);
        const pb = await loadOutboxVideoPosterBlob(q.tempId);
        if (!vb || !pb) {
          logChatOutboxBlobMismatch('rehydrate', {
            tempId: q.tempId,
            contextType: q.contextType,
            contextId: q.contextId,
            kind: 'video',
          });
          return { kind: 'broken', q };
        }
        mediaUrls = [URL.createObjectURL(vb)];
        thumbnailUrls = [URL.createObjectURL(pb)];
      } else if (q.payload.messageType === 'VOICE' && q.hasPendingVoiceBlob) {
        const vb = await loadOutboxVoiceBlob(q.tempId);
        if (!vb) {
          logChatOutboxBlobMismatch('rehydrate', {
            tempId: q.tempId,
            contextType: q.contextType,
            contextId: q.contextId,
            kind: 'voice',
          });
          return { kind: 'broken', q };
        }
        mediaUrls = [URL.createObjectURL(vb)];
        thumbnailUrls = [];
      } else if (q.payload.messageType === 'DOCUMENT' && q.hasPendingDocumentBlob) {
        const db = await loadOutboxDocumentBlob(q.tempId);
        if (!db) {
          logChatOutboxBlobMismatch('rehydrate', {
            tempId: q.tempId,
            contextType: q.contextType,
            contextId: q.contextId,
            kind: 'document',
          });
          return { kind: 'broken', q };
        }
        mediaUrls = [URL.createObjectURL(db)];
        thumbnailUrls = [];
      }
      return { kind: 'ok', q, mediaUrls, thumbnailUrls };
    })
  );

  for (const r of hydrateResults) {
    if (r.kind !== 'broken') continue;
    await reconcileUnsendableOutboxRow(r.q);
  }

  const ok = hydrateResults.filter((r): r is HydrateOk => r.kind === 'ok');
  for (const h of ok) {
    registerOutboxRehydrateBlobUrls(h.q.tempId, [...h.mediaUrls, ...h.thumbnailUrls]);
  }

  const optimistics: ChatMessageWithStatus[] = ok.map(({ q, mediaUrls, thumbnailUrls }) => ({
    id: q.tempId,
    chatContextType: q.contextType,
    contextId: q.contextId,
    senderId: userId,
    content: q.payload.content,
    mediaUrls,
    thumbnailUrls,
    mentionIds: q.payload.mentionIds ?? [],
    linkPreviewUrl: q.payload.linkPreviewUrl,
    linkPreviewDisabled: q.payload.linkPreviewDisabled,
    linkPreview: q.payload.linkPreview,
    state: 'SENT',
    chatType: q.payload.chatType,
    messageType: q.payload.messageType,
    stickerId: q.payload.stickerId,
    stickerEmoji: q.payload.stickerEmoji,
    audioDurationMs: q.payload.audioDurationMs,
    videoDurationMs: q.payload.videoDurationMs,
    videoWidth: q.payload.videoWidth,
    videoHeight: q.payload.videoHeight,
    waveformData: q.payload.waveformData,
    documentFileName: q.payload.documentFileName,
    documentMimeType: q.payload.documentMimeType,
    documentSize: q.payload.documentSize,
    createdAt: q.createdAt,
    updatedAt: q.createdAt,
    replyToId: q.payload.replyToId,
    replyTo: q.payload.replyTo,
    sender: user ?? null,
    reactions: [],
    readReceipts: [],
    _status: q.status === 'failed' ? 'FAILED' : 'SENDING',
    _optimisticId: q.tempId,
    _clientMutationId: q.clientMutationId,
  }));

  return { optimistics, hydratedOk: ok };
}
