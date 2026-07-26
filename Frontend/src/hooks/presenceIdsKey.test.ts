import { describe, expect, it } from 'vitest';
import { presenceIdsKey } from './usePresenceSubscriptionManager';

describe('presenceIdsKey', () => {
  it('uses a non-empty sentinel for an empty id set', () => {
    expect(presenceIdsKey([])).toBe('∅');
    expect(presenceIdsKey([])).not.toBe('');
  });

  it('sorts ids so order does not change the fingerprint', () => {
    expect(presenceIdsKey(['b', 'a'])).toBe(presenceIdsKey(['a', 'b']));
  });

  it('distinguishes empty from a single empty-looking join of nothing else', () => {
    expect(presenceIdsKey([])).not.toBe(presenceIdsKey(['a']));
  });
});
