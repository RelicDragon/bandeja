import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';

/** Allow socket/HTTP completion for own sends while GAME tab type is still settling (e.g. deep link). */
export function shouldApplyGameChatMessageDespiteTabMismatch(
  message: Pick<ChatMessage, 'senderId' | 'clientMutationId' | 'chatType'>,
  userId: string | undefined,
  currentChatType: ChatType,
  messages: ChatMessageWithStatus[]
): boolean {
  if (!userId || message.senderId !== userId) return false;
  const cid = message.clientMutationId?.trim() ?? '';
  if (!cid) return false;
  const hasPending = messages.some((m) => {
    const sm = m as ChatMessageWithStatus;
    return (
      (sm._status === 'SENDING' || sm._status === 'FAILED') && sm._clientMutationId === cid
    );
  });
  if (!hasPending) return false;
  return normalizeChatType(message.chatType) !== normalizeChatType(currentChatType);
}
