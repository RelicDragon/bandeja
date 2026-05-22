import { describe, expect, it } from 'vitest';
import {
  pickleballChangeEndsBeforeNextPoint,
  pickleballCourtSideForServerScore,
  pickleballDoublesServeSlot,
  pickleballServeMotionToken,
} from './pickleballServe';

describe('pickleballServe', () => {
  it('maps even server score to right court', () => {
    expect(pickleballCourtSideForServerScore(0)).toBe('rightDeuce');
    expect(pickleballCourtSideForServerScore(4)).toBe('rightDeuce');
    expect(pickleballCourtSideForServerScore(1)).toBe('leftAd');
    expect(pickleballCourtSideForServerScore(7)).toBe('leftAd');
  });

  it('signals side switch at 6 in games to 11', () => {
    expect(pickleballChangeEndsBeforeNextPoint(6, 4, 11)).toBe(true);
    expect(pickleballChangeEndsBeforeNextPoint(4, 6, 11)).toBe(true);
    expect(pickleballChangeEndsBeforeNextPoint(6, 6, 11)).toBe(false);
    expect(pickleballChangeEndsBeforeNextPoint(5, 5, 11)).toBe(false);
  });

  it('signals side switch at 8 in games to 15', () => {
    expect(pickleballChangeEndsBeforeNextPoint(8, 6, 15)).toBe(true);
    expect(pickleballChangeEndsBeforeNextPoint(8, 8, 15)).toBe(false);
  });

  it('maps doubles roster index to serve slot', () => {
    expect(pickleballDoublesServeSlot(0)).toBe('serveOne');
    expect(pickleballDoublesServeSlot(1)).toBe('serveTwo');
  });

  it('prefixes motion tokens for serve coach animations', () => {
    expect(pickleballServeMotionToken('pts-3-teamA-0-0')).toBe('pb-pts-3-teamA-0-0');
  });
});
