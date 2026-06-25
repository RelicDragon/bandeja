import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  buildThreadLiveConfig,
  detectThreadUiDexieDivergence,
  projectUiFromDexieTail,
  summarizeThreadHealthDivergence,
  THREAD_HEALTH_WATCHDOG_INTERVAL_MS,
} from '@/services/chat/threadHealthWatchdog';
import { chatOpenMessagesSnapshotEqual } from '@/services/chat/chatOpenSnapshot';

function createMessage(
  overrides: Partial<ChatMessageWithStatus> = {}
): ChatMessageWithStatus {
  const id = overrides.id ?? `msg-${Math.random().toString(36).slice(2)}`;
  const createdAt = overrides.createdAt ?? '2026-01-01T00:00:00.000Z';
  const updatedAt = overrides.updatedAt ?? createdAt;

  return {
    id,
    chatContextType: 'GAME',
    contextId: 'game-1',
    senderId: overrides.senderId ?? 'user-1',
    content: overrides.content ?? `Message ${id}`,
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'DELIVERED',
    chatType: 'PUBLIC',
    createdAt,
    updatedAt,
    sender: null,
    reactions: [],
    readReceipts: [],
    ...overrides,
  };
}

const CONFIG = buildThreadLiveConfig('GAME', 'game-1', 'viewer-1', 'PUBLIC');

describe('threadHealthWatchdog', () => {
  it('uses a conservative interval for mobile', () => {
    expect(THREAD_HEALTH_WATCHDOG_INTERVAL_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('reports no divergence when UI matches Dexie projection', () => {
    const ui = [createMessage({ id: 'm1' }), createMessage({ id: 'm2' })];
    const dexie = ui.map(({ _status: _s, _optimisticId: _o, ...m }) => m);

    expect(detectThreadUiDexieDivergence(ui, dexie, CONFIG)).toBeNull();
  });

  it('detects missing inbound message in UI', () => {
    const ui = [createMessage({ id: 'm1' })];
    const dexie = [
      createMessage({ id: 'm1' }),
      createMessage({ id: 'm2', createdAt: '2026-01-01T00:01:00.000Z', senderId: 'other' }),
    ];

    const divergence = detectThreadUiDexieDivergence(ui, dexie, CONFIG);
    expect(divergence).not.toBeNull();
    expect(divergence?.missingInUi).toContain('m2');
  });

  it('detects read receipt mismatch', () => {
    const ui = [
      createMessage({
        id: 'm1',
        senderId: 'viewer-1',
        readReceipts: [],
      }),
    ];
    const dexie = [
      createMessage({
        id: 'm1',
        senderId: 'viewer-1',
        readReceipts: [{ userId: 'reader-1', readAt: '2026-01-01T00:02:00.000Z' }],
      }),
    ];

    const divergence = detectThreadUiDexieDivergence(ui, dexie, CONFIG);
    expect(divergence).not.toBeNull();
    expect(divergence?.receiptMismatches).toContain('m1');
  });

  it('ignores in-flight optimistics not yet in Dexie', () => {
    const ui = [
      createMessage({ id: 'm1' }),
      createMessage({
        id: 'opt-1',
        _optimisticId: 'opt-1',
        _status: 'SENDING',
        senderId: 'viewer-1',
      }),
    ];
    const dexie = [createMessage({ id: 'm1' })];

    expect(detectThreadUiDexieDivergence(ui, dexie, CONFIG)).toBeNull();
  });

  it('preserves scroll-back history when Dexie tail is shorter than UI', () => {
    const older = createMessage({ id: 'm0', createdAt: '2026-01-01T00:00:00.000Z' });
    const ui = [older, createMessage({ id: 'm1', createdAt: '2026-01-01T00:01:00.000Z' })];
    const dexie = [ui[1]!];

    const projected = projectUiFromDexieTail(ui, dexie, CONFIG);
    expect(projected.map((m) => m.id)).toEqual(['m0', 'm1']);
    expect(chatOpenMessagesSnapshotEqual(ui, projected)).toBe(true);
  });

  it('summarizes divergence fields for post-mortem logging', () => {
    const ui = [createMessage({ id: 'm1' })];
    const expected = [createMessage({ id: 'm1' }), createMessage({ id: 'm2' })];

    const summary = summarizeThreadHealthDivergence(ui, expected);
    expect(summary.uiCount).toBe(1);
    expect(summary.expectedCount).toBe(2);
    expect(summary.missingInUi).toEqual(['m2']);
  });
});

describe('watchdog reconcile trigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('would detect desync and schedule reconcile within one interval', async () => {
    const ui = [createMessage({ id: 'm1' })];
    const dexie = [createMessage({ id: 'm1' }), createMessage({ id: 'm2' })];
    let reconcileCalled = false;

    const tick = () => {
      const divergence = detectThreadUiDexieDivergence(ui, dexie, CONFIG);
      if (divergence) reconcileCalled = true;
    };

    tick();
    expect(reconcileCalled).toBe(true);

    vi.advanceTimersByTime(THREAD_HEALTH_WATCHDOG_INTERVAL_MS);
    expect(THREAD_HEALTH_WATCHDOG_INTERVAL_MS).toBe(5_000);
  });
});
