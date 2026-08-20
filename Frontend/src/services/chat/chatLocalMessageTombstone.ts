import type { ChatContextType, ChatMessage } from '@/api/chat';
import type { ChatLocalRow } from './chatLocalDb';

function deleteHintKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

type DeleteCaughtUpHint = {
  minSeq: number;
  force: boolean;
};

const deleteCaughtUpHints = new Map<string, DeleteCaughtUpHint>();

function isChatContextType(value: string): value is ChatContextType {
  return value === 'GAME' || value === 'BUG' || value === 'USER' || value === 'GROUP';
}

/** Keep any tombstone timestamp; prefer the incoming one when both are set. */
export function preferDeletedAt(
  existing?: string | null,
  incoming?: string | null
): string | null | undefined {
  if (incoming) return incoming;
  if (existing) return existing;
  return incoming ?? existing;
}

export function tombstoneLocalRow(row: ChatLocalRow, deletedAtIso: string): ChatLocalRow {
  return {
    ...row,
    deletedAt: new Date(deletedAtIso).getTime(),
    payload: { ...row.payload, deletedAt: deletedAtIso },
  };
}

export function tombstoneChatMessage<T extends ChatMessage>(message: T, deletedAtIso: string): T {
  return { ...message, deletedAt: deletedAtIso };
}

export function noteMessageDeletedForCaughtUpPull(
  contextType: ChatContextType,
  contextId: string,
  syncSeq?: number
): void {
  const key = deleteHintKey(contextType, contextId);
  const prev = deleteCaughtUpHints.get(key) ?? { minSeq: 0, force: false };
  if (syncSeq == null) {
    deleteCaughtUpHints.set(key, { minSeq: prev.minSeq, force: true });
    return;
  }
  deleteCaughtUpHints.set(key, {
    minSeq: Math.max(prev.minSeq, syncSeq),
    force: prev.force,
  });
}

export function shouldBypassCaughtUpSyncPullForMessageDeleted(
  contextType: ChatContextType,
  contextId: string,
  localSeq: number
): boolean {
  const hint = deleteCaughtUpHints.get(deleteHintKey(contextType, contextId));
  if (!hint) return false;
  if (hint.force) return true;
  return hint.minSeq > localSeq;
}

export function clearMessageDeletedCaughtUpBypass(
  contextType: ChatContextType,
  contextId: string
): void {
  deleteCaughtUpHints.delete(deleteHintKey(contextType, contextId));
}

export function resetMessageDeletedCaughtUpBypassForTests(): void {
  deleteCaughtUpHints.clear();
}

export function persistSocketChatDeleted(data: {
  contextType: string;
  contextId: string;
  messageId: string;
  syncSeq?: number;
}): void {
  const contextType = isChatContextType(data.contextType) ? data.contextType : null;
  if (contextType) {
    noteMessageDeletedForCaughtUpPull(contextType, data.contextId, data.syncSeq);
  }
  void import('./chatLocalApplyWrite').then(({ markLocalMessageDeleted }) => {
    void markLocalMessageDeleted(data.messageId, undefined, {
      ...(contextType ? { contextType, contextId: data.contextId } : {}),
      ...(data.syncSeq != null ? { syncSeq: data.syncSeq } : {}),
    }).catch(() => {});
  });
}
