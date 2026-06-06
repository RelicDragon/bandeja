import { describe, expect, it } from 'vitest';
import {
  badmintonChangeEndsBeforeNextPoint,
  badmintonCourtEndsSwapped,
  badmintonCourtSideForServerScore,
  badmintonDoublesPlayerIndex,
  badmintonNextServerTeam,
} from './badmintonServe';

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
    expect(badmintonChangeEndsBeforeNextPoint(11, 10, 21)).toBe(false);
    expect(badmintonChangeEndsBeforeNextPoint(11, 11, 21)).toBe(false);
    expect(badmintonChangeEndsBeforeNextPoint(10, 10, 21)).toBe(false);
  });

  it('signals interval at 8 in games to 15', () => {
    expect(badmintonChangeEndsBeforeNextPoint(8, 6, 15)).toBe(true);
    expect(badmintonChangeEndsBeforeNextPoint(8, 8, 15)).toBe(false);
  });

  it('winner of last rally serves next', () => {
    expect(badmintonNextServerTeam({ pointWinnerLog: [] }, 'teamA')).toBe('teamA');
    expect(badmintonNextServerTeam({ pointWinnerLog: ['teamA', 'teamA'] }, 'teamA')).toBe('teamA');
    expect(badmintonNextServerTeam({ pointWinnerLog: ['teamA', 'teamB'] }, 'teamA')).toBe('teamB');
  });

  it('flips court ends between games and after interval', () => {
    expect(
      badmintonCourtEndsSwapped({ activeSetIndex: 1, matchStartCourtEndsSwapped: false }, 0, 0, 21),
    ).toBe(true);
    expect(
      badmintonCourtEndsSwapped({ activeSetIndex: 0, matchStartCourtEndsSwapped: false }, 12, 9, 21),
    ).toBe(true);
  });

  it('doubles: first server from match setup at 0-0', () => {
    expect(badmintonDoublesPlayerIndex({ pointWinnerLog: [] }, 'teamA', 'teamA', 1, 0, 0)).toBe(1);
    expect(badmintonDoublesPlayerIndex({ pointWinnerLog: [] }, 'teamB', 'teamA', 1, 0, 0)).toBe(0);
  });

  it('doubles: same server continues when serving team wins', () => {
    expect(badmintonDoublesPlayerIndex({ pointWinnerLog: ['teamA'] }, 'teamA', 'teamA', 1, 1, 0)).toBe(1);
    expect(badmintonDoublesPlayerIndex({ pointWinnerLog: ['teamA', 'teamA'] }, 'teamA', 'teamA', 1, 2, 0)).toBe(1);
  });

  it('doubles: side-out picks player in correct service court after partner swaps', () => {
    expect(badmintonDoublesPlayerIndex({ pointWinnerLog: ['teamA', 'teamA', 'teamB'] }, 'teamA', 'teamA', 1, 2, 1)).toBe(
      1,
    );
    expect(badmintonDoublesPlayerIndex({ pointWinnerLog: ['teamA', 'teamA', 'teamB', 'teamA'] }, 'teamA', 'teamA', 1, 3, 1)).toBe(
      0,
    );
  });
});
