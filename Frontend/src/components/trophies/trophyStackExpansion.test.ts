import { describe, expect, it } from 'vitest';
import {
  nextExpandedStackKey,
  resolveExpandedStackKey,
} from '@/components/trophies/trophyStackExpansion';

describe('trophy stack expansion helpers', () => {
  it('expands one key and collapses the previous implicitly', () => {
    expect(nextExpandedStackKey(null, 'a', true)).toBe('a');
    expect(nextExpandedStackKey('a', 'b', true)).toBe('b');
    expect(nextExpandedStackKey('b', 'b', false)).toBe(null);
    expect(nextExpandedStackKey('b', 'a', false)).toBe('b');
  });

  it('resolves only keys that still exist', () => {
    const keys = new Set(['HABIT_VOLUME']);
    expect(resolveExpandedStackKey('HABIT_VOLUME', keys)).toBe('HABIT_VOLUME');
    expect(resolveExpandedStackKey('HABIT_VOLUME', new Set())).toBe(null);
    expect(resolveExpandedStackKey(null, keys)).toBe(null);
  });
});
