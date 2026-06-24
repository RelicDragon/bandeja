import type { MessageReadReceipt } from '@/api/chat';

function readAtMs(receipt: MessageReadReceipt): number {
  const t = Date.parse(receipt.readAt);
  return Number.isFinite(t) ? t : 0;
}

/** Display order: earliest read first, userId tiebreak. */
export function sortReadReceiptsForDisplay(
  receipts: readonly MessageReadReceipt[]
): MessageReadReceipt[] {
  return [...receipts].sort((a, b) => {
    const dt = readAtMs(a) - readAtMs(b);
    if (dt !== 0) return dt;
    return a.userId.localeCompare(b.userId);
  });
}

function pickNewerReceipt(
  existing: MessageReadReceipt,
  incoming: MessageReadReceipt
): MessageReadReceipt {
  const existingMs = readAtMs(existing);
  const incomingMs = readAtMs(incoming);
  if (incomingMs > existingMs) return incoming;
  if (incomingMs < existingMs) return existing;
  return incoming;
}

/** Replace-by-userId with latest readAt; deterministic display order. */
export function mergeReadReceipts(
  base: readonly MessageReadReceipt[],
  incoming: MessageReadReceipt | readonly MessageReadReceipt[]
): MessageReadReceipt[] {
  const nextIncoming = Array.isArray(incoming) ? incoming : [incoming];
  const byUser = new Map<string, MessageReadReceipt>();
  for (const receipt of base) {
    if (!receipt.userId) continue;
    byUser.set(receipt.userId, receipt);
  }
  for (const receipt of nextIncoming) {
    if (!receipt.userId) continue;
    const existing = byUser.get(receipt.userId);
    byUser.set(receipt.userId, existing ? pickNewerReceipt(existing, receipt) : receipt);
  }
  return sortReadReceiptsForDisplay([...byUser.values()]);
}
