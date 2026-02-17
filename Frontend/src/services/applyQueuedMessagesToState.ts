import type React from 'react';
import { ChatContextType, ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import { BasicUser, ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { messageQueueStorage, QueuedMessage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, isSending } from '@/services/chatSendService';

export function queueItemMatchesServerMessage(q: QueuedMessage, m: { id: string; senderId: string | null; content: string; chatType: string; replyToId?: string | null; mentionIds?: string[] }, userId: string | undefined): boolean {
  if (!userId || m.senderId !== userId) return false;
  if (m.content !== (q.payload.content ?? '')) return false;
  if (normalizeChatType(m.chatType as ChatType) !== normalizeChatType(q.payload.chatType)) return false;
  if ((m.replyToId ?? null) !== (q.payload.replyToId ?? null)) return false;
  const mMentions = (m.mentionIds?.slice().sort() ?? []) as string[];
  const qMentions = (q.payload.mentionIds?.slice().sort() ?? []) as string[];
  return mMentions.length === qMentions.length && !mMentions.some((id, i) => id !== qMentions[i]);
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

  const serverMessages = messagesRef.current.filter(m => !(m as ChatMessageWithStatus)._optimisticId);
  const matchedTempIds = queueForTab.filter(q => serverMessages.some(m => queueItemMatchesServerMessage(q, m, userId))).map(q => q.tempId);
  matchedTempIds.forEach(tempId => messageQueueStorage.remove(tempId, contextType, contextId).catch(() => {}));
  const queueForTabFiltered = queueForTab.filter(q => !matchedTempIds.includes(q.tempId));
  const optimisticList: ChatMessageWithStatus[] = queueForTabFiltered.map(q => ({
    id: q.tempId,
    chatContextType: q.contextType,
    contextId: q.contextId,
    senderId: userId,
    content: q.payload.content,
    mediaUrls: q.payload.mediaUrls ?? q.mediaUrls ?? [],
    thumbnailUrls: q.payload.thumbnailUrls ?? q.thumbnailUrls ?? [],
    mentionIds: q.payload.mentionIds ?? [],
    state: 'SENT',
    chatType: q.payload.chatType,
    createdAt: q.createdAt,
    updatedAt: q.createdAt,
    replyToId: q.payload.replyToId,
    replyTo: q.payload.replyTo,
    sender: user ?? null,
    reactions: [],
    readReceipts: [],
    _status: q.status === 'failed' ? 'FAILED' : 'SENDING',
    _optimisticId: q.tempId,
  }));

  setMessages(prev => {
    const toAdd = optimisticList.filter(msg => !prev.some(m => (m as ChatMessageWithStatus)._optimisticId === msg._optimisticId));
    const next = [...prev, ...toAdd];
    messagesRef.current = next;
    queueForTabFiltered.filter(q => q.status === 'queued' && !isSending(q.tempId) && toAdd.some(a => a._optimisticId === q.tempId)).forEach(q => {
      sendWithTimeout(
        { tempId: q.tempId, contextType: q.contextType, contextId: q.contextId, payload: q.payload, mediaUrls: q.mediaUrls, thumbnailUrls: q.thumbnailUrls },
        { onFailed: handleMarkFailed, onSuccess: onMessageCreated }
      );
    });
    return next;
  });
}
