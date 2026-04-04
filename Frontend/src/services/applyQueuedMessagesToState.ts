import type React from 'react';
import { ChatContextType, ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import { BasicUser, ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { messageQueueStorage, QueuedMessage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, isSending } from '@/services/chatSendService';
import { compareChatMessagesAscending } from '@/utils/chatMessageSort';
import { loadOutboxImageBlobs, loadOutboxVoiceBlob } from '@/services/chat/chatOutboxMediaBlobs';
import { logChatOutboxBlobMismatch } from '@/services/chat/chatDiagnostics';
import {
  registerOutboxRehydrateBlobUrls,
  revokeOutboxRehydrateBlobUrls,
} from '@/services/chat/chatOutboxRehydrateUrls';

export function queueItemMatchesServerMessage(q: QueuedMessage, m: { id: string; senderId: string | null; content: string; chatType: string; replyToId?: string | null; mentionIds?: string[] }, userId: string | undefined): boolean {
  if (!userId || m.senderId !== userId) return false;
  if (m.content !== (q.payload.content ?? '')) return false;
  if (normalizeChatType(m.chatType as ChatType) !== normalizeChatType(q.payload.chatType)) return false;
  if ((m.replyToId ?? null) !== (q.payload.replyToId ?? null)) return false;
  const mMentions = (m.mentionIds?.slice().sort() ?? []) as string[];
  const qMentions = (q.payload.mentionIds?.slice().sort() ?? []) as string[];
  return mMentions.length === qMentions.length && !mMentions.some((id, i) => id !== qMentions[i]);
}

function serverMessageMatchesQueuedItem(
  q: QueuedMessage,
  m: {
    id: string;
    senderId: string | null;
    content: string;
    chatType: string;
    replyToId?: string | null;
    mentionIds?: string[];
    clientMutationId?: string | null;
  },
  userId: string | undefined
): boolean {
  const qCid = q.clientMutationId?.trim() ?? '';
  const mCid = m.clientMutationId?.trim() ?? '';
  if (mCid && qCid) return mCid === qCid;
  if (!mCid && !qCid) return queueItemMatchesServerMessage(q, m, userId);
  return false;
}

export async function applyQueuedMessagesToState(params: {
  contextType: ChatContextType;
  contextId: string;
  currentChatType: ChatType;
  userId: string;
  user: BasicUser | null;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  handleMarkFailed: (tempId: string) => void;
  onMessageCreated?: (message: ChatMessage) => void;
}): Promise<void> {
  const { contextType, contextId, currentChatType, userId, user, messagesRef, setMessages, handleMarkFailed, onMessageCreated } = params;
  const queue = await messageQueueStorage.getByContext(contextType, contextId);
  const normalizedCurrent = normalizeChatType(currentChatType);
  const queueForTab = queue.filter(q => normalizeChatType(q.payload.chatType) === normalizedCurrent);
  if (queueForTab.length === 0) return;

  const serverMessages = messagesRef.current.filter((m) => !(m as ChatMessageWithStatus)._optimisticId);
  const matchedTempIds = queueForTab
    .filter((q) =>
      serverMessages.some((m) => {
        const st = m as ChatMessageWithStatus;
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
  matchedTempIds.forEach(tempId => messageQueueStorage.remove(tempId, contextType, contextId).catch(() => {}));
  const queueForTabFiltered = queueForTab.filter(q => !matchedTempIds.includes(q.tempId));

  type HydrateOk = { kind: 'ok'; q: QueuedMessage; mediaUrls: string[]; thumbnailUrls: string[] };
  type HydrateBroken = { kind: 'broken'; q: QueuedMessage };
  const hydrateResults = await Promise.all(
    queueForTabFiltered.map(async (q): Promise<HydrateOk | HydrateBroken> => {
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
      }
      return { kind: 'ok', q, mediaUrls, thumbnailUrls };
    })
  );

  for (const r of hydrateResults) {
    if (r.kind !== 'broken') continue;
    revokeOutboxRehydrateBlobUrls(r.q.tempId);
    await messageQueueStorage.updateStatus(r.q.tempId, r.q.contextType, r.q.contextId, 'failed').catch(() => {});
    handleMarkFailed(r.q.tempId);
  }

  const ok = hydrateResults.filter((r): r is HydrateOk => r.kind === 'ok');
  for (const h of ok) {
    registerOutboxRehydrateBlobUrls(h.q.tempId, [...h.mediaUrls, ...h.thumbnailUrls]);
  }

  const optimisticList: ChatMessageWithStatus[] = ok.map(({ q, mediaUrls, thumbnailUrls }) => ({
    id: q.tempId,
    chatContextType: q.contextType,
    contextId: q.contextId,
    senderId: userId,
    content: q.payload.content,
    mediaUrls,
    thumbnailUrls,
    mentionIds: q.payload.mentionIds ?? [],
    state: 'SENT',
    chatType: q.payload.chatType,
    messageType: q.payload.messageType,
    audioDurationMs: q.payload.audioDurationMs,
    waveformData: q.payload.waveformData,
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

  const prevSnap = messagesRef.current;
  const newlyAddedTempIds = new Set(
    optimisticList
      .filter((msg) => !prevSnap.some((m) => (m as ChatMessageWithStatus)._optimisticId === msg._optimisticId))
      .map((m) => m._optimisticId!)
  );

  setMessages((prev) => {
    const toAdd = optimisticList.filter(
      (msg) => !prev.some((m) => (m as ChatMessageWithStatus)._optimisticId === msg._optimisticId)
    );
    const next = [...prev, ...toAdd].sort(compareChatMessagesAscending);
    messagesRef.current = next;
    return next;
  });

  queueMicrotask(() => {
    for (const h of ok) {
      if (h.q.status !== 'queued' || isSending(h.q.tempId)) continue;
      if (!newlyAddedTempIds.has(h.q.tempId)) continue;
      sendWithTimeout(
        {
          tempId: h.q.tempId,
          contextType: h.q.contextType,
          contextId: h.q.contextId,
          payload: h.q.payload,
          mediaUrls: h.q.mediaUrls,
          thumbnailUrls: h.q.thumbnailUrls,
          clientMutationId: h.q.clientMutationId,
        },
        { onFailed: handleMarkFailed, onSuccess: onMessageCreated }
      );
    }
  });
}
