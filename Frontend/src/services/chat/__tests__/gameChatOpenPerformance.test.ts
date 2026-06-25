import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  buildOpenSnapshot,
  mergeOpenPaintWithLivePending,
  mergeOpenSnapshot,
  planOpenBootstrapPaints,
  pickOpenBaseMessages,
  reconcileOpenDelta,
  shouldPinOnOpen,
} from '../chatOpenSnapshot';
import { openThreadBootstrap } from '../chatOpenCoordinator';
import {
  decideNewMessagesScrollApply,
  decideOpenScrollApply,
  decideReconcilePinApply,
  decideScrollApply,
  decideSettlingPinApply,
} from '../threadScrollPolicy';

function msg(id: string, createdAt: string, extra?: Partial<ChatMessageWithStatus>): ChatMessageWithStatus {
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
    createdAt,
    updatedAt: createdAt,
    sender: null,
    reactions: [],
    readReceipts: [],
    ...extra,
  };
}

function optimistic(id: string, createdAt: string): ChatMessageWithStatus {
  return msg(id, createdAt, { _optimisticId: `opt-${id}`, _status: 'SENDING' });
}

describe('buildOpenSnapshot / pickOpenBaseMessages', () => {
  it('merges fresh L1 with Dexie tail for a complete open window', () => {
    const l1 = [msg('l1', '2026-01-03T10:00:00Z')];
    const dexieTail = [msg('d1', '2026-01-03T09:00:00Z')];
    expect(pickOpenBaseMessages({ l1, dexieTail, l1Fresh: true }).map((m) => m.id)).toEqual(['d1', 'l1']);
    const snap = buildOpenSnapshot({ l1, dexieTail, outbox: [], l1Fresh: true });
    expect(snap.map((m) => m.id)).toEqual(['d1', 'l1']);
  });

  it('uses Dexie tail when L1 empty or stale', () => {
    const dexieTail = [msg('d1', '2026-01-03T09:00:00Z'), msg('d2', '2026-01-03T10:00:00Z')];
    expect(pickOpenBaseMessages({ l1: [], dexieTail, l1Fresh: false }).map((m) => m.id)).toEqual(['d1', 'd2']);
    const snap = buildOpenSnapshot({ l1: [], dexieTail, outbox: [], l1Fresh: false });
    expect(snap.map((m) => m.id)).toEqual(['d1', 'd2']);
  });

  it('merges outbox onto base in one ascending snapshot', () => {
    const l1 = [msg('m1', '2026-01-03T10:00:00Z')];
    const outbox = [optimistic('m2', '2026-01-03T10:01:00Z')];
    const snap = buildOpenSnapshot({ l1, dexieTail: [], outbox, l1Fresh: true });
    expect(snap.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('strips L1 optimistics unless includeL1Optimistics (A2.4)', () => {
    const l1 = [msg('m1', '2026-01-03T10:00:00Z'), optimistic('m2', '2026-01-03T10:01:00Z')];
    const outbox = [optimistic('m2', '2026-01-03T10:01:00Z')];
    const excluded = buildOpenSnapshot({
      l1,
      dexieTail: [],
      outbox,
      l1Fresh: true,
      includeL1Optimistics: false,
    });
    expect(excluded.map((m) => m.id)).toEqual(['m1', 'm2']);

    const included = buildOpenSnapshot({
      l1,
      dexieTail: [],
      outbox: [],
      l1Fresh: true,
      includeL1Optimistics: true,
    });
    expect(included.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('mergeOpenSnapshot', () => {
  it('prepends older tail without dropping prev tail', () => {
    const prev = [msg('b', '2026-01-03T10:00:00Z'), msg('c', '2026-01-03T11:00:00Z')];
    const tail = [msg('a', '2026-01-03T09:00:00Z')];
    const merged = mergeOpenSnapshot(prev, tail, []);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(reconcileOpenDelta(prev, merged).prependedCount).toBe(1);
  });

  it('merges outbox optimistics after tail merge', () => {
    const prev = [msg('m1', '2026-01-03T10:00:00Z')];
    const outbox = [optimistic('m2', '2026-01-03T10:05:00Z')];
    const merged = mergeOpenSnapshot(prev, [], outbox);
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('shouldPinOnOpen', () => {
  it('pins when scroll missing or atBottom', () => {
    expect(shouldPinOnOpen(undefined)).toBe(true);
    expect(shouldPinOnOpen({ atBottom: true })).toBe(true);
  });

  it('does not pin with anchor or mid-history atBottom false', () => {
    expect(shouldPinOnOpen({ anchorMessageId: 'mid' })).toBe(false);
    expect(shouldPinOnOpen({ atBottom: false })).toBe(false);
  });

  it('does not pin after reconcile prepend', () => {
    expect(shouldPinOnOpen({ atBottom: true }, { prependedCount: 3 })).toBe(false);
  });
});

describe('mergeOpenPaintWithLivePending', () => {
  it('keeps in-flight optimistics when open paint snapshot is stale', () => {
    const snapshot = [msg('m1', '2026-01-03T10:00:00Z')];
    const live = [msg('m1', '2026-01-03T10:00:00Z'), optimistic('opt-live', '2026-01-03T10:02:00Z')];
    const merged = mergeOpenPaintWithLivePending(live, snapshot);
    expect(merged.map((m) => m.id)).toEqual(['m1', 'opt-live']);
    expect((merged[1] as ChatMessageWithStatus)._status).toBe('SENDING');
  });
});

describe('openThreadBootstrap peekPrev', () => {
  it('reads prev after async loads so sends during bootstrap stay in snapshot', async () => {
    const dexieTail = [msg('m1', '2026-01-03T10:00:00Z')];
    let prevRows: ChatMessageWithStatus[] = [];
    const result = await openThreadBootstrap({
      threadKey: 'GAME:g1:PUBLIC',
      peekL1: () => [],
      peekPrev: () => prevRows,
      loadBootstrap: async () => {
        prevRows = [optimistic('opt-mid', '2026-01-03T10:01:00Z')];
        return { messages: dexieTail };
      },
    });
    expect(result.kind).toBe('painted');
    if (result.kind !== 'painted') return;
    expect(result.plan.messages.map((m) => m.id)).toEqual(['m1', 'opt-mid']);
  });
});

describe('planOpenBootstrapPaints', () => {
  it('coalesced path: l1 + dexieTail + outbox → single paint', () => {
    const l1 = [msg('l1', '2026-01-03T10:00:00Z')];
    const dexieTail = [msg('d0', '2026-01-03T09:00:00Z'), msg('l1', '2026-01-03T10:00:00Z')];
    const outbox = [optimistic('opt', '2026-01-03T10:02:00Z')];
    const plan = planOpenBootstrapPaints({
      l1,
      dexieTail,
      outbox,
      l1Fresh: true,
      coalesceBootstrap: true,
    });
    expect(plan.paintCount).toBe(1);
    expect(plan.snapshot.map((m) => m.id)).toEqual(['d0', 'l1', 'opt']);
  });

  it('uncoalesced bootstrap reports multiple paints (internal only)', () => {
    const l1 = [msg('l1', '2026-01-03T10:00:00Z')];
    const dexieTail = [msg('d1', '2026-01-03T09:00:00Z')];
    const outbox = [optimistic('opt', '2026-01-03T10:02:00Z')];
    const plan = planOpenBootstrapPaints({
      l1,
      dexieTail,
      outbox,
      l1Fresh: true,
      coalesceBootstrap: false,
    });
    expect(plan.paintCount).toBe(3);
  });
});

describe('threadScrollPolicy', () => {
  it('open-restore at bottom when initialScroll committed and not yet restored', () => {
    expect(
      decideOpenScrollApply({ initialScroll: { atBottom: true }, openPaintGeneration: 1, alreadyRestored: false })
    ).toEqual({ kind: 'open-restore' });
  });

  it('open-restore anchor when anchorMessageId present', () => {
    expect(
      decideOpenScrollApply({
        initialScroll: { anchorMessageId: 'm1' },
        openPaintGeneration: 1,
        alreadyRestored: false,
      })
    ).toEqual({ kind: 'open-restore', anchorMessageId: 'm1' });
  });

  it('skips open restore when already restored', () => {
    expect(
      decideOpenScrollApply({ initialScroll: { atBottom: true }, openPaintGeneration: 2, alreadyRestored: true })
    ).toEqual({ kind: 'none' });
  });

  it('settling pin only when at-bottom open intent', () => {
    expect(decideSettlingPinApply(true, true)).toEqual({ kind: 'pin-bottom-settling' });
    expect(decideSettlingPinApply(true, false)).toEqual({ kind: 'none' });
    expect(decideSettlingPinApply(false, true)).toEqual({ kind: 'none' });
  });

  it('reconcile pin respects shouldPinOnOpen', () => {
    expect(decideReconcilePinApply({ savedScroll: { atBottom: true }, reconcileDelta: 'append' })).toEqual({
      kind: 'pin-bottom',
    });
    expect(decideReconcilePinApply({ savedScroll: { anchorMessageId: 'x' }, reconcileDelta: 'none' })).toEqual({
      kind: 'none',
    });
    expect(decideReconcilePinApply({ savedScroll: { atBottom: true }, reconcileDelta: 'prepend' })).toEqual({
      kind: 'none',
    });
  });

  it('socket append while anchored away does not pin', () => {
    expect(
      decideReconcilePinApply({ savedScroll: { anchorMessageId: 'mid' }, reconcileDelta: 'append' })
    ).toEqual({ kind: 'none' });
    expect(decideReconcilePinApply({ savedScroll: { atBottom: false }, reconcileDelta: 'append' })).toEqual({
      kind: 'none',
    });
  });

  it('new messages prepend compensates scroll', () => {
    expect(
      decideNewMessagesScrollApply({
        isNewMessagesAdded: true,
        wasLoadingMore: true,
        justLoadedOlder: false,
        isPrependReconcile: false,
        layoutSettlingForBottomPin: false,
        wasAtBottom: false,
      })
    ).toEqual({ kind: 'prepend-compensate' });
  });

  it('append at bottom pins when not settling', () => {
    expect(
      decideNewMessagesScrollApply({
        isNewMessagesAdded: true,
        wasLoadingMore: false,
        justLoadedOlder: false,
        isPrependReconcile: false,
        layoutSettlingForBottomPin: false,
        wasAtBottom: true,
      })
    ).toEqual({ kind: 'append-pin-if-at-bottom' });
  });

  it('decideScrollApply dispatches by scenario', () => {
    expect(decideScrollApply('settling', { layoutSettlingForBottomPin: true, openScrollAtBottom: true })).toEqual({
      kind: 'pin-bottom-settling',
    });
  });
});

describe('rowHeightCache', () => {
  it('cache hit returns stored height', async () => {
    const { rowHeightCacheRecordMeasured, rowHeightCacheGet, rowHeightCacheStripSeparator } = await import(
      '../rowHeightCache'
    );
    const id = `hit-${Math.random()}`;
    rowHeightCacheRecordMeasured({ messageId: id, rawHeightPx: 120, hasDateSeparator: false });
    expect(rowHeightCacheGet(id)).toBe(120);
    expect(rowHeightCacheStripSeparator(148, true)).toBeLessThan(148);
  });

  it('seed ephemeral fills miss from heuristic', async () => {
    const { rowHeightCacheSeedEphemeral, rowHeightCacheGet } = await import('../rowHeightCache');
    const id = `miss-${Math.random()}`;
    expect(rowHeightCacheGet(id)).toBeUndefined();
    const seeded = rowHeightCacheSeedEphemeral(id, 96);
    expect(seeded).toBe(true);
    expect(rowHeightCacheGet(id)).toBe(96);
  });

  it('estimate includes date separator when label present', async () => {
    const { rowHeightCacheEstimate } = await import('../rowHeightCache');
    const { CHAT_DATE_SEPARATOR_ESTIMATE_PX } = await import('@/utils/chatDateSeparator');
    const suffix = Math.random().toString(36).slice(2);
    const messages = [
      msg(`sep-first-${suffix}`, '2026-01-02T10:00:00Z'),
      msg(`sep-same-${suffix}`, '2026-01-02T11:00:00Z'),
    ];
    const firstRowWithSep = rowHeightCacheEstimate({ message: messages[0], index: 0, messages });
    const sameDaySecondRow = rowHeightCacheEstimate({ message: messages[1], index: 1, messages });
    expect(firstRowWithSep - sameDaySecondRow).toBeGreaterThanOrEqual(CHAT_DATE_SEPARATOR_ESTIMATE_PX - 1);
  });

  it('L1 cached height preferred over heuristic in estimate', async () => {
    const { rowHeightCacheSeedFromL1, rowHeightCacheEstimate } = await import('../rowHeightCache');
    const { ROW_ESTIMATE_IMAGE_PX } = await import('../chatMessageRowEstimate');
    const id = `l1-${Math.random()}`;
    const l1Height = 512;
    rowHeightCacheSeedFromL1({ [id]: l1Height });
    const messages = [
      msg(`pad-${id}`, '2026-01-02T09:00:00Z'),
      msg(id, '2026-01-02T10:01:00Z', { messageType: 'IMAGE', mediaUrls: ['https://x/y.jpg'] }),
    ];
    const cachedEstimate = rowHeightCacheEstimate({ message: messages[1], index: 1, messages });
    expect(cachedEstimate).toBe(l1Height);
    expect(cachedEstimate).not.toBe(ROW_ESTIMATE_IMAGE_PX);
  });
});
