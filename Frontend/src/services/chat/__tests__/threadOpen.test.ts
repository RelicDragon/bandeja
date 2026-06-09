import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  THREAD_OPEN_SOCKET_GUARD_MS,
  beginThreadOpenSettling,
  canFlushSocketBacklog,
  commitThreadOpenPaint,
  endThreadOpenSettling,
  getThreadOpenPaintGeneration,
  isThreadOpenPaintCommitted,
  reconcileAfterPaint,
  resetThreadOpenPaint,
  shouldDeferOpenReload,
} from '../threadOpen';
import { detectReconcileScrollDelta, shouldPinOnOpen } from '../chatOpenScrollPolicy';
import { markOpenThreadNetworkPrefetched } from '../openThreadNetworkPrefetch';
import { pullMissedAndPersistToDexie } from '../chatThreadNetworkSync';
import { pullAndApplyChatSyncEvents } from '../chatLocalApply';

vi.mock('@/services/chat/chatLocalApply', () => ({
  applyThreadEvent: vi.fn(async () => {}),
  loadLocalThreadBootstrap: vi.fn(async () => ({ messages: [] })),
  pullAndApplyChatSyncEvents: vi.fn(async () => {}),
}));

vi.mock('@/services/chat/chatThreadNetworkSync', () => ({
  pullMissedAndPersistToDexie: vi.fn(async () => []),
}));

vi.mock('@/services/chat/messageContextHead', () => ({
  hydrateLastMessageIdFromDexieIfMissing: vi.fn(async () => {}),
}));

vi.mock('@/services/chat/chatOpenMissedFlush', () => ({
  takeMissedMessagesForOpen: vi.fn(() => []),
}));

vi.mock('@/store/chatSyncStore', () => ({
  useChatSyncStore: {
    getState: () => ({ setOpenSyncing: vi.fn(), syncInProgress: false }),
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock('@/services/chat/chatOpenTrace', () => ({
  commitChatOpenMessages: vi.fn((ref, setter, next) => {
    ref.current = next;
    setter(next);
  }),
  traceChatOpenLength: vi.fn(),
}));

vi.mock('@/services/chat/chatOpenSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chat/chatOpenSnapshot')>();
  return {
    ...actual,
    chatOpenMessagesSnapshotEqual: vi.fn((a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)),
  };
});

const KEY = 'GAME:g1:PUBLIC';

function msg(id: string): ChatMessageWithStatus {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'g1',
    senderId: 'u1',
    content: id,
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-03T10:00:00Z',
    updatedAt: '2026-01-03T10:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
  };
}

describe('threadOpen paint gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetThreadOpenPaint(KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks socket flush until paint commits, settling ends, and guard elapses', () => {
    expect(canFlushSocketBacklog(KEY)).toBe(false);
    commitThreadOpenPaint(KEY);
    expect(isThreadOpenPaintCommitted(KEY)).toBe(true);
    expect(canFlushSocketBacklog(KEY)).toBe(false);
    endThreadOpenSettling();
    expect(canFlushSocketBacklog(KEY)).toBe(false);
    vi.advanceTimersByTime(THREAD_OPEN_SOCKET_GUARD_MS);
    expect(canFlushSocketBacklog(KEY)).toBe(true);
  });

  it('blocks socket flush while settling even after guard elapses', () => {
    commitThreadOpenPaint(KEY);
    beginThreadOpenSettling();
    vi.advanceTimersByTime(THREAD_OPEN_SOCKET_GUARD_MS + 50);
    expect(canFlushSocketBacklog(KEY)).toBe(false);
    endThreadOpenSettling();
    expect(canFlushSocketBacklog(KEY)).toBe(true);
  });

  it('defers open reload within guard window after paint', () => {
    expect(shouldDeferOpenReload()).toBe(false);
    commitThreadOpenPaint(KEY);
    expect(shouldDeferOpenReload()).toBe(true);
    vi.advanceTimersByTime(THREAD_OPEN_SOCKET_GUARD_MS);
    expect(shouldDeferOpenReload()).toBe(false);
  });

  it('increments paint generation per commit', () => {
    expect(getThreadOpenPaintGeneration(KEY)).toBe(0);
    expect(commitThreadOpenPaint(KEY)).toBe(1);
    expect(commitThreadOpenPaint(KEY)).toBe(2);
    expect(getThreadOpenPaintGeneration(KEY)).toBe(2);
  });
});

