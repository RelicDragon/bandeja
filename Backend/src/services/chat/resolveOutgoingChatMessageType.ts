import { MessageType } from '@prisma/client';

/**
 * Pure resolution used by MessageService.createMessage.
 * Precedence: poll → STICKER → VOICE → VIDEO → DOCUMENT → IMAGE (mediaUrls, incl. post-Giphy) → TEXT.
 * Giphy URL-only paste is applied before this runs (re-host → mediaUrls).
 */
export function resolveOutgoingChatMessageType(params: {
  poll?: unknown;
  requestedMessageType?: MessageType;
  stickerId?: string | null;
  mediaUrls: string[];
}): MessageType {
  if (params.poll) return MessageType.POLL;
  if (params.requestedMessageType === MessageType.STICKER || params.stickerId) {
    return MessageType.STICKER;
  }
  if (params.requestedMessageType === MessageType.VOICE) return MessageType.VOICE;
  if (params.requestedMessageType === MessageType.VIDEO) return MessageType.VIDEO;
  if (params.requestedMessageType === MessageType.DOCUMENT) return MessageType.DOCUMENT;
  if (params.mediaUrls.length > 0) return MessageType.IMAGE;
  return MessageType.TEXT;
}
