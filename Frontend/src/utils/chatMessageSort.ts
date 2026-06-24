import type { ChatMessage, ChatMessageWithStatus, MessageReadReceipt } from '@/api/chat';
import { readReceiptsFingerprint } from '@/services/chat/readReceiptsFingerprint';
import { mergeReadReceiptSync } from '@/services/chat/chatSyncEventsToPatches';
import { stripPendingOptimisticsMatchedByServer } from '@/services/chat/optimisticReconcile';
import { compareChatMessagesAscending } from '@/utils/chatMessageCompare';

export { compareChatMessagesAscending, computeMessageSortKey } from '@/utils/chatMessageCompare';

function mergeMessageReadReceipts(
  base: MessageReadReceipt[],
  overlay: MessageReadReceipt[]
): MessageReadReceipt[] {
  let merged = base;
  for (const receipt of overlay) {
    merged = mergeReadReceiptSync(merged, receipt.userId, receipt);
  }
  return merged;
}

function shouldPreferIncomingMessage(
  existing: ChatMessageWithStatus,
  incoming: ChatMessage
): boolean {
  return compareChatMessagesAscending(existing, incoming) < 0;
}

export function mergeChatMessagesAscending(
  prev: ChatMessageWithStatus[],
  incoming: ChatMessage[]
): ChatMessageWithStatus[] {
  const map = new Map<string, ChatMessageWithStatus>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) {
    const cur = map.get(m.id);
    if (!cur) map.set(m.id, m as ChatMessageWithStatus);
    else if (shouldPreferIncomingMessage(cur, m)) {
      const readReceipts = mergeMessageReadReceipts(cur.readReceipts ?? [], m.readReceipts ?? []);
      map.set(m.id, { ...cur, ...m, readReceipts } as ChatMessageWithStatus);
    } else {
      const readReceipts = mergeMessageReadReceipts(cur.readReceipts ?? [], m.readReceipts ?? []);
      if (readReceiptsFingerprint(readReceipts) !== readReceiptsFingerprint(cur.readReceipts)) {
        map.set(m.id, { ...cur, readReceipts } as ChatMessageWithStatus);
      }
    }
  }
  const merged = Array.from(map.values()).sort(compareChatMessagesAscending);
  return stripPendingOptimisticsMatchedByServer(merged, incoming);
}

export function mergeServerPageWithPendingOptimistics(
  prev: ChatMessageWithStatus[],
  response: ChatMessage[]
): ChatMessageWithStatus[] {
  return mergeChatMessagesAscending(prev, response);
}

function swap(arr: ChatMessage[], i: number, j: number): void {
  const t = arr[i]!;
  arr[i] = arr[j]!;
  arr[j] = t;
}

function heapifyDownMin(heap: ChatMessage[], i: number): void {
  const n = heap.length;
  for (;;) {
    let smallest = i;
    const l = i * 2 + 1;
    const r = i * 2 + 2;
    if (l < n && compareChatMessagesAscending(heap[l]!, heap[smallest]!) < 0) smallest = l;
    if (r < n && compareChatMessagesAscending(heap[r]!, heap[smallest]!) < 0) smallest = r;
    if (smallest === i) break;
    swap(heap, i, smallest);
    i = smallest;
  }
}

function heapifyUpMin(heap: ChatMessage[], i: number): void {
  while (i > 0) {
    const p = Math.floor((i - 1) / 2);
    if (compareChatMessagesAscending(heap[i]!, heap[p]!) >= 0) break;
    swap(heap, i, p);
    i = p;
  }
}

export function selectKLargestChatMessagesSorted(messages: ChatMessage[], k: number): ChatMessage[] {
  if (k <= 0) return [];
  if (messages.length <= k) return [...messages].sort(compareChatMessagesAscending);
  const heap: ChatMessage[] = [];
  for (const m of messages) {
    if (heap.length < k) {
      heap.push(m);
      heapifyUpMin(heap, heap.length - 1);
    } else if (compareChatMessagesAscending(m, heap[0]!) > 0) {
      heap[0] = m;
      heapifyDownMin(heap, 0);
    }
  }
  return heap.sort(compareChatMessagesAscending);
}
