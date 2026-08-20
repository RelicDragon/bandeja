import type { ChatContextType, ChatMessage } from '@/api/chat';
import { BATCH_HEAD_CACHE_MS } from './chatLocalApplyCursor';
import { chatLocalDb, type ChatLocalRow } from './chatLocalDb';

function deleteHintKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

type DeleteCaughtUpHint = {
  minSeq: number;
  force: boolean;
  expiresAt: number;
};

const HINT_STORAGE_PREFIX = 'bandeja.chat.delBypass.';
const MAX_SESSION_HINTS = 48;
const deleteCaughtUpHints = new Map<string, DeleteCaughtUpHint>();
const rememberedTombstoneIds = new Set<string>();
const deleteApplyGenByMessageId = new Map<string, number>();

function isChatContextType(value: string): value is ChatContextType {
  return value === 'GAME' || value === 'BUG' || value === 'USER' || value === 'GROUP';
}

function storageKey(hintKey: string): string {
  return `${HINT_STORAGE_PREFIX}${hintKey}`;
}

function hintTtlMs(): number {
  return BATCH_HEAD_CACHE_MS;
}

function isHintLive(hint: DeleteCaughtUpHint, now = Date.now()): boolean {
  return hint.expiresAt > now;
}

function writeSessionHint(hintKey: string, hint: DeleteCaughtUpHint): void {
  try {
    sessionStorage.setItem(storageKey(hintKey), JSON.stringify(hint));
    pruneSessionHints();
  } catch {
    /* quota / private mode */
  }
}

function readSessionHint(hintKey: string): DeleteCaughtUpHint | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey(hintKey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<DeleteCaughtUpHint>;
    if (typeof parsed.minSeq !== 'number' || typeof parsed.expiresAt !== 'number') {
      sessionStorage.removeItem(storageKey(hintKey));
      return undefined;
    }
    const hint: DeleteCaughtUpHint = {
      minSeq: parsed.minSeq,
      force: parsed.force === true,
      expiresAt: parsed.expiresAt,
    };
    if (!isHintLive(hint)) {
      sessionStorage.removeItem(storageKey(hintKey));
      return undefined;
    }
    return hint;
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

function listSessionHintEntries(): Array<{ key: string; expiresAt: number }> {
  const entries: Array<{ key: string; expiresAt: number }> = [];
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (!k?.startsWith(HINT_STORAGE_PREFIX)) continue;
      const raw = sessionStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Partial<DeleteCaughtUpHint>;
        if (typeof parsed.expiresAt !== 'number' || !isHintLive(parsed as DeleteCaughtUpHint)) {
          toRemove.push(k);
          continue;
        }
        entries.push({ key: k, expiresAt: parsed.expiresAt });
      } catch {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) sessionStorage.removeItem(k);
  } catch {
    /* node / private mode */
  }
  return entries;
}

function pruneSessionHints(): void {
  const entries = listSessionHintEntries();
  if (entries.length <= MAX_SESSION_HINTS) return;
  entries.sort((a, b) => a.expiresAt - b.expiresAt);
  const extra = entries.length - MAX_SESSION_HINTS;
  try {
    for (let i = 0; i < extra; i += 1) {
      sessionStorage.removeItem(entries[i]!.key);
    }
  } catch {
    /* private mode */
  }
}

function readHint(hintKey: string): DeleteCaughtUpHint | undefined {
  const mem = deleteCaughtUpHints.get(hintKey);
  if (mem) {
    if (isHintLive(mem)) return mem;
    deleteCaughtUpHints.delete(hintKey);
    removeSessionHint(hintKey);
  }
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

export function rememberLocalMessageTombstone(messageId: string): void {
  rememberedTombstoneIds.add(messageId);
}

export function forgetLocalMessageTombstone(messageId: string): void {
  rememberedTombstoneIds.delete(messageId);
}

export function isRememberedLocalMessageTombstone(messageId: string): boolean {
  return rememberedTombstoneIds.has(messageId);
}

export function beginLocalDeleteApply(messageId: string): number {
  const next = (deleteApplyGenByMessageId.get(messageId) ?? 0) + 1;
  deleteApplyGenByMessageId.set(messageId, next);
  return next;
}

export function isCurrentLocalDeleteApply(messageId: string, gen: number): boolean {
  return deleteApplyGenByMessageId.get(messageId) === gen;
}

export function excludeTombstonedChatMessages<T extends { id: string; deletedAt?: string | null }>(
  rows: readonly T[],
  extraIds?: ReadonlySet<string>
): T[] {
  if (rows.length === 0) return [];
  return rows.filter((m) => {
    if (m.deletedAt) return false;
    if (rememberedTombstoneIds.has(m.id)) return false;
    if (extraIds?.has(m.id)) return false;
    return true;
  });
}

export async function loadTombstonedMessageIds(ids: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const needDexie: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    if (rememberedTombstoneIds.has(id)) out.add(id);
    else needDexie.push(id);
  }
  if (needDexie.length === 0) return out;
  const rows = await chatLocalDb.messages.bulkGet(needDexie);
  for (const row of rows) {
    if (row?.deletedAt != null) out.add(row.id);
  }
  return out;
}

export async function dropTombstonedChatMessages<T extends { id: string; deletedAt?: string | null }>(
  rows: readonly T[]
): Promise<T[]> {
  if (rows.length === 0) return [];
  const extra = await loadTombstonedMessageIds(rows.map((m) => m.id));
  return excludeTombstonedChatMessages(rows, extra);
}

export function noteMessageDeletedForCaughtUpPull(
  contextType: ChatContextType,
  contextId: string,
  syncSeq?: number
): void {
  const key = deleteHintKey(contextType, contextId);
  const prev = readHint(key);
  const expiresAt = Date.now() + hintTtlMs();
  if (syncSeq == null) {
    writeHint(key, { minSeq: prev?.minSeq ?? 0, force: true, expiresAt });
    return;
  }
  writeHint(key, {
    minSeq: Math.max(prev?.minSeq ?? 0, syncSeq),
    force: prev?.force === true,
    expiresAt,
  });
}

export function shouldBypassCaughtUpSyncPullForMessageDeleted(
  contextType: ChatContextType,
  contextId: string
): boolean {
  return readHint(deleteHintKey(contextType, contextId)) != null;
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
  rememberedTombstoneIds.clear();
  deleteApplyGenByMessageId.clear();
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
  rememberLocalMessageTombstone(data.messageId);
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
