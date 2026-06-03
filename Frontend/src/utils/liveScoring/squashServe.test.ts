import { describe, expect, it } from 'vitest';
import {
  squashChangeEndsBeforeNextPoint,
  squashCourtEndsSwapped,
  squashCourtSideForServerScore,
  squashMidGameEndsSwapped,
  squashNextServerTeam,
  squashServiceBoxSide,
  squashSetupCourtEndsSwappedForFirstServer,
} from './squashServe';
import type { LiveScoringState } from './types';

describe('squashCourtSideForServerScore', () => {
  it('maps even server score to right and odd to left', () => {
    expect(squashCourtSideForServerScore(0)).toBe('rightDeuce');
    expect(squashCourtSideForServerScore(2)).toBe('rightDeuce');
    expect(squashCourtSideForServerScore(1)).toBe('leftAd');
    expect(squashCourtSideForServerScore(5)).toBe('leftAd');
  });
});

describe('squashSetupCourtEndsSwappedForFirstServer', () => {
  it('places team A on the right service box only when ends are swapped', () => {
    expect(squashSetupCourtEndsSwappedForFirstServer('teamA')).toBe(true);
    expect(squashSetupCourtEndsSwappedForFirstServer('teamB')).toBe(false);
  });
});

describe('squashServiceBoxSide', () => {
  it('maps court side tokens to court-absolute boxes', () => {
    expect(squashServiceBoxSide('rightDeuce')).toBe('right');
    expect(squashServiceBoxSide('leftAd')).toBe('left');
  });
});

describe('squashNextServerTeam', () => {
  it('returns first server at 0-0 and last rally winner after points', () => {
    expect(squashNextServerTeam({}, 'teamA')).toBe('teamA');
    expect(squashNextServerTeam({ pointWinnerLog: ['teamA', 'teamA'] }, 'teamA')).toBe('teamA');
    expect(squashNextServerTeam({ pointWinnerLog: ['teamA', 'teamB'] }, 'teamA')).toBe('teamB');
  });
});

describe('squashChangeEndsBeforeNextPoint', () => {
  it('signals change ends at 11-9 but not 11-10', () => {
    expect(squashChangeEndsBeforeNextPoint(11, 9)).toBe(true);
    expect(squashChangeEndsBeforeNextPoint(9, 11)).toBe(true);
    expect(squashChangeEndsBeforeNextPoint(11, 10)).toBe(false);
    expect(squashChangeEndsBeforeNextPoint(10, 11)).toBe(false);
  });
});

describe('squashMidGameEndsSwapped', () => {
  it('flips after the interval except in the 11-10 band', () => {
    expect(squashMidGameEndsSwapped(10, 8)).toBe(false);
    expect(squashMidGameEndsSwapped(11, 9)).toBe(true);
    expect(squashMidGameEndsSwapped(11, 10)).toBe(false);
    expect(squashMidGameEndsSwapped(12, 10)).toBe(true);
  });
});

describe('squashCourtEndsSwapped', () => {
  const baseState = {
    activeSetIndex: 0,
    matchStartCourtEndsSwapped: false,
  } as LiveScoringState;

  it('alternates between games and after the mid-game interval', () => {
    expect(squashCourtEndsSwapped(baseState, 0, 0)).toBe(false);
    expect(squashCourtEndsSwapped({ ...baseState, activeSetIndex: 1 }, 0, 0)).toBe(true);
    expect(squashCourtEndsSwapped(baseState, 11, 9)).toBe(true);
    expect(squashCourtEndsSwapped({ ...baseState, activeSetIndex: 1 }, 11, 9)).toBe(false);
  });
});
