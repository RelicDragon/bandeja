import { describe, expect, it } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import { createInitialLiveScoringState, scoreLivePoint } from './core';
import {
  computeServeGuideSnapshot,
  firstServerForPointsSet,
  needsServeSetup,
  tbNextServerTeam,
} from './serveGuide';

const pointsRules = {
  ...getRulesFromPreset('POINTS_16'),
  preset: 'POINTS_16' as const,
  hasGoldenPoint: false,
  allowDrawPerSet: true,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

describe('serveGuide points mode', () => {
  it('prompts first server on pristine Americano start', () => {
    const state = createInitialLiveScoringState(pointsRules);
    expect(state.mode).toBe('points');
    expect(needsServeSetup(state, pointsRules)).toBe(true);
  });

  it('prompts when official set has score but no first server (mid-match recovery)', () => {
    const state = {
      ...createInitialLiveScoringState(pointsRules),
      sets: [{ teamA: 8, teamB: 5, isTieBreak: false }],
    };
    expect(needsServeSetup(state, pointsRules)).toBe(true);
  });

  it('does not prompt after skip', () => {
    const state = {
      ...createInitialLiveScoringState(pointsRules),
      sets: [{ teamA: 3, teamB: 2, isTieBreak: false }],
      serveGuideSkipped: true,
    };
    expect(needsServeSetup(state, pointsRules)).toBe(false);
  });

  it('shows court strip after first server is chosen', () => {
    const base = createInitialLiveScoringState(pointsRules);
    const state = {
      ...base,
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
    };
    expect(needsServeSetup(state, pointsRules)).toBe(false);
    const snap = computeServeGuideSnapshot(state, pointsRules, ['Alice', 'Bob'], ['Carol', 'Dan']);
    expect(snap?.serverTeam).toBe('teamA');
    expect(snap?.courtSide).toBe('rightDeuce');
  });

  it('requests change ends before point 7 in a 16-ball set', () => {
    let state = createInitialLiveScoringState(pointsRules);
    state = { ...state, firstServerTeam: 'teamA', firstServerDoublesPlayerIndex: 0 };
    for (let i = 0; i < 6; i += 1) {
      state = scoreLivePoint(state, i % 2 === 0 ? 'teamA' : 'teamB', pointsRules).state;
    }
    const snap = computeServeGuideSnapshot(state, pointsRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.changeEndsBeforeNextPoint).toBe(true);
  });

  it('rotates server every two points', () => {
    const first = 'teamA' as const;
    expect(tbNextServerTeam(first, 0)).toBe('teamA');
    expect(tbNextServerTeam(first, 1)).toBe('teamB');
    expect(tbNextServerTeam(first, 2)).toBe('teamB');
    expect(tbNextServerTeam(first, 3)).toBe('teamA');
  });

  it('first server for set 2 follows last point of set 1', () => {
    const sets = [
      { teamA: 11, teamB: 5, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ];
    const matchFirst = 'teamA' as const;
    const lastServerSet1 = tbNextServerTeam(matchFirst, 15);
    expect(firstServerForPointsSet(1, sets, matchFirst)).toBe(lastServerSet1 === 'teamA' ? 'teamB' : 'teamA');
  });
});

const superTbRules = {
  ...getRulesFromPreset('CLASSIC_SUPER_TIEBREAK'),
  preset: 'CLASSIC_SUPER_TIEBREAK' as const,
  hasGoldenPoint: false,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

describe('serveGuide super tie-break', () => {
  it('prompts first server on pristine super tie-break decider at 0-0', () => {
    const state = {
      ...createInitialLiveScoringState(superTbRules),
      sets: [{ teamA: 0, teamB: 0, isTieBreak: true }],
      activeSetIndex: 0,
    };
    expect(needsServeSetup(state, superTbRules)).toBe(true);
  });

  it('shows super tie-break strip after first server is chosen', () => {
    const state = {
      ...createInitialLiveScoringState(superTbRules),
      sets: [{ teamA: 0, teamB: 0, isTieBreak: true }],
      activeSetIndex: 0,
      firstServerTeam: 'teamB' as const,
      firstServerDoublesPlayerIndex: 1,
    };
    expect(needsServeSetup(state, superTbRules)).toBe(false);
    const snap = computeServeGuideSnapshot(state, superTbRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.serverTeam).toBe('teamB');
    expect(snap?.tieBreakServeSlot).toBe('serveOne');
  });

  it('prompts mid super tie-break when score exists but no seed', () => {
    const state = {
      ...createInitialLiveScoringState(superTbRules),
      sets: [{ teamA: 5, teamB: 3, isTieBreak: true }],
      activeSetIndex: 0,
    };
    expect(needsServeSetup(state, superTbRules)).toBe(true);
  });
});
