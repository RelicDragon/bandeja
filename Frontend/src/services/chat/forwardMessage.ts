import {
  type ChatContextType,
  type ChatMessage,
  type OptimisticMessagePayload,
} from '@/api/chat';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout } from '@/services/chatSendService';
import type { ChatOutboxRow } from '@/services/chat/chatLocalDb';

/** Message types that can be re-sent into another chat via Forward (v1). */
export const FORWARDABLE_MESSAGE_TYPES = new Set(['TEXT', 'IMAGE', 'STICKER']);

/** Can this message be forwarded? Excludes system, voice, video, and poll messages. */
export function isForwardableMessage(
  message: Pick<ChatMessage, 'messageType' | 'senderId'>
): boolean {
  if (!message.senderId) return false;
  return FORWARDABLE_MESSAGE_TYPES.has(message.messageType ?? 'TEXT');
}

/**
 * Build the send payload for a forwarded copy of `message`. Strips reply/mentions/poll
 * and (for media) reuses the already-hosted CDN URLs — no re-upload, no provider hotlinks.
 * Returns null for non-forwardable messages.
 */
export function buildForwardPayload(
  message: ChatMessage
): { payload: OptimisticMessagePayload; mediaUrls: string[]; thumbnailUrls: string[] } | null {
  if (!isForwardableMessage(message)) return null;

  if (message.messageType === 'STICKER') {
    const payload: OptimisticMessagePayload = {
      content: '',
      mediaUrls: [],
      thumbnailUrls: [],
      chatType: 'PUBLIC',
      mentionIds: [],
      messageType: 'STICKER',
      stickerId: message.stickerId ?? undefined,
      stickerEmoji: message.stickerEmoji ?? undefined,
    };
    return { payload, mediaUrls: [], thumbnailUrls: [] };
  }

  // TEXT or IMAGE (GIFs are IMAGE with a .gif media URL).
  const mediaUrls = Array.isArray(message.mediaUrls) ? [...message.mediaUrls] : [];
  const thumbnailUrls = Array.isArray(message.thumbnailUrls)
    ? [...message.thumbnailUrls]
    : [];
  const payload: OptimisticMessagePayload = {
    content: message.content ?? '',
    mediaUrls,
    thumbnailUrls,
    chatType: 'PUBLIC',
    mentionIds: [],
    messageType: message.messageType === 'IMAGE' ? 'IMAGE' : 'TEXT',
  };
  return { payload, mediaUrls, thumbnailUrls };
}

/**
 * Enqueue and send a forwarded copy of `message` into the destination chat. Writes an
 * outbox row for the destination context (so its thread-index preview updates to
 * "Sending…" immediately) then dispatches the send via the shared send service. The
 * created message lands in the destination thread via socket sync.
 */
export async function forwardMessageToContext(
  message: ChatMessage,
  destContextType: ChatContextType,
  destContextId: string
): Promise<boolean> {
  const built = buildForwardPayload(message);
  if (!built) return false;
  const { payload, mediaUrls, thumbnailUrls } = built;

  const tempId = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const clientMutationId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;

  const row: ChatOutboxRow = {
    tempId,
    contextType: destContextType,
    contextId: destContextId,
    payload,
    createdAt: new Date().toISOString(),
    status: 'sending',
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
    clientMutationId,
  };

  await messageQueueStorage.add(row);

  sendWithTimeout(
    {
      tempId,
      contextType: destContextType,
      contextId: destContextId,
      payload,
      mediaUrls,
      thumbnailUrls,
      clientMutationId,
    },
    {
      onFailed: () => {
        messageQueueStorage
          .updateStatus(tempId, destContextType, destContextId, 'failed')
          .catch(() => undefined);
      },
    }
  );

  return true;
}
