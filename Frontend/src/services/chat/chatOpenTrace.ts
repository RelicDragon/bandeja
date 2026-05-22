import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessageWithStatus } from '@/api/chat';
export type ChatOpenSetMessagesSource =
  | 'l1-seed'
  | 'l1-clear'
  | 'bootstrap-onTail'
  | 'bootstrap-full'
  | 'bootstrap-snapshot'
  | 'reconcile-missed'
  | 'reconcile-fresh'
  | 'reconcile-batched'
  | 'socket-queue'
  | 'network-reload'
  | 'network-page'
  | 'network-append'
  | 'outbox'
  | 'load-more-local'
  | 'load-more-network'
  | 'anchor-load'
  | 'missed-flush'
  | 'thread-reset';

export type ChatOpenDebugCounters = {
  afterL1: number | null;
  afterBootstrap: number | null;
  afterReconcile: number | null;
};

export type ChatOpenDebugState = {
  enabled: boolean;
  setMessagesCalls: Array<{ source: ChatOpenSetMessagesSource; length: number; at: number }>;
  counters: ChatOpenDebugCounters;
  lastStale?: { contextType: string; contextId: string; at: number };
  lastReloadFirstPage?: { contextType: string; contextId: string; at: number };
  lastMissedFlush?: { contextType: string; contextId: string; count: number; at: number };
};

declare global {
  interface Window {
    __chatOpenDebug?: ChatOpenDebugState;
  }
}

function isDev(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

export function shouldTraceChatOpen(): boolean {
  return isDev();
}

function ensureDebug(): ChatOpenDebugState {
  if (!window.__chatOpenDebug) {
    window.__chatOpenDebug = {
      enabled: true,
      setMessagesCalls: [],
      counters: { afterL1: null, afterBootstrap: null, afterReconcile: null },
    };
  }
  window.__chatOpenDebug.enabled = shouldTraceChatOpen();
  return window.__chatOpenDebug;
}

function resolveLength(
  value: SetStateAction<ChatMessageWithStatus[]>,
  prev: ChatMessageWithStatus[]
): number {
  const next = typeof value === 'function' ? value(prev) : value;
  return next.length;
}

function bumpCounter(source: ChatOpenSetMessagesSource, length: number): void {
  const dbg = ensureDebug();
  if (source === 'l1-seed' || source === 'l1-clear') {
    dbg.counters.afterL1 = length;
  }
  if (source === 'bootstrap-onTail' || source === 'bootstrap-full' || source === 'bootstrap-snapshot') {
    dbg.counters.afterBootstrap = length;
  }
  if (source === 'reconcile-missed' || source === 'reconcile-fresh' || source === 'reconcile-batched') {
    dbg.counters.afterReconcile = length;
  }
}

export function traceChatOpenLength(
  phase: keyof ChatOpenDebugCounters,
  count: number
): void {
  if (!shouldTraceChatOpen()) return;
  ensureDebug().counters[phase] = count;
}

export function commitChatOpenMessages(
  messagesRef: { current: ChatMessageWithStatus[] },
  setMessages: Dispatch<SetStateAction<ChatMessageWithStatus[]>>,
  next: ChatMessageWithStatus[],
  source: ChatOpenSetMessagesSource
): void {
  messagesRef.current = next;
  traceSetMessages(setMessages, source, next, messagesRef);
}

export function traceSetMessages(
  setMessages: Dispatch<SetStateAction<ChatMessageWithStatus[]>>,
  source: ChatOpenSetMessagesSource,
  value: SetStateAction<ChatMessageWithStatus[]>,
  messagesRef?: { current: ChatMessageWithStatus[] }
): void {
  if (shouldTraceChatOpen()) {
    const prev = messagesRef?.current ?? [];
    const length = resolveLength(value, prev);
    const dbg = ensureDebug();
    dbg.setMessagesCalls.push({ source, length, at: Date.now() });
    bumpCounter(source, length);
    if (isDev()) {
      console.debug('[chatOpen]', source, { length, calls: dbg.setMessagesCalls.length });
    }
  }
  setMessages(value);
}

export function createTracedSetMessages(
  setMessages: Dispatch<SetStateAction<ChatMessageWithStatus[]>>,
  messagesRef: { current: ChatMessageWithStatus[] }
): (source: ChatOpenSetMessagesSource, value: SetStateAction<ChatMessageWithStatus[]>) => void {
  return (source, value) => traceSetMessages(setMessages, source, value, messagesRef);
}

export function resetChatOpenTraceForTests(): void {
  delete window.__chatOpenDebug;
}

export function logChatSyncStale(contextType: string, contextId: string): void {
  if (!shouldTraceChatOpen()) return;
  const dbg = ensureDebug();
  dbg.lastStale = { contextType, contextId, at: Date.now() };
  if (isDev()) console.debug('[chatOpen] BANDEJA_CHAT_SYNC_STALE', { contextType, contextId });
}

export function logReloadMessagesFirstPage(contextType: string, contextId: string): void {
  if (!shouldTraceChatOpen()) return;
  const dbg = ensureDebug();
  dbg.lastReloadFirstPage = { contextType, contextId, at: Date.now() };
  if (isDev()) console.debug('[chatOpen] reloadMessagesFirstPage', { contextType, contextId });
}

export function logMissedMessagesFlush(contextType: string, contextId: string, count: number): void {
  if (!shouldTraceChatOpen()) return;
  const dbg = ensureDebug();
  dbg.lastMissedFlush = { contextType, contextId, count, at: Date.now() };
  if (isDev()) console.debug('[chatOpen] missedMessagesByContext flush', { contextType, contextId, count });
}
