import { describe, expect, it } from 'vitest';
import { isActiveMentionQuery } from './mentionQueryActive';

describe('isActiveMentionQuery', () => {
  it('detects @ at start', () => {
    expect(isActiveMentionQuery('@', 1)).toBe(true);
    expect(isActiveMentionQuery('@ann', 4)).toBe(true);
  });

  it('detects @ after whitespace', () => {
    expect(isActiveMentionQuery('hi @', 4)).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isActiveMentionQuery('hello')).toBe(false);
    expect(isActiveMentionQuery('email@test.com')).toBe(false);
  });

  it('returns false after mention completed with space', () => {
    expect(isActiveMentionQuery('@ann ', 5)).toBe(false);
  });
});
