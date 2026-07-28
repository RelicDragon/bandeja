import type { ChatMessage, MessageReadReceipt } from '@/api/chat';
import {
  isMessageCoveredByCursor,
  type MaxPeerReadCursor,
  type ReadCursorPosition,
} from './peerReadCursor';

/** Still used for “Read by N” / receipt lists — not for own-message ✓✓ (ADR 0002). */
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

function messageHasSyncPosition(message: ChatMessage): boolean {
  const seq = message.serverSyncSeq ?? message.syncSeq;
  return typeof seq === 'number' && Number.isFinite(seq);
}

/**
 * Own-message send ticks (ADR 0002 — new client):
 * Peer read cursor only. Receipts are dual-written for old clients and ignored here.
 */
export function resolveOwnMessageTicks(
  message: ChatMessage,
  _viewerUserId?: string | null,
  maxPeerCursor?: ReadCursorPosition | MaxPeerReadCursor | null
): { tickRead: boolean; tickDelivered: boolean } {
  const tickRead =
    maxPeerCursor != null &&
    messageHasSyncPosition(message) &&
    isMessageCoveredByCursor(message, maxPeerCursor);
  return {
    tickRead,
    tickDelivered: message.state === 'DELIVERED' && !tickRead,
  };
}
