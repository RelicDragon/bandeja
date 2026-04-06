import Dexie from 'dexie';
import type { ChatContextType, ChatMessage, ChatType } from '@/api/chat';
import { chatLocalDb, type ChatLocalRow } from './chatLocalDb';
import { compareChatMessagesAscending, computeMessageSortKey } from '@/utils/chatMessageSort';
import { normalizeChatType } from '@/utils/chatType';

const LOCAL_THREAD_TAIL_FIRST = 48;
export const CHAT_LOCAL_THREAD_WINDOW_SIZE = Math.max(LOCAL_THREAD_TAIL_FIRST, 50);

const IDX = '[contextType+contextId+chatType+sortKey]' as const;

function yieldToMain(): Promise<void> {
  if (typeof requestIdleCallback !== 'undefined') {
    return new Promise((resolve) => {
      requestIdleCallback(() => resolve(), { timeout: 52 });
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type ThreadSortBound = [ChatContextType, string, ChatType, string];

function bounds(contextType: ChatContextType, contextId: string, ct: ChatType): { lower: ThreadSortBound; upper: ThreadSortBound } {
  return {
    lower: [contextType, contextId, ct, Dexie.minKey as unknown as string],
    upper: [contextType, contextId, ct, Dexie.maxKey as unknown as string],
  };
}

function activeFilter(r: ChatLocalRow): boolean {
  return r.deletedAt == null;
}

async function loadThreadOrderedAscending(
  contextType: ChatContextType,
  contextId: string,
  ct: ChatType
): Promise<ChatLocalRow[]> {
  const { lower, upper } = bounds(contextType, contextId, ct);
  return chatLocalDb.messages.where(IDX).between(lower, upper).filter(activeFilter).toArray();
}

async function loadTailRows(
  contextType: ChatContextType,
  contextId: string,
  ct: ChatType,
  limit: number
): Promise<ChatLocalRow[]> {
  const { lower, upper } = bounds(contextType, contextId, ct);
  const desc = await chatLocalDb.messages
    .where(IDX)
    .between(lower, upper)
    .filter(activeFilter)
    .reverse()
    .limit(limit)
    .toArray();
  return desc.slice().reverse();
}

async function countOlderThanSortKey(
  contextType: ChatContextType,
  contextId: string,
  ct: ChatType,
  sortKey: string
): Promise<number> {
  const { lower } = bounds(contextType, contextId, ct);
  const upper = [contextType, contextId, ct, sortKey] as [ChatContextType, string, ChatType, string];
  return chatLocalDb.messages
    .where(IDX)
    .between(lower, upper, false, true)
    .filter(activeFilter)
    .count();
}

export type LocalThreadBootstrapResult = {
  messages: ChatMessage[];
  hasOlderInDexie: boolean;
};

export async function loadLocalThreadBootstrap(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  onTail?: (tail: ChatMessage[]) => void
): Promise<LocalThreadBootstrapResult> {
  const ct = normalizeChatType(chatType);
  const rows = await loadTailRows(contextType, contextId, ct, CHAT_LOCAL_THREAD_WINDOW_SIZE);
  const payloads = rows.map((r) => r.payload).sort(compareChatMessagesAscending);
  const completeThread = rows.length < CHAT_LOCAL_THREAD_WINDOW_SIZE;
  const first = rows[0];
  const firstSk = first ? (first.sortKey || computeMessageSortKey(first.payload)) : '';
  const hasOlder = completeThread
    ? false
    : first
      ? (await countOlderThanSortKey(contextType, contextId, ct, firstSk)) > 0
      : false;

  if (completeThread) {
    if (onTail && payloads.length > 0) onTail(payloads);
    return { messages: payloads, hasOlderInDexie: false };
  }

  if (onTail && payloads.length > 0) onTail(payloads);
  await yieldToMain();
  return { messages: payloads, hasOlderInDexie: hasOlder };
}

export async function loadLocalMessagesForThread(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType
): Promise<ChatMessage[]> {
  const ct = normalizeChatType(chatType);
  const rows = await loadThreadOrderedAscending(contextType, contextId, ct);
  return rows.map((r) => r.payload).sort(compareChatMessagesAscending);
}

export async function loadLocalMessagesForThreadProgressive(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  onTail: (tail: ChatMessage[]) => void
): Promise<ChatMessage[]> {
  const r = await loadLocalThreadBootstrap(contextType, contextId, chatType, onTail);
  return r.messages;
}

export async function loadLocalMessagesOlderThan(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  beforeMessage: ChatMessage,
  limit: number
): Promise<ChatMessage[]> {
  const ct = normalizeChatType(chatType);
  const upperSk = computeMessageSortKey(beforeMessage);
  const { lower } = bounds(contextType, contextId, ct);
  const upper = [contextType, contextId, ct, upperSk] as [ChatContextType, string, ChatType, string];
  const batch = await chatLocalDb.messages
    .where(IDX)
    .between(lower, upper, false, true)
    .filter(
      (r) =>
        activeFilter(r) &&
        (r.sortKey ? r.sortKey < upperSk : compareChatMessagesAscending(r.payload, beforeMessage) < 0)
    )
    .reverse()
    .limit(limit)
    .toArray();
  return batch.slice().reverse().map((r) => r.payload);
}
