import type { ChatContextType, ChatType } from '@/api/chat';
import { chatLocalDb } from './chatLocalDb';
import {
  compareReadCursorPositions,
  maxPeerCursorFromPeers,
  peerReadCursorThreadKey,
  type MaxPeerReadCursor,
  type PeerReadCursor,
} from './peerReadCursor';

const SEEDED_USER_ID = '__seeded_max__';

type ThreadPeerState = {
  peers: Map<string, PeerReadCursor>;
  /** Aggregate from hydrate when peer list unknown — never moves backward. */
  seededMax: MaxPeerReadCursor | null;
  max: MaxPeerReadCursor | null;
};

const threads = new Map<string, ThreadPeerState>();
const listeners = new Set<() => void>();
let globalVersion = 0;

function notify(): void {
  globalVersion += 1;
  for (const l of listeners) l();
}

function ensureThread(key: string): ThreadPeerState {
  let t = threads.get(key);
  if (!t) {
    t = { peers: new Map(), seededMax: null, max: null };
    threads.set(key, t);
  }
  return t;
}

function pickMax(
  a: MaxPeerReadCursor | null,
  b: MaxPeerReadCursor | null
): MaxPeerReadCursor | null {
  if (!a) return b;
  if (!b) return a;
  return compareReadCursorPositions(a, b) >= 0 ? a : b;
}

function recomputeMax(
  key: string,
  thread: { chatContextType: ChatContextType; contextId: string; chatType: ChatType }
): void {
  const state = ensureThread(key);
  const fromPeers = maxPeerCursorFromPeers(
    [...state.peers.values()].filter((p) => p.userId !== SEEDED_USER_ID),
    thread
  );
  state.max = pickMax(fromPeers, state.seededMax);
}

function persistPeerRow(cursor: PeerReadCursor): void {
  const key = peerReadCursorThreadKey(cursor.chatContextType, cursor.contextId, cursor.chatType);
  void chatLocalDb.peerReadCursors
    .put({
      key: `${key}:${cursor.userId}`,
      threadKey: key,
      userId: cursor.userId,
      payload: cursor,
      updatedAt: Date.parse(cursor.updatedAt) || Date.now(),
    })
    .catch(() => {});
}

export function peerReadCursorStoreSubscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function peerReadCursorStoreGetSnapshot(): number {
  return globalVersion;
}

export function getMaxPeerReadCursor(
  chatContextType: ChatContextType | string,
  contextId: string,
  chatType: ChatType | string
): MaxPeerReadCursor | null {
  return threads.get(peerReadCursorThreadKey(chatContextType, contextId, chatType))?.max ?? null;
}

/** Forward-only: never lower a peer's position. */
export function upsertPeerReadCursor(cursor: PeerReadCursor): void {
  const key = peerReadCursorThreadKey(cursor.chatContextType, cursor.contextId, cursor.chatType);
  const state = ensureThread(key);
  const prev = state.peers.get(cursor.userId);
  if (prev) {
    const cmp = compareReadCursorPositions(cursor, prev);
    if (cmp < 0) return;
    if (cmp === 0 && prev.updatedAt === cursor.updatedAt) return;
  }
  state.peers.set(cursor.userId, cursor);
  recomputeMax(key, {
    chatContextType: cursor.chatContextType,
    contextId: cursor.contextId,
    chatType: cursor.chatType,
  });
  notify();
  persistPeerRow(cursor);
}

/** Forward-only aggregate seed from hydrate `maxPeerCursor` (persisted for offline reopen). */
export function seedMaxPeerReadCursor(max: MaxPeerReadCursor | null): void {
  if (!max) return;
  const key = peerReadCursorThreadKey(max.chatContextType, max.contextId, max.chatType);
  const state = ensureThread(key);
  if (state.seededMax && compareReadCursorPositions(max, state.seededMax) <= 0) {
    if (state.max) return;
  } else {
    state.seededMax = max;
  }
  recomputeMax(key, {
    chatContextType: max.chatContextType,
    contextId: max.contextId,
    chatType: max.chatType,
  });
  notify();
  persistPeerRow({ ...max, userId: SEEDED_USER_ID });
}

export async function hydratePeerReadCursorsFromDexie(
  chatContextType: ChatContextType,
  contextId: string,
  chatType: ChatType
): Promise<void> {
  const threadKey = peerReadCursorThreadKey(chatContextType, contextId, chatType);
  const rows = await chatLocalDb.peerReadCursors.where('threadKey').equals(threadKey).toArray();
  if (rows.length === 0) return;
  const state = ensureThread(threadKey);
  let changed = false;
  for (const row of rows) {
    if (row.userId === SEEDED_USER_ID) {
      if (!state.seededMax || compareReadCursorPositions(row.payload, state.seededMax) > 0) {
        state.seededMax = {
          chatContextType: row.payload.chatContextType,
          contextId: row.payload.contextId,
          chatType: row.payload.chatType,
          readMaxServerSyncSeq: row.payload.readMaxServerSyncSeq,
          readMaxCreatedAt: row.payload.readMaxCreatedAt,
          readMaxMessageId: row.payload.readMaxMessageId,
          updatedAt: row.payload.updatedAt,
        };
        changed = true;
      }
      continue;
    }
    const prev = state.peers.get(row.userId);
    if (prev && compareReadCursorPositions(row.payload, prev) <= 0) continue;
    state.peers.set(row.userId, row.payload);
    changed = true;
  }
  if (!changed && state.max) return;
  recomputeMax(threadKey, { chatContextType, contextId, chatType });
  notify();
}

export async function purgePeerReadCursorsForThread(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  const prefix = `${contextType}:${contextId}:`;
  const keysToClear: string[] = [];
  for (const key of threads.keys()) {
    if (key.startsWith(prefix) || key === `${contextType}:${contextId}`) {
      keysToClear.push(key);
    }
  }
  for (const key of keysToClear) threads.delete(key);
  if (keysToClear.length > 0) notify();
  const base = `${contextType}:${contextId}`;
  const rows = await chatLocalDb.peerReadCursors
    .filter((r) => r.threadKey === base || r.threadKey.startsWith(prefix))
    .primaryKeys();
  if (rows.length > 0) await chatLocalDb.peerReadCursors.bulkDelete(rows);
}
