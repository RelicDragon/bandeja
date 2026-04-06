import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';

function conversationSeq(m: ChatMessage): number | null {
  const ss = m.serverSyncSeq;
  if (ss != null && Number.isFinite(Number(ss))) return Number(ss);
  const q = m.syncSeq;
  if (q != null && Number.isFinite(Number(q))) return Number(q);
  return null;
}

function encodeSeqLex(sa: number): string {
  const s = String(Math.trunc(sa));
  return `${String(s.length).padStart(3, '0')}${s}`;
}

export function computeMessageSortKey(m: ChatMessage): string {
  const t = new Date(m.createdAt).getTime();
  const timeStr = String(Number.isFinite(t) ? t : 0).padStart(15, '0');
  const sa = conversationSeq(m);
  const seqStr = sa != null ? `0${encodeSeqLex(sa)}` : `1`;
  const idPart = typeof m.id === 'string' ? m.id.normalize('NFC') : String(m.id);
  return `${timeStr}|${seqStr}|${idPart}`;
}

export function compareChatMessagesAscending(a: ChatMessage, b: ChatMessage): number {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (ta !== tb) return ta - tb;
  const sa = conversationSeq(a);
  const sb = conversationSeq(b);
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  if (sa != null && sb == null) return -1;
  if (sb != null && sa == null) return 1;
  return a.id.localeCompare(b.id);
}

function shouldPreferIncomingMessage(
  existing: ChatMessageWithStatus,
  incoming: ChatMessage
): boolean {
  return compareChatMessagesAscending(existing, incoming) <= 0;
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
    else if (shouldPreferIncomingMessage(cur, m)) map.set(m.id, { ...cur, ...m } as ChatMessageWithStatus);
  }
  return Array.from(map.values()).sort(compareChatMessagesAscending);
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
