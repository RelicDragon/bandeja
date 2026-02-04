import { chatApi, ChatContextType, CreateMessageRequest } from '@/api/chat';
import { messageQueueStorage, QueuedMessage } from './chatMessageQueueStorage';
import { normalizeChatType } from '@/utils/chatType';

const SEND_TIMEOUT_MS = 10000;

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
const contextByTempId = new Map<string, string>();

function contextKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

function clearTimeoutFor(tempId: string): void {
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
}

export interface SendQueuedCallbacks {
  onFailed: (tempId: string) => void;
  onRemoved?: (tempId: string) => void;
}

export function sendWithTimeout(
  params: SendQueuedParams,
  callbacks: SendQueuedCallbacks
): void {
  const { tempId, contextType, contextId, payload, mediaUrls = [], thumbnailUrls = [] } = params;
  const { onFailed } = callbacks;

  clearTimeoutFor(tempId);

  messageQueueStorage.updateStatus(tempId, contextType, contextId, 'sending', mediaUrls, thumbnailUrls).catch(err => { console.error('[messageQueue] updateStatus', err); });

  const request: CreateMessageRequest = {
    chatContextType: contextType,
    contextId,
    content: payload.content || undefined,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : [],
    thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
    replyToId: payload.replyToId,
    chatType: payload.chatType ? normalizeChatType(payload.chatType) : undefined,
    mentionIds: payload.mentionIds?.length ? payload.mentionIds : undefined,
  };

  const timeoutId = setTimeout(() => {
    timeouts.delete(tempId);
    contextByTempId.delete(tempId);
    messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed').catch(err => { console.error('[messageQueue] updateStatus', err); });
    onFailed(tempId);
  }, SEND_TIMEOUT_MS);
  timeouts.set(tempId, timeoutId);
  contextByTempId.set(tempId, contextKey(contextType, contextId));

  chatApi.createMessage(request).then(
    () => {
      clearTimeoutFor(tempId);
    },
    () => {
      clearTimeoutFor(tempId);
      messageQueueStorage.updateStatus(tempId, contextType, contextId, 'failed').catch(err => { console.error('[messageQueue] updateStatus', err); });
      onFailed(tempId);
    }
  );
}

export function isSending(tempId: string): boolean {
  return contextByTempId.has(tempId);
}

export function cancelSend(tempId: string): void {
  clearTimeoutFor(tempId);
}

export function cancelAllForContext(contextType: ChatContextType, contextId: string): void {
  const k = contextKey(contextType, contextId);
  const toCancel = [...contextByTempId.entries()].filter(([, ctx]) => ctx === k).map(([tempId]) => tempId);
  toCancel.forEach(clearTimeoutFor);
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
    },
    callbacks
  );
}
