import type { ChatContextType, ChatMessage, MessageReaction } from '@/api/chat';
import type { ChatType } from '@/types';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import type { ChatMessageWithStatus } from '@/api/chat';
import { chatLocalDb } from './chatLocalDb';
import {
  putChatThreadMemory,
  scheduleChatThreadL1DebouncedPut,
} from './chatThreadMemoryCache';
import {
  bridgeAddMissedMessages,
  bridgeBumpChatListDexie,
  bridgeSetLastMessageId,
} from './chatLocalApplyStoreBridge';
import { syncLastMessageIdsToStoreFromLocalHeadsForContext } from './messageContextHead';
import { enqueueChatLocalContextApply } from './chatLocalApplyQueue';
import {
  putLocalMessageDirect,
  persistChatMessagesFromApiDirect,
  putChatLocalRowsWithSearchTokens,
} from './chatLocalApplyWrite';
import { pullAndApplyChatSyncEventsDirect } from './chatLocalApplyPull';
import { scheduleReconcileWhenSocketSeqMissing } from './chatLocalApplySyncTimers';
import { onSocketSyncSeqDirect, persistSocketPatchThenSyncSeqDirect } from './chatLocalApplySocketInbound';
import { rowFromMessage } from '@/services/chat/chatSyncRowUtils';

const revisionByContext = new Map<string, number>();
const revisionListenersByContext = new Map<string, Set<() => void>>();

function contextRevisionKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

function notifyRevisionListeners(contextType: ChatContextType, contextId: string): void {
  const listeners = revisionListenersByContext.get(contextRevisionKey(contextType, contextId));
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* subscriber fault isolation */
    }
  }
}

function bumpRevision(contextType: ChatContextType, contextId: string): number {
  const k = contextRevisionKey(contextType, contextId);
  const next = (revisionByContext.get(k) ?? 0) + 1;
  revisionByContext.set(k, next);
  notifyRevisionListeners(contextType, contextId);
  return next;
}

export function getThreadSnapshotRevision(contextType: ChatContextType, contextId: string): number {
  return revisionByContext.get(contextRevisionKey(contextType, contextId)) ?? 0;
}

export function subscribeThreadSnapshotRevision(
  contextType: ChatContextType,
  contextId: string,
  listener: () => void
): () => void {
  const k = contextRevisionKey(contextType, contextId);
  let set = revisionListenersByContext.get(k);
  if (!set) {
    set = new Set();
    revisionListenersByContext.set(k, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) revisionListenersByContext.delete(k);
  };
}

export function resetThreadSnapshotRevisionsForTests(): void {
  revisionByContext.clear();
  revisionListenersByContext.clear();
}

export type ThreadApplyEvent =
  | {
      kind: 'socketMessage';
      contextType: ChatContextType;
      contextId: string;
      message: ChatMessage;
      syncSeq?: number;
    }
  | { kind: 'socketSyncSeq'; contextType: ChatContextType; contextId: string; syncSeq: number }
  | { kind: 'syncPull'; contextType: ChatContextType; contextId: string }
  | { kind: 'httpMessages'; messages: ChatMessage[] }
  | { kind: 'sendSuccess'; message: ChatMessage }
  | {
      kind: 'missedBuffer';
      contextType: ChatContextType;
      contextId: string;
      messages: ChatMessage[];
      gameChatType?: ChatType;
    }
  | {
      kind: 'uiTailAdvance';
      contextType: ChatContextType;
      contextId: string;
      messageId: string;
      gameChatType?: ChatType;
    }
  | { kind: 'syncTailsFromHeads'; contextType: ChatContextType; contextId: string }
  | {
      kind: 'socketPatch';
      contextType: ChatContextType;
      contextId: string;
      patchDirect: () => Promise<void>;
      syncSeq?: number;
    }
  | {
      kind: 'optimisticEdit';
      contextType: ChatContextType;
      contextId: string;
      messageId: string;
      patch: { content: string; mentionIds: string[] };
    }
  | {
      kind: 'optimisticReaction';
      contextType: ChatContextType;
      contextId: string;
      messageId: string;
      reactions: MessageReaction[];
    }
  | {
      kind: 'l1Put';
      contextType: ChatContextType;
      contextId: string;
      gameChatType?: ChatType;
      readRows: () => readonly ChatMessageWithStatus[];
      verify: () => boolean;
      debounceMs?: number;
      immediate?: boolean;
    }
  | {
      kind: 'bulkHydrateTailsFromDexie';
      tails: Array<{
        contextType: ChatContextType;
        contextId: string;
        messageId: string;
        gameChatType?: ChatType;
      }>;
    };

export type ThreadApplyL1Hint = {
  threadKey: string;
  readRows: () => readonly ChatMessageWithStatus[];
  verify: () => boolean;
};

async function finishApply(
  contextType: ChatContextType,
  contextId: string,
  opts?: { l1?: ThreadApplyL1Hint; bumpList?: boolean }
): Promise<number> {
  if (opts?.bumpList !== false) {
    bridgeBumpChatListDexie();
  }
  if (opts?.l1) {
    scheduleChatThreadL1DebouncedPut(opts.l1.threadKey, opts.l1.readRows, opts.l1.verify);
  }
  return bumpRevision(contextType, contextId);
}

