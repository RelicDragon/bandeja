import { describe, expect, it } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import { createInitialLiveScoringState } from './core';
import { computeServeGuideSnapshotByPlugin, resolveLiveScoringPlugin } from '@/liveScoring/registry';
import {
  tableTennisChangeEndsBeforeNextPoint,
  tableTennisCourtEndsSwapped,
  tableTennisIsDecidingGame,
  tableTennisNextServerTeam,
} from './tableTennisServeGuide';

const ttRules = {
  ...getRulesFromPreset('BEST_OF_3_11'),
  preset: 'BEST_OF_3_11' as const,
  deucesBeforeGoldenPoint: null,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const singleGameRules = {
  ...getRulesFromPreset('POINTS_11'),
  preset: 'POINTS_11' as const,
  deucesBeforeGoldenPoint: null,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const plugin = resolveLiveScoringPlugin('TABLE_TENNIS', 'BEST_OF_3_11');

describe('tableTennisServeGuide', () => {
  it('alternates two serves per player until deuce', () => {
    const first = 'teamA' as const;
    expect(tableTennisNextServerTeam(first, 0, 0, 0)).toBe('teamA');
    expect(tableTennisNextServerTeam(first, 1, 1, 0)).toBe('teamB');
    expect(tableTennisNextServerTeam(first, 2, 2, 0)).toBe('teamB');
    expect(tableTennisNextServerTeam(first, 3, 3, 0)).toBe('teamA');
    expect(tableTennisNextServerTeam(first, 4, 4, 0)).toBe('teamA');
    expect(tableTennisNextServerTeam(first, 5, 5, 0)).toBe('teamB');
  });

  it('alternates every point from 10–10', () => {
    const first = 'teamA' as const;
    const atDeuce = tableTennisNextServerTeam(first, 20, 10, 10);
    expect(tableTennisNextServerTeam(first, 20, 10, 10)).toBe(atDeuce);
    expect(tableTennisNextServerTeam(first, 21, 11, 10)).not.toBe(atDeuce);
    expect(tableTennisNextServerTeam(first, 22, 11, 11)).toBe(atDeuce);
  });

  it('does not prompt mid-game change in non-deciding games', () => {
    expect(tableTennisChangeEndsBeforeNextPoint(5, 0, false)).toBe(false);
    expect(tableTennisChangeEndsBeforeNextPoint(10, 0, false)).toBe(false);
    expect(tableTennisChangeEndsBeforeNextPoint(0, 1, false)).toBe(true);
  });

  it('prompts once at five points in the deciding game only', () => {
    expect(tableTennisChangeEndsBeforeNextPoint(5, 2, true)).toBe(true);
    expect(tableTennisChangeEndsBeforeNextPoint(10, 2, true)).toBe(false);
    expect(tableTennisChangeEndsBeforeNextPoint(5, 0, false)).toBe(false);
    expect(tableTennisChangeEndsBeforeNextPoint(5, 0, true)).toBe(true);
  });

  it('flips court between games and at five in decider', () => {
    const state = {
      ...createInitialLiveScoringState(ttRules),
      firstServerTeam: 'teamA' as const,
      matchStartCourtEndsSwapped: false,
    };
    expect(tableTennisCourtEndsSwapped(state, 0, false)).toBe(false);
    expect(tableTennisCourtEndsSwapped(state, 5, false)).toBe(false);
    expect(tableTennisCourtEndsSwapped({ ...state, activeSetIndex: 1 }, 0, false)).toBe(true);
    expect(tableTennisCourtEndsSwapped({ ...state, activeSetIndex: 2 }, 0, true)).toBe(false);
    expect(tableTennisCourtEndsSwapped({ ...state, activeSetIndex: 2 }, 5, true)).toBe(true);
    expect(tableTennisCourtEndsSwapped({ ...state, activeSetIndex: 2 }, 10, true)).toBe(true);
  });

  it('treats single-game preset as deciding', () => {
    const state = createInitialLiveScoringState(singleGameRules);
    expect(tableTennisIsDecidingGame(state, singleGameRules)).toBe(true);
    expect(tableTennisChangeEndsBeforeNextPoint(5, 0, true)).toBe(true);
  });

  it('detects deciding game when games are tied in a match', () => {
    const state = {
      ...createInitialLiveScoringState(ttRules),
      activeSetIndex: 2,
      sets: [
        { teamA: 11, teamB: 9, isTieBreak: false },
        { teamA: 8, teamB: 11, isTieBreak: false },
        { teamA: 0, teamB: 0, isTieBreak: false },
      ],
    };
    expect(tableTennisIsDecidingGame(state, ttRules)).toBe(true);
    const leading = {
      ...state,
      activeSetIndex: 1,
      sets: [
        { teamA: 11, teamB: 9, isTieBreak: false },
        { teamA: 0, teamB: 0, isTieBreak: false },
      ],
    };
    expect(tableTennisIsDecidingGame(leading, ttRules)).toBe(false);
  });
});

describe('table tennis serve guide integration', () => {
  const baseState = {
    ...createInitialLiveScoringState(ttRules),
    firstServerTeam: 'teamA' as const,
    pointsServeRotation: 'official' as const,
  };

  it('maps side and server through the first six points of game one', () => {
    const cases = [
      { ta: 0, tb: 0, server: 'teamA' as const, side: 'rightDeuce' as const, change: false },
      { ta: 1, tb: 0, server: 'teamB' as const, side: 'leftAd' as const, change: false },
      { ta: 2, tb: 0, server: 'teamB' as const, side: 'rightDeuce' as const, change: false },
      { ta: 3, tb: 0, server: 'teamA' as const, side: 'leftAd' as const, change: false },
      { ta: 4, tb: 0, server: 'teamA' as const, side: 'rightDeuce' as const, change: false },
      { ta: 5, tb: 0, server: 'teamB' as const, side: 'leftAd' as const, change: false },
    ];

    for (const row of cases) {
      const snap = computeServeGuideSnapshotByPlugin(
        plugin,
        { ...baseState, sets: [{ teamA: row.ta, teamB: row.tb, isTieBreak: false }] },
        ttRules,
        ['A1'],
        ['B1'],
        2
      );
      expect(snap?.serverTeam).toBe(row.server);
      expect(snap?.courtSide).toBe(row.side);
      expect(snap?.changeEndsBeforeNextPoint).toBe(row.change);
    }
  });

  it('prompts change ends at five in the deciding game', () => {
    const decider = {
      ...baseState,
      activeSetIndex: 2,
      sets: [
        { teamA: 11, teamB: 9, isTieBreak: false },
        { teamA: 7, teamB: 11, isTieBreak: false },
        { teamA: 5, teamB: 0, isTieBreak: false },
      ],
    };
    const snap = computeServeGuideSnapshotByPlugin(plugin, decider, ttRules, ['A1'], ['B1'], 2);
    expect(snap?.changeEndsBeforeNextPoint).toBe(true);
  });

  it('uses deuce rotation at 10–10', () => {
    const snap = computeServeGuideSnapshotByPlugin(
      plugin,
      { ...baseState, sets: [{ teamA: 10, teamB: 10, isTieBreak: false }] },
      ttRules,
      ['A1'],
      ['B1'],
      2
    );
    expect(snap?.courtSide).toBe('rightDeuce');
    const next = computeServeGuideSnapshotByPlugin(
      plugin,
      { ...baseState, sets: [{ teamA: 11, teamB: 10, isTieBreak: false }] },
      ttRules,
      ['A1'],
      ['B1'],
      2
    );
    expect(next?.serverTeam).toBe('teamB');
    expect(next?.courtSide).toBe('leftAd');
  });
});
