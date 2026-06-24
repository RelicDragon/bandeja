import type { MessageReadReceipt } from '@/api/chat';

/** Stable per-message receipt signature for open-thread snapshot equality. */
export function readReceiptsFingerprint(
  receipts: readonly MessageReadReceipt[] | undefined
): string {
  const list = receipts ?? [];
  if (list.length === 0) return '';
  return [...list]
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map((r) => `${r.userId}\0${r.readAt}`)
    .join('\n');
}