async function applyThreadEventUnqueued(event: ThreadApplyEvent): Promise<number> {
  switch (event.kind) {
    case 'socketMessage': {
      await putLocalMessageDirect(event.syncSeq != null ? { ...event.message, syncSeq: event.syncSeq } : event.message);
      if (event.syncSeq != null) {
        await onSocketSyncSeqDirect(event.contextType, event.contextId, event.syncSeq);
      } else {
        scheduleReconcileWhenSocketSeqMissing(event.contextType, event.contextId);
      }
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(event.contextType, event.contextId);
      return finishApply(event.contextType, event.contextId);
    }
    case 'socketSyncSeq': {
      await onSocketSyncSeqDirect(event.contextType, event.contextId, event.syncSeq);
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(event.contextType, event.contextId);
      return finishApply(event.contextType, event.contextId);
    }
    case 'socketPatch': {
      await persistSocketPatchThenSyncSeqDirect(
        event.contextType,
        event.contextId,
        event.patchDirect,
        event.syncSeq
      );
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(event.contextType, event.contextId);
      return finishApply(event.contextType, event.contextId);
    }
    case 'syncPull': {
      await pullAndApplyChatSyncEventsDirect(event.contextType, event.contextId);
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(event.contextType, event.contextId);
      return finishApply(event.contextType, event.contextId);
    }
    case 'httpMessages': {
      if (event.messages.length === 0) return 0;
      const first = event.messages[0]!;
      await persistChatMessagesFromApiDirect(event.messages);
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(first.chatContextType, first.contextId);
      return finishApply(first.chatContextType, first.contextId);
    }
    case 'sendSuccess': {
      await putLocalMessageDirect(event.message);
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(
        event.message.chatContextType,
        event.message.contextId
      );
      return finishApply(event.message.chatContextType, event.message.contextId);
    }
    case 'optimisticEdit': {
      const row = await chatLocalDb.messages.get(event.messageId);
      if (!row) return getThreadSnapshotRevision(event.contextType, event.contextId);
      const editedAt = new Date().toISOString();
      await putLocalMessageDirect({
        ...row.payload,
        content: event.patch.content,
        mentionIds: event.patch.mentionIds,
        editedAt,
      });
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(event.contextType, event.contextId);
      return finishApply(event.contextType, event.contextId, { bumpList: false });
    }
    case 'optimisticReaction': {
      const row = await chatLocalDb.messages.get(event.messageId);
      if (!row) return getThreadSnapshotRevision(event.contextType, event.contextId);
      await putChatLocalRowsWithSearchTokens([rowFromMessage({ ...row.payload, reactions: event.reactions })]);
      return finishApply(event.contextType, event.contextId, { bumpList: false });
    }
    case 'missedBuffer': {
      if (event.messages.length > 0) {
        bridgeAddMissedMessages(event.contextType, event.contextId, event.messages, event.gameChatType);
      }
      return bumpRevision(event.contextType, event.contextId);
    }
    case 'uiTailAdvance': {
      bridgeSetLastMessageId(event.contextType, event.contextId, event.messageId, event.gameChatType);
      return bumpRevision(event.contextType, event.contextId);
    }
    case 'syncTailsFromHeads': {
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(event.contextType, event.contextId);
      return bumpRevision(event.contextType, event.contextId);
    }
    case 'l1Put': {
      const threadKey = threadKeyForApply(event.contextType, event.contextId, event.gameChatType);
      if (event.immediate) {
        putChatThreadMemory(threadKey, event.readRows(), event.verify);
      } else {
        scheduleChatThreadL1DebouncedPut(
          threadKey,
          event.readRows,
          event.verify,
          event.debounceMs
        );
      }
      return getThreadSnapshotRevision(event.contextType, event.contextId);
    }
    case 'bulkHydrateTailsFromDexie': {
      for (const tail of event.tails) {
        bridgeSetLastMessageId(tail.contextType, tail.contextId, tail.messageId, tail.gameChatType);
      }
      return 0;
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

function eventContext(event: ThreadApplyEvent): { contextType: ChatContextType; contextId: string } | null {
  if (event.kind === 'httpMessages') {
    const first = event.messages[0];
    return first ? { contextType: first.chatContextType, contextId: first.contextId } : null;
  }
  if (event.kind === 'sendSuccess') {
    return { contextType: event.message.chatContextType, contextId: event.message.contextId };
  }
  if ('contextType' in event && 'contextId' in event) {
    return { contextType: event.contextType, contextId: event.contextId };
  }
  return null;
}

export function applyThreadEvent(event: ThreadApplyEvent): Promise<number> {
  if (event.kind === 'bulkHydrateTailsFromDexie') {
    return applyThreadEventUnqueued(event);
  }
  const ctx = eventContext(event);
  if (!ctx) return Promise.resolve(0);
  return enqueueChatLocalContextApply(ctx.contextType, ctx.contextId, () => applyThreadEventUnqueued(event));
}

export function threadKeyForApply(
  contextType: ChatContextType,
  contextId: string,
  gameChatType?: ChatType
): string {
  return chatSyncTailKey(contextType, contextId, gameChatType);
}

export function applyThreadL1Put(params: {
  contextType: ChatContextType;
  contextId: string;
  gameChatType?: ChatType;
  readRows: () => readonly ChatMessageWithStatus[];
  verify: () => boolean;
  debounceMs?: number;
  immediate?: boolean;
}): Promise<number> {
  return applyThreadEvent({ kind: 'l1Put', ...params });
}

/** Socket inbound entry — delegates to applyThreadEvent. */
export function persistSocketInboundMessage(
  contextType: ChatContextType,
  contextId: string,
  message: ChatMessage,
  syncSeq: number | undefined
): Promise<number> {
  return applyThreadEvent({ kind: 'socketMessage', contextType, contextId, message, syncSeq });
}
