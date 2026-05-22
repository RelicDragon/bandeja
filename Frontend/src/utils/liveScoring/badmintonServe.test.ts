import { describe, expect, it } from 'vitest';
import { badmintonChangeEndsBeforeNextPoint, badmintonCourtSideForServerScore } from './badmintonServe';

describe('badmintonServe', () => {
  it('maps even server score to right court', () => {
    expect(badmintonCourtSideForServerScore(0)).toBe('rightDeuce');
    expect(badmintonCourtSideForServerScore(4)).toBe('rightDeuce');
    expect(badmintonCourtSideForServerScore(1)).toBe('leftAd');
    expect(badmintonCourtSideForServerScore(11)).toBe('leftAd');
  });

  it('signals interval at 11 in games to 21', () => {
    expect(badmintonChangeEndsBeforeNextPoint(11, 9, 21)).toBe(true);
    expect(badmintonChangeEndsBeforeNextPoint(9, 11, 21)).toBe(true);
    expect(badmintonChangeEndsBeforeNextPoint(11, 11, 21)).toBe(false);
    expect(badmintonChangeEndsBeforeNextPoint(10, 10, 21)).toBe(false);
  });

  it('signals interval at 8 in games to 15', () => {
    expect(badmintonChangeEndsBeforeNextPoint(8, 6, 15)).toBe(true);
    expect(badmintonChangeEndsBeforeNextPoint(8, 8, 15)).toBe(false);
  });
});
