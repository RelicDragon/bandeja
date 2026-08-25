import { describe, expect, it } from 'vitest';
import {
  computeVisibleNewKeys,
  nextSuppressInitialEnter,
  shouldSeedKeysOnLayout,
} from './chatListEnterSuppression';

describe('chatListEnterSuppression', () => {
  it('seeds all keys on layout while suppressing initial enter', () => {
    expect(shouldSeedKeysOnLayout(true, 3)).toBe(true);
    expect(shouldSeedKeysOnLayout(false, 3)).toBe(false);
    expect(shouldSeedKeysOnLayout(true, 0)).toBe(false);
  });

  it('returns empty new-key set while suppressing', () => {
    const seen = new Set(['a']);
    expect(computeVisibleNewKeys(['a', 'b', 'c'], seen, true)).toEqual(new Set());
    expect(computeVisibleNewKeys(['a', 'b', 'c'], seen, false)).toEqual(new Set(['b', 'c']));
  });

  it('re-arm suppress on tab switch and loading completion', () => {
    expect(
      nextSuppressInitialEnter({
        suppressInitialEnter: false,
        resetKeyChanged: true,
        prevListLoading: false,
        listLoading: false,
        prevNetworkSettled: true,
        networkSettled: true,
      })
    ).toBe(true);

    expect(
      nextSuppressInitialEnter({
        suppressInitialEnter: false,
        resetKeyChanged: false,
        prevListLoading: true,
        listLoading: false,
        prevNetworkSettled: true,
        networkSettled: true,
      })
    ).toBe(true);

    expect(
      nextSuppressInitialEnter({
        suppressInitialEnter: false,
        resetKeyChanged: false,
        prevListLoading: false,
        listLoading: false,
        prevNetworkSettled: false,
        networkSettled: true,
      })
    ).toBe(true);

    expect(
      nextSuppressInitialEnter({
        suppressInitialEnter: false,
        resetKeyChanged: false,
        prevListLoading: false,
        listLoading: false,
        prevNetworkSettled: true,
        networkSettled: true,
      })
    ).toBe(false);
  });
});
