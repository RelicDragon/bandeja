import { describe, expect, it } from 'vitest';
import {
  effectiveCourtCountForEstimate,
  idealCourtCount,
  suggestCourtCountForParticipants,
} from './suggestCourtCount';

describe('suggestCourtCount', () => {
  it('hides suggestion below 8 players', () => {
    expect(suggestCourtCountForParticipants(7, 4)).toBeNull();
    expect(suggestCourtCountForParticipants(8, 4)).toBe(2);
  });

  it('caps courts at 4', () => {
    expect(suggestCourtCountForParticipants(24, 4)).toBe(4);
    expect(idealCourtCount(24, 4)).toBe(6);
  });

  it('effective count respects selected courts', () => {
    expect(effectiveCourtCountForEstimate(16, 4, 2)).toBe(2);
    expect(effectiveCourtCountForEstimate(16, 4, 0)).toBe(4);
  });
});
