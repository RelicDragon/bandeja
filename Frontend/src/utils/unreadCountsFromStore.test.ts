import { describe, expect, it } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';
import {
  gameUnreadCountsMap,
  groupUnreadCountsMap,
  marketItemUnreadCount,
} from '@/utils/unreadCountsFromStore';

/**
 * These helpers back the unread-badge subscriptions. The perf contract they
 * uphold (Step 1 — narrowest-slice subscriptions): each derives a value from
 * ONLY the ids it cares about, so an unrelated context's count changing does
 * NOT change the derived value. For `marketItemUnreadCount` that means the
 * primitive is identical (Object.is → no re-render); for the *CountsMap
 * helpers it means the returned record is shallow-equal (useShallow → no
 * re-render). The "narrowness" tests below pin that contract.
 */
describe('marketItemUnreadCount', () => {
  it('returns the single group channel count', () => {
    const byContext = { [contextKey('GROUP', 'ch-1')]: 3 };
    expect(marketItemUnreadCount({ groupChannel: { id: 'ch-1' } }, byContext)).toBe(3);
  });

  it('sums counts across multiple group channels', () => {
    const byContext = {
      [contextKey('GROUP', 'ch-1')]: 2,
      [contextKey('GROUP', 'ch-2')]: 5,
      [contextKey('GROUP', 'ch-3')]: 1,
    };
    expect(
      marketItemUnreadCount({ groupChannels: [{ id: 'ch-1' }, { id: 'ch-3' }] }, byContext)
    ).toBe(3);
  });

  it('returns 0 when the item has no channels', () => {
    expect(marketItemUnreadCount({}, {})).toBe(0);
  });

  it('returns 0 for a channel with no unread entry', () => {
    expect(marketItemUnreadCount({ groupChannel: { id: 'missing' } }, {})).toBe(0);
  });

  it('is unchanged by unrelated context counts (narrow primitive → no re-render)', () => {
    const item = { groupChannel: { id: 'ch-1' } };
    const before = marketItemUnreadCount(item, {
      [contextKey('GROUP', 'ch-1')]: 4,
    });
    const after = marketItemUnreadCount(item, {
      [contextKey('GROUP', 'ch-1')]: 4,
      [contextKey('GROUP', 'other-channel')]: 99, // unrelated market channel
      [contextKey('GAME', 'g1')]: 50, // unrelated game
      [contextKey('USER', 'u1')]: 7, // unrelated DM
    });
    // Same primitive => Object.is treats them equal => the subscriber does not re-render.
    expect(Object.is(before, after)).toBe(true);
    expect(before).toBe(4);
  });

  it('changes only when THIS item’s channel count changes', () => {
    const item = { groupChannel: { id: 'ch-1' } };
    expect(marketItemUnreadCount(item, { [contextKey('GROUP', 'ch-1')]: 4 })).toBe(4);
    expect(marketItemUnreadCount(item, { [contextKey('GROUP', 'ch-1')]: 5 })).toBe(5);
  });
});

describe('groupUnreadCountsMap / gameUnreadCountsMap (narrow records for useShallow)', () => {
  it('groupUnreadCountsMap includes only requested channels with count > 0', () => {
    const byContext = {
      [contextKey('GROUP', 'a')]: 2,
      [contextKey('GROUP', 'b')]: 0, // zero is omitted
      [contextKey('GROUP', 'c')]: 5,
    };
    expect(groupUnreadCountsMap(['a', 'b', 'c'], byContext)).toEqual({ a: 2, c: 5 });
  });

  it('groupUnreadCountsMap is unaffected by unrelated channels (shallow-equal → no re-render)', () => {
    const ids = ['a'];
    const before = groupUnreadCountsMap(ids, { [contextKey('GROUP', 'a')]: 2 });
    const after = groupUnreadCountsMap(ids, {
      [contextKey('GROUP', 'a')]: 2,
      [contextKey('GROUP', 'zzz')]: 99, // unrelated
    });
    // Same shape and values => useShallow treats them equal => no re-render.
    expect(before).toEqual(after);
    expect(before).toEqual({ a: 2 });
  });

  it('gameUnreadCountsMap includes only requested game ids with count > 0', () => {
    const byContext = {
      [contextKey('GAME', 'g1')]: 3,
      [contextKey('GAME', 'g2')]: 0,
      [contextKey('GAME', 'g3')]: 1,
    };
    expect(gameUnreadCountsMap(['g1', 'g2', 'g3'], byContext)).toEqual({ g1: 3, g3: 1 });
  });

  it('gameUnreadCountsMap is unaffected by unrelated games', () => {
    const ids = ['g1'];
    const before = gameUnreadCountsMap(ids, { [contextKey('GAME', 'g1')]: 4 });
    const after = gameUnreadCountsMap(ids, {
      [contextKey('GAME', 'g1')]: 4,
      [contextKey('GAME', 'g-other')]: 40,
    });
    expect(before).toEqual(after);
  });
});
