import type { ChatMessage, MessageReadReceipt } from '@/api/chat';

export function readReceiptsFromOthers(
  readReceipts: MessageReadReceipt[] | undefined,
  senderId: string | null | undefined
): MessageReadReceipt[] {
  return (readReceipts ?? []).filter((r) => !!r.userId && r.userId !== senderId);
}

/** Own-message send ticks: read only when another participant has a read receipt. */
export function resolveOwnMessageTicks(message: ChatMessage): { tickRead: boolean; tickDelivered: boolean } {
  const readByOthers = readReceiptsFromOthers(message.readReceipts, message.senderId).length > 0;
  return {
    tickRead: readByOthers,
    tickDelivered: message.state === 'DELIVERED' && !readByOthers,
  };
}
