import { describe, expect, it } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import { createInitialLiveScoringState, scoreLivePoint } from './core';
import type { LiveScoringState } from './types';
import {
  computeServeGuideSnapshot,
  courtSideForTieBreakPoint,
  effectiveCourtEndsSwapped,
  effectiveCourtTeamASidesMirrored,
  firstServerForPointsSet,
  firstServerTeamForSet,
  needsServeSetup,
  servingTeamForGame,
  tbNextServerTeam,
  tieBreakServeSlotAtPoint,
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

  it('flips court diagram when match start ends are swapped at 0-0', () => {
    const state = {
      ...createInitialLiveScoringState(pointsRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      matchStartCourtEndsSwapped: true,
    };
    const snap = computeServeGuideSnapshot(state, pointsRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.courtEndsSwapped).toBe(true);
    expect(effectiveCourtEndsSwapped(state)).toBe(true);
  });

  it('mirrors team A baseline when match start team A sides flip is set at 0-0', () => {
    const state = {
      ...createInitialLiveScoringState(pointsRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      matchStartTeamASidesMirrored: true,
    };
    const snap = computeServeGuideSnapshot(state, pointsRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.courtTeamASidesMirrored).toBe(true);
    expect(snap?.courtTeamBSidesMirrored).toBe(false);
    expect(effectiveCourtTeamASidesMirrored(state)).toBe(true);
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
    expect(snap?.courtEndsSwapped).toBe(true);
  });

  it('keeps swapped ends through points 7–11', () => {
    let state = createInitialLiveScoringState(pointsRules);
    state = { ...state, firstServerTeam: 'teamA', firstServerDoublesPlayerIndex: 0 };
    for (let i = 0; i < 7; i += 1) {
      state = scoreLivePoint(state, i % 2 === 0 ? 'teamA' : 'teamB', pointsRules).state;
    }
    const snap = computeServeGuideSnapshot(state, pointsRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.changeEndsBeforeNextPoint).toBe(false);
    expect(snap?.courtEndsSwapped).toBe(true);
  });

  it('simple rotation alternates sides every point and partners every two points', () => {
    const state = {
      ...createInitialLiveScoringState(pointsRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      pointsServeRotation: 'simple' as const,
    };
    const snap0 = computeServeGuideSnapshot(state, pointsRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap0?.serverTeam).toBe('teamA');
    expect(snap0?.serverPlayerIndex).toBe(0);
    expect(snap0?.courtSide).toBe('rightDeuce');
    expect(snap0?.tieBreakServeSlot).toBeNull();

    let s: LiveScoringState = state;
    s = scoreLivePoint(s, 'teamA', pointsRules).state;
    const snap1 = computeServeGuideSnapshot(s, pointsRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap1?.serverTeam).toBe('teamA');
    expect(snap1?.serverPlayerIndex).toBe(0);
    expect(snap1?.courtSide).toBe('leftAd');

    s = scoreLivePoint(s, 'teamB', pointsRules).state;
    const snap2 = computeServeGuideSnapshot(s, pointsRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap2?.serverTeam).toBe('teamA');
    expect(snap2?.serverPlayerIndex).toBe(1);
    expect(snap2?.courtSide).toBe('rightDeuce');
  });

  it('official tie-break court side alternates every point', () => {
    expect(tieBreakServeSlotAtPoint(0)).toBe('serveOne');
    expect(tieBreakServeSlotAtPoint(1)).toBe('serveOne');
    expect(tieBreakServeSlotAtPoint(2)).toBe('serveTwo');
    expect(courtSideForTieBreakPoint(0)).toBe('rightDeuce');
    expect(courtSideForTieBreakPoint(1)).toBe('leftAd');
    expect(courtSideForTieBreakPoint(2)).toBe('rightDeuce');

    let state: LiveScoringState = {
      ...createInitialLiveScoringState(pointsRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      pointsServeRotation: 'official' as const,
    };
    state = scoreLivePoint(state, 'teamA', pointsRules).state;
    const snap = computeServeGuideSnapshot(state, pointsRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.serverTeam).toBe('teamB');
    expect(snap?.tieBreakServeSlot).toBe('serveOne');
    expect(snap?.courtSide).toBe('leftAd');
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

const classicRules = {
  ...getRulesFromPreset('CLASSIC_BEST_OF_3'),
  preset: 'CLASSIC_BEST_OF_3' as const,
  hasGoldenPoint: false,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const emptyClassic = () => ({
  pointState: { kind: 'regular' as const, teamA: 0 as const, teamB: 0 as const },
  withinSetTieBreak: false,
  tieBreakA: 0,
  tieBreakB: 0,
  classicPointsPlayedInGame: 0,
});

describe('serveGuide classic games', () => {
  it('shows change ends before the first point of game 2', () => {
    const state = {
      ...createInitialLiveScoringState(classicRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      sets: [{ teamA: 1, teamB: 0, isTieBreak: false }],
      classic: emptyClassic(),
    };
    const snap = computeServeGuideSnapshot(state, classicRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.changeEndsBeforeNextPoint).toBe(true);
    expect(snap?.courtEndsSwapped).toBe(true);
  });

  it('does not show change ends mid-game', () => {
    const state = {
      ...createInitialLiveScoringState(classicRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      sets: [{ teamA: 1, teamB: 0, isTieBreak: false }],
      classic: {
        ...emptyClassic(),
        classicPointsPlayedInGame: 2,
        pointState: { kind: 'regular' as const, teamA: 30 as const, teamB: 0 as const },
      },
    };
    const snap = computeServeGuideSnapshot(state, classicRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.changeEndsBeforeNextPoint).toBe(false);
    expect(snap?.courtEndsSwapped).toBe(true);
  });

  it('set 2 first server is opposite of set 1 last game server (6–4)', () => {
    const matchFirst = 'teamA' as const;
    const sets = [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ];
    const lastGameServer = servingTeamForGame(firstServerTeamForSet(0, sets, matchFirst), 9);
    expect(firstServerTeamForSet(1, sets, matchFirst)).toBe(lastGameServer === 'teamA' ? 'teamB' : 'teamA');

    const state = {
      ...createInitialLiveScoringState(classicRules),
      firstServerTeam: matchFirst,
      firstServerDoublesPlayerIndex: 0,
      activeSetIndex: 1,
      sets,
      classic: emptyClassic(),
    };
    const snap = computeServeGuideSnapshot(state, classicRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.serverTeam).toBe(firstServerTeamForSet(1, sets, matchFirst));
  });

  it('set 2 first server after 7–6: receiver of tie-break first point opens the set', () => {
    const matchFirst = 'teamA' as const;
    const sets = [{ teamA: 7, teamB: 6, isTieBreak: false }, { teamA: 0, teamB: 0, isTieBreak: false }];
    const tbFirstServer = servingTeamForGame(firstServerTeamForSet(0, sets, matchFirst), 12);
    expect(tbFirstServer).toBe('teamA');
    expect(firstServerTeamForSet(1, sets, matchFirst)).toBe('teamB');

    const state = {
      ...createInitialLiveScoringState(classicRules),
      firstServerTeam: matchFirst,
      firstServerDoublesPlayerIndex: 0,
      activeSetIndex: 1,
      sets,
      classic: emptyClassic(),
    };
    expect(computeServeGuideSnapshot(state, classicRules, ['A1', 'A2'], ['B1', 'B2'])?.serverTeam).toBe('teamB');
  });

  it('set 3 first server chains through set 2 (4–6 after 6–4)', () => {
    const matchFirst = 'teamA' as const;
    const sets = [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 4, teamB: 6, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ];
    expect(firstServerTeamForSet(1, sets, matchFirst)).toBe('teamA');
    expect(firstServerTeamForSet(2, sets, matchFirst)).toBe('teamA');
  });

  it('ignores supplemental rows when deriving the next official set server', () => {
    const matchFirst = 'teamA' as const;
    const sets = [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 3, teamB: 2, isTieBreak: false, role: 'EXTRA_BALLS' as const },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ];
    expect(firstServerTeamForSet(2, sets, matchFirst)).toBe(firstServerTeamForSet(1, sets.slice(0, 1).concat([sets[2]!]), matchFirst));
  });

  it('super tie-break first point follows last regular set (1–1 Bo3)', () => {
    const matchFirst = 'teamA' as const;
    const sets = [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 4, teamB: 6, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: true },
    ];
    const state = {
      ...createInitialLiveScoringState(superTbRules),
      firstServerTeam: matchFirst,
      firstServerDoublesPlayerIndex: 0,
      activeSetIndex: 2,
      sets,
      classic: emptyClassic(),
    };
    expect(firstServerTeamForSet(2, sets, matchFirst)).toBe('teamA');
    expect(computeServeGuideSnapshot(state, superTbRules, ['A1', 'A2'], ['B1', 'B2'])?.serverTeam).toBe('teamA');
  });

  it('shows change ends at start of set 2 when set 1 had an even game count', () => {
    const state = {
      ...createInitialLiveScoringState(classicRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      activeSetIndex: 1,
      sets: [
        { teamA: 6, teamB: 4, isTieBreak: false },
        { teamA: 0, teamB: 0, isTieBreak: false },
      ],
      classic: emptyClassic(),
    };
    const snap = computeServeGuideSnapshot(state, classicRules, ['A1', 'A2'], ['B1', 'B2']);
    expect(snap?.changeEndsBeforeNextPoint).toBe(true);
    expect(snap?.courtEndsSwapped).toBe(false);
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