describe('threadOpen pin policy (reconcile)', () => {
  it('pins at bottom when scroll at bottom and tail append only', () => {
    const prev = [msg('a'), msg('b')];
    const next = [msg('a'), msg('b'), msg('c')];
    const delta = detectReconcileScrollDelta(prev.length, prev[0]?.id, next.length, next[0]?.id);
    expect(delta).toBe('append');
    expect(shouldPinOnOpen({ atBottom: true }, delta)).toBe(true);
  });

  it('does not pin with anchor scroll', () => {
    expect(shouldPinOnOpen({ anchorMessageId: 'mid' }, 'none')).toBe(false);
  });

  it('does not pin after prepend reconcile delta', () => {
    expect(shouldPinOnOpen({ atBottom: true }, 'prepend')).toBe(false);
  });

  it('does not pin when saved scroll is mid-history', () => {
    expect(shouldPinOnOpen({ atBottom: false }, 'none')).toBe(false);
  });
});

describe('reconcileAfterPaint', () => {
  const currentIdRef = { current: 'g1' as string | undefined };
  const messagesRef = { current: [] as ChatMessageWithStatus[] };
  const setMessages = vi.fn();

  beforeEach(() => {
    resetThreadOpenPaint(KEY);
    currentIdRef.current = 'g1';
    messagesRef.current = [msg('a'), msg('b')];
    setMessages.mockClear();
  });

  it('returns noop when contextId does not match current thread', async () => {
    currentIdRef.current = 'other';
    const result = await reconcileAfterPaint({
      threadKey: KEY,
      contextType: 'GAME',
      contextId: 'g1',
      gameChatType: 'PUBLIC',
      currentIdRef,
      messagesRef,
      setMessages,
    });
    expect(result).toEqual({ committedRows: false, pinToBottom: false, reconcileDelta: 'none' });
  });

  it('skips row commit when paint generation is stale', async () => {
    const gen = commitThreadOpenPaint(KEY, { atBottom: true });
    const result = await reconcileAfterPaint({
      threadKey: KEY,
      paintGeneration: gen - 1,
      contextType: 'GAME',
      contextId: 'g1',
      gameChatType: 'PUBLIC',
      currentIdRef,
      messagesRef,
      setMessages,
    });
    expect(result.committedRows).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
  });

  it('skips network pulls when open prefetch was just marked', async () => {
    vi.mocked(pullMissedAndPersistToDexie).mockClear();
    vi.mocked(pullAndApplyChatSyncEvents).mockClear();
    markOpenThreadNetworkPrefetched('GAME', 'g1');
    commitThreadOpenPaint(KEY, { atBottom: true });
    await reconcileAfterPaint({
      threadKey: KEY,
      paintGeneration: getThreadOpenPaintGeneration(KEY),
      contextType: 'GAME',
      contextId: 'g1',
      gameChatType: 'PUBLIC',
      currentIdRef,
      messagesRef,
      setMessages,
    });
    expect(pullMissedAndPersistToDexie).not.toHaveBeenCalled();
    expect(pullAndApplyChatSyncEvents).not.toHaveBeenCalled();
  });

  it('returns pinToBottom false for anchor scroll even when tail appends', async () => {
    const { loadLocalThreadBootstrap } = await import('@/services/chat/chatLocalApply');
    vi.mocked(loadLocalThreadBootstrap).mockResolvedValueOnce({
      messages: [msg('a'), msg('b'), msg('c')],
    });
    commitThreadOpenPaint(KEY, { anchorMessageId: 'b', atBottom: false });
    const result = await reconcileAfterPaint({
      threadKey: KEY,
      paintGeneration: getThreadOpenPaintGeneration(KEY),
      contextType: 'GAME',
      contextId: 'g1',
      gameChatType: 'PUBLIC',
      currentIdRef,
      messagesRef,
      setMessages,
      scrollRow: { anchorMessageId: 'b', atBottom: false },
    });
    expect(result.pinToBottom).toBe(false);
  });
});
