import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  buildOpenSnapshot,
  mergeOpenSnapshot,
  planOpenBootstrapPaints,
  pickOpenBaseMessages,
  reconcileOpenDelta,
  shouldPinOnOpen,
} from '../chatOpenSnapshot';

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
  it('prefers fresh L1 over Dexie tail', () => {
    const l1 = [msg('l1', '2026-01-03T10:00:00Z')];
    const dexieTail = [msg('d1', '2026-01-03T09:00:00Z')];
    expect(pickOpenBaseMessages({ l1, dexieTail, l1Fresh: true })).toEqual(l1);
    const snap = buildOpenSnapshot({ l1, dexieTail, outbox: [], l1Fresh: true });
    expect(snap.map((m) => m.id)).toEqual(['l1']);
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
    expect(plan.snapshot.map((m) => m.id)).toEqual(['l1', 'opt']);
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
