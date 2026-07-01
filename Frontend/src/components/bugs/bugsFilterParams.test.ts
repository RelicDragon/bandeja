import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetBugsFilterDefaultsForTests,
  shouldApplyBugsFilterDefaultsForUser,
} from './bugsFilterParams';

describe('shouldApplyBugsFilterDefaultsForUser', () => {
  beforeEach(() => {
    resetBugsFilterDefaultsForTests();
  });

  it('does not reapply defaults for the same user after a transient missing user id', () => {
    expect(shouldApplyBugsFilterDefaultsForUser('user-1')).toBe(true);
    expect(shouldApplyBugsFilterDefaultsForUser(null)).toBe(false);
    expect(shouldApplyBugsFilterDefaultsForUser('user-1')).toBe(false);
  });

  it('applies defaults when a different user signs in', () => {
    expect(shouldApplyBugsFilterDefaultsForUser('user-1')).toBe(true);
    expect(shouldApplyBugsFilterDefaultsForUser(null)).toBe(false);
    expect(shouldApplyBugsFilterDefaultsForUser('user-2')).toBe(true);
  });
});
