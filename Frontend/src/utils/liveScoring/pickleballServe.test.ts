import { describe, expect, it } from 'vitest';
import { createInitialLiveScoringState, scoreLivePoint } from './core';
import { getRulesFromPreset } from '@/utils/scoring';
import {
  pickleballChangeEndsBeforeNextPoint,
  pickleballCourtEndsSwapped,
  pickleballCourtSideForServerScore,
  pickleballDoublesPlayerIndex,
  pickleballDoublesServeSlot,
  pickleballIsDecidingGame,
  pickleballMidpointScore,
  pickleballNextServerTeam,
  pickleballServeMotionToken,
} from './pickleballServe';

describe('pickleballServe', () => {
  it('maps even server score to right court', () => {
    expect(pickleballCourtSideForServerScore(0)).toBe('rightDeuce');
    expect(pickleballCourtSideForServerScore(4)).toBe('rightDeuce');
    expect(pickleballCourtSideForServerScore(1)).toBe('leftAd');
    expect(pickleballCourtSideForServerScore(7)).toBe('leftAd');
  });

  it('uses USAPA midpoint scores', () => {
    expect(pickleballMidpointScore(11)).toBe(6);
    expect(pickleballMidpointScore(15)).toBe(8);
    expect(pickleballMidpointScore(21)).toBe(11);
  });

  it('signals side switch at 6 in games to 11 (deciding game)', () => {
    expect(
      pickleballChangeEndsBeforeNextPoint(6, 4, 11, { isDecidingGame: true, activeSetIndex: 0, totalPointsInGame: 10 })
    ).toBe(true);
    expect(
      pickleballChangeEndsBeforeNextPoint(4, 6, 11, { isDecidingGame: true, activeSetIndex: 0, totalPointsInGame: 10 })
    ).toBe(true);
    expect(
      pickleballChangeEndsBeforeNextPoint(6, 6, 11, { isDecidingGame: true, activeSetIndex: 0, totalPointsInGame: 12 })
    ).toBe(false);
    expect(
      pickleballChangeEndsBeforeNextPoint(5, 5, 11, { isDecidingGame: true, activeSetIndex: 0, totalPointsInGame: 10 })
    ).toBe(false);
  });

  it('skips mid-game switch in non-deciding games of a match', () => {
    expect(
      pickleballChangeEndsBeforeNextPoint(6, 4, 11, { isDecidingGame: false, activeSetIndex: 0, totalPointsInGame: 10 })
    ).toBe(false);
  });

  it('signals between-game switch at 0-0 of game 2+', () => {
    expect(
      pickleballChangeEndsBeforeNextPoint(0, 0, 11, { isDecidingGame: false, activeSetIndex: 1, totalPointsInGame: 0 })
    ).toBe(true);
  });

  it('signals side switch at 11 in games to 21', () => {
    expect(
      pickleballChangeEndsBeforeNextPoint(11, 9, 21, { isDecidingGame: true, activeSetIndex: 0, totalPointsInGame: 20 })
    ).toBe(true);
  });

  it('keeps server on consecutive rally wins', () => {
    expect(pickleballNextServerTeam({ pointWinnerLog: ['teamA', 'teamA'] }, 'teamA')).toBe('teamA');
    expect(pickleballNextServerTeam({ pointWinnerLog: ['teamA', 'teamB'] }, 'teamA')).toBe('teamB');
  });

  it('tracks doubles server through side outs', () => {
    expect(pickleballDoublesPlayerIndex({ pointWinnerLog: [] }, 'teamA', 'teamA', 1, 0, 0)).toBe(1);
    expect(pickleballDoublesPlayerIndex({ pointWinnerLog: [] }, 'teamB', 'teamA', 1, 0, 0)).toBe(0);
    expect(pickleballDoublesPlayerIndex({ pointWinnerLog: ['teamA'] }, 'teamA', 'teamA', 1, 1, 0)).toBe(1);
    expect(pickleballDoublesPlayerIndex({ pointWinnerLog: ['teamA', 'teamB'] }, 'teamA', 'teamA', 1, 1, 1)).toBe(1);
    expect(pickleballDoublesPlayerIndex({ pointWinnerLog: ['teamA', 'teamB', 'teamB'] }, 'teamA', 'teamA', 1, 1, 2)).toBe(1);
  });

  it('replays side outs from the game first server not match first', () => {
    expect(pickleballDoublesPlayerIndex({ pointWinnerLog: ['teamB'] }, 'teamB', 'teamA', 1, 0, 1)).toBe(0);
    expect(pickleballDoublesPlayerIndex({ pointWinnerLog: ['teamB', 'teamB'] }, 'teamB', 'teamA', 1, 0, 2)).toBe(0);
  });

  it('hides doubles serve slot under rally scoring', () => {
    expect(pickleballDoublesServeSlot(0)).toBeNull();
  });

  it('prefixes motion tokens for serve coach animations', () => {
    expect(pickleballServeMotionToken('pts-3-teamA-0-0')).toBe('pb-pts-3-teamA-0-0');
  });

  it('flips court at midpoint in deciding game only', () => {
    const rules = {
      ...getRulesFromPreset('BEST_OF_3_11'),
      preset: 'BEST_OF_3_11' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const game1 = {
      ...createInitialLiveScoringState(rules),
      firstServerTeam: 'teamA' as const,
      activeSetIndex: 0,
      sets: [{ teamA: 6, teamB: 4, isTieBreak: false }],
    };
    expect(pickleballIsDecidingGame(game1, rules)).toBe(false);
    expect(pickleballCourtEndsSwapped(game1, 6, 4, rules)).toBe(false);

    const decider = {
      ...game1,
      activeSetIndex: 2,
      sets: [
        { teamA: 11, teamB: 5, isTieBreak: false },
        { teamA: 5, teamB: 11, isTieBreak: false },
        { teamA: 6, teamB: 4, isTieBreak: false },
      ],
    };
    expect(pickleballIsDecidingGame(decider, rules)).toBe(true);
    expect(pickleballCourtEndsSwapped(decider, 6, 4, rules)).toBe(true);
  });

  it('logs rally winners for single-game pickleball presets', () => {
    const rules = {
      ...getRulesFromPreset('POINTS_11'),
      preset: 'POINTS_11' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    let state = createInitialLiveScoringState(rules);
    state = scoreLivePoint(state, 'teamA', rules).state;
    state = scoreLivePoint(state, 'teamA', rules).state;
    expect(state.pointWinnerLog).toEqual(['teamA', 'teamA']);
    expect(pickleballNextServerTeam(state, 'teamA')).toBe('teamA');
  });
});
