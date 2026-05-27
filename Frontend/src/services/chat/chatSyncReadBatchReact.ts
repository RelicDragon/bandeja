import type { ChatMessageWithStatus, MessageReadReceipt } from '@/api/chat';
import { mergeReadReceiptSync } from './chatSyncEventsToPatches';

function readReceiptsEqual(a: MessageReadReceipt[], b: MessageReadReceipt[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.userId !== y.userId || x.readAt !== y.readAt) return false;
  }
  return true;
}

export function applySyncReadBatchToMessages(
  prev: ChatMessageWithStatus[],
  userId: string,
  readAt: string,
  messageIds: string[]
): { next: ChatMessageWithStatus[]; changed: boolean } {
  const idSet = new Set(messageIds);
  let changed = false;
  const next = prev.map((message) => {
    if (!idSet.has(message.id)) return message;
    const receipt: MessageReadReceipt = {
      id: `batch-${message.id}-${userId}`,
      messageId: message.id,
      userId,
      readAt,
    };
    const prevReceipts = message.readReceipts ?? [];
    const merged = mergeReadReceiptSync(prevReceipts, userId, receipt);
    if (readReceiptsEqual(prevReceipts, merged)) return message;
    changed = true;
    return { ...message, readReceipts: merged };
  });
  return { next, changed };
}
