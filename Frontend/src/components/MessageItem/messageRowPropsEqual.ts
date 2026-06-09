import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import { getMessageRowKey } from '@/services/chat/messageRowKey';

function reactionsEqual(a: ChatMessage['reactions'], b: ChatMessage['reactions']): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ra = a[i];
    const rb = b[i];
    if (ra.userId !== rb.userId || ra.emoji !== rb.emoji) return false;
    if (!!(ra as { _pending?: boolean })._pending !== !!(rb as { _pending?: boolean })._pending) return false;
  }
  return true;
}

function messageContentEqual(a: ChatMessage, b: ChatMessage): boolean {
  if (getMessageRowKey(a) !== getMessageRowKey(b)) return false;
  if (a.content !== b.content) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  if (a.messageType !== b.messageType) return false;
  if (!reactionsEqual(a.reactions, b.reactions)) return false;
  if (a.replyToId !== b.replyToId) return false;
  if (a.poll !== b.poll) return false;
  const aStatus = (a as ChatMessageWithStatus)._status;
  const bStatus = (b as ChatMessageWithStatus)._status;
  if (aStatus !== bStatus) return false;
  const aTx = (a as ChatMessageWithStatus)._translationJustArrived;
  const bTx = (b as ChatMessageWithStatus)._translationJustArrived;
  if (aTx !== bTx) return false;
  if (a.translation?.translation !== b.translation?.translation) return false;
  return true;
}

export interface MessageRowMemoProps {
  message: ChatMessage;
  replyCount: number;
  isPinned: boolean;
  loadMediaEager: boolean;
  showReply: boolean;
  isChannel: boolean;
}

export function messageRowPropsEqual(prev: MessageRowMemoProps, next: MessageRowMemoProps): boolean {
  if (!messageContentEqual(prev.message, next.message)) return false;
  if (prev.replyCount !== next.replyCount) return false;
  if (prev.isPinned !== next.isPinned) return false;
  if (prev.loadMediaEager !== next.loadMediaEager) return false;
  if (prev.showReply !== next.showReply) return false;
  if (prev.isChannel !== next.isChannel) return false;
  return true;
}
