import type { ChatMessage, MessageReadReceipt } from '@/api/chat';

export function readReceiptsFromOthers(
  readReceipts: readonly MessageReadReceipt[] | undefined,
  senderId: string | null | undefined,
  viewerUserId?: string | null
): MessageReadReceipt[] {
  return (readReceipts ?? []).filter((r) => {
    if (!r.userId) return false;
    if (senderId && r.userId === senderId) return false;
    if (viewerUserId && r.userId === viewerUserId) return false;
    return true;
  });
}

/** Own-message send ticks: read only when another participant has a read receipt. */
export function resolveOwnMessageTicks(
  message: ChatMessage,
  viewerUserId?: string | null
): { tickRead: boolean; tickDelivered: boolean } {
  const readByOthers =
    readReceiptsFromOthers(message.readReceipts, message.senderId, viewerUserId).length > 0;
  return {
    tickRead: readByOthers,
    tickDelivered: message.state === 'DELIVERED' && !readByOthers,
  };
}
