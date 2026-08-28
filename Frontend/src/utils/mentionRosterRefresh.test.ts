import { describe, expect, it } from 'vitest';
import { shouldRefreshMentionsOnRosterLoad } from './mentionRosterRefresh';

describe('shouldRefreshMentionsOnRosterLoad', () => {
  it('returns true when roster loads and composer has @', () => {
    expect(shouldRefreshMentionsOnRosterLoad(false, 3, '@')).toBe(true);
  });

  it('returns false when roster was already loaded', () => {
    expect(shouldRefreshMentionsOnRosterLoad(true, 3, '@')).toBe(false);
  });

  it('returns false when composer has no @', () => {
    expect(shouldRefreshMentionsOnRosterLoad(false, 3, 'hello')).toBe(false);
  });

  it('returns false when roster is still empty', () => {
    expect(shouldRefreshMentionsOnRosterLoad(false, 0, '@')).toBe(false);
  });
});
