import type { ChatContextType, ChatMessage } from '@/api/chat';
import type { ChatLocalRow } from './chatLocalDb';

function deleteHintKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

type DeleteCaughtUpHint = {
  minSeq: number;
  force: boolean;
};

const HINT_STORAGE_PREFIX = 'bandeja.chat.delBypass.';
const deleteCaughtUpHints = new Map<string, DeleteCaughtUpHint>();

function isChatContextType(value: string): value is ChatContextType {
  return value === 'GAME' || value === 'BUG' || value === 'USER' || value === 'GROUP';
}

function storageKey(hintKey: string): string {
  return `${HINT_STORAGE_PREFIX}${hintKey}`;
}

function writeSessionHint(hintKey: string, hint: DeleteCaughtUpHint): void {
  try {
    sessionStorage.setItem(storageKey(hintKey), JSON.stringify(hint));
  } catch {
    /* quota / private mode */
  }
}

function readSessionHint(hintKey: string): DeleteCaughtUpHint | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey(hintKey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<DeleteCaughtUpHint>;
    if (typeof parsed.minSeq !== 'number' || typeof parsed.force !== 'boolean') return undefined;
    return { minSeq: parsed.minSeq, force: parsed.force };
  } catch {
    return undefined;
  }
}

function removeSessionHint(hintKey: string): void {
  try {
    sessionStorage.removeItem(storageKey(hintKey));
  } catch {
    /* private mode */
  }
}

function readHint(hintKey: string): DeleteCaughtUpHint | undefined {
  const mem = deleteCaughtUpHints.get(hintKey);
  if (mem) return mem;
  const stored = readSessionHint(hintKey);
  if (stored) deleteCaughtUpHints.set(hintKey, stored);
  return stored;
}

function writeHint(hintKey: string, hint: DeleteCaughtUpHint): void {
  deleteCaughtUpHints.set(hintKey, hint);
  writeSessionHint(hintKey, hint);
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

/** Failed-delete restore must not go through preferDeletedAt. */
export function clearChatMessageTombstone<T extends ChatMessage>(message: T): T {
  return { ...message, deletedAt: null };
}

export function noteMessageDeletedForCaughtUpPull(
  contextType: ChatContextType,
  contextId: string,
  syncSeq?: number
): void {
  const key = deleteHintKey(contextType, contextId);
  const prev = readHint(key) ?? { minSeq: 0, force: false };
  if (syncSeq == null) {
    writeHint(key, { minSeq: prev.minSeq, force: true });
    return;
  }
  writeHint(key, {
    minSeq: Math.max(prev.minSeq, syncSeq),
    force: prev.force,
  });
}

export function shouldBypassCaughtUpSyncPullForMessageDeleted(
  contextType: ChatContextType,
  contextId: string,
  localSeq: number
): boolean {
  const hint = readHint(deleteHintKey(contextType, contextId));
  if (!hint) return false;
  if (hint.force) return true;
  return hint.minSeq > localSeq;
}

export function clearMessageDeletedCaughtUpBypass(
  contextType: ChatContextType,
  contextId: string
): void {
  const key = deleteHintKey(contextType, contextId);
  deleteCaughtUpHints.delete(key);
  removeSessionHint(key);
}

export function forgetInMemoryMessageDeletedCaughtUpBypassForTests(): void {
  deleteCaughtUpHints.clear();
}

export function resetMessageDeletedCaughtUpBypassForTests(): void {
  deleteCaughtUpHints.clear();
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(HINT_STORAGE_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) sessionStorage.removeItem(k);
  } catch {
    /* node / private mode */
  }
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
