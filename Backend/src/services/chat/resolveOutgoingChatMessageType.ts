import { MessageType } from '@prisma/client';

/** Pure resolution used by MessageService.createMessage (poll → voice → video → image → text). */
export function resolveOutgoingChatMessageType(params: {
  poll?: unknown;
  requestedMessageType?: MessageType;
  mediaUrls: string[];
}): MessageType {
  if (params.poll) return MessageType.POLL;
  if (params.requestedMessageType === MessageType.VOICE) return MessageType.VOICE;
  if (params.requestedMessageType === MessageType.VIDEO) return MessageType.VIDEO;
  if (params.mediaUrls.length > 0) return MessageType.IMAGE;
  return MessageType.TEXT;
}
