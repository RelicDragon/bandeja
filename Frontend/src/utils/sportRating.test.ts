import { describe, expect, it } from 'vitest';
import { formatRatingHint } from './sportRating';

describe('formatRatingHint', () => {
  const t = (key: string, opts?: { value?: string; defaultValue?: string }) =>
    opts?.defaultValue ?? key;

  it('prefers manual external hint over computed', () => {
    expect(formatRatingHint('PADEL', 3.0, t, '4.2')).toContain('4.2');
  });

  it('returns null for sports without display system', () => {
    expect(formatRatingHint('BADMINTON', 3.0, t, null)).toBeNull();
  });
});
