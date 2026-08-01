import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import {
  computeMatchWinner,
  getRules,
  getRulesFromPreset,
  isOfficialPointsBallBudgetExhausted,
} from '@/utils/scoring';
import {
  advanceLiveSet,
  applyAutomaticContinueChoice,
  applyAutomaticOpenEndedSetConfirm,
  applyAutomaticRecordMode,
  applyOptionalDeciderFormat,
  automaticRecordModeChoicePending,
  canConfirmAutomaticOpenEndedSetChoice,
  createInitialLiveScoringState,
  freezeTimedClassicSetAtPartialScore,
  isAutomaticLiveMatchComplete,
  optionalContinueSetChoicePending,
  optionalDeciderChoicePending,
  parseLiveScoringState,
  scoreLivePoint,
  unscoreLivePoint,
} from './core';
import { seedAutomaticRecordModeOnState } from './automaticFlexible';

const classicRules = {
  ...getRulesFromPreset('CLASSIC_BEST_OF_3'),
  preset: 'CLASSIC_BEST_OF_3' as const,
  deucesBeforeGoldenPoint: null,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const pointsRules = {
  ...getRulesFromPreset('POINTS_16'),
  preset: 'POINTS_16' as const,
  deucesBeforeGoldenPoint: null,
  allowDrawPerSet: true,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const superTbRules = {
  ...getRulesFromPreset('CLASSIC_SUPER_TIEBREAK'),
  preset: 'CLASSIC_SUPER_TIEBREAK' as const,
  deucesBeforeGoldenPoint: null,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const points21Rules = {
  ...getRulesFromPreset('POINTS_21'),
  preset: 'POINTS_21' as const,
  deucesBeforeGoldenPoint: null,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const play = (side: 'teamA' | 'teamB', times: number, start = createInitialLiveScoringState(classicRules)) => {
  let state = start;
  for (let i = 0; i < times; i += 1) {
    state = scoreLivePoint(state, side, classicRules).state;
  }
  return state;
};

describe('live scoring core golden transitions', () => {
  it('moves through classic points and undo', () => {
    let state = createInitialLiveScoringState(classicRules);
    state = scoreLivePoint(state, 'teamA', classicRules).state;
    state = scoreLivePoint(state, 'teamB', classicRules).state;
    state = scoreLivePoint(state, 'teamA', classicRules).state;

    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 30, teamB: 15 });
    expect(state.classic?.classicPointsPlayedInGame).toBe(3);

    state = unscoreLivePoint(state, 'teamA', classicRules).state;
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 15, teamB: 15 });
    expect(state.classic?.classicPointsPlayedInGame).toBe(2);
  });

  it('awards a normal game immediately at game point', () => {
    let state = play('teamA', 3);
    state = scoreLivePoint(state, 'teamA', classicRules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 1, teamB: 0 });
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 0, teamB: 0 });
  });

  it('handles deuce and advantage game win in one tap', () => {
    let state = createInitialLiveScoringState(classicRules);
    state = play('teamA', 3, state);
    state = play('teamB', 3, state);
    state = scoreLivePoint(state, 'teamA', classicRules).state;

    expect(state.classic?.pointState).toEqual({ kind: 'advantage', side: 'teamA' });

    state = scoreLivePoint(state, 'teamA', classicRules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 1, teamB: 0 });
  });

  it('undo from advantage or legacy deuce steps back in the game', () => {
    let state = createInitialLiveScoringState(classicRules);
    state = play('teamA', 3, state);
    state = play('teamB', 3, state);
    state = scoreLivePoint(state, 'teamA', classicRules).state;
    expect(state.classic?.pointState).toEqual({ kind: 'advantage', side: 'teamA' });

    state = unscoreLivePoint(state, 'teamA', classicRules).state;
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 40, teamB: 40 });

    state = unscoreLivePoint(state, 'teamB', classicRules).state;
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 40, teamB: 30 });

    const withLegacyDeuce = createInitialLiveScoringState(classicRules);
    withLegacyDeuce.classic = {
      ...withLegacyDeuce.classic!,
      pointState: { kind: 'deuce' },
    };
    const afterLegacyUndo = unscoreLivePoint(withLegacyDeuce, 'teamA', classicRules).state;
    expect(afterLegacyUndo.classic?.pointState).toEqual({ kind: 'regular', teamA: 30, teamB: 40 });
  });

  it('finishes an in-set tie-break as 7-6', () => {
    let state = createInitialLiveScoringState(classicRules, [{ teamA: 6, teamB: 6 }]);

    expect(state.classic?.withinSetTieBreak).toBe(true);

    for (let i = 0; i < 7; i += 1) state = scoreLivePoint(state, 'teamA', classicRules).state;

    expect(state.sets[0]).toMatchObject({ teamA: 7, teamB: 6, isTieBreak: false });
    expect(state.activeSetIndex).toBe(1);
    expect(state.sets[1]).toMatchObject({ teamA: 0, teamB: 0 });
    expect(state.classic?.withinSetTieBreak).toBe(false);
    expect(state.classic?.tieBreakA).toBe(0);
  });

  it('advances to the next set after a completed set', () => {
    let state = createInitialLiveScoringState(classicRules, [{ teamA: 6, teamB: 4 }, { teamA: 0, teamB: 0 }]);
    state = advanceLiveSet(state, classicRules).state;

    expect(state.activeSetIndex).toBe(1);
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 0, teamB: 0 });
  });

  it('auto-advances active set index when a game point completes the set', () => {
    let state = createInitialLiveScoringState(classicRules, [
      { teamA: 6, teamB: 5, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ]);
    state.classic = { ...state.classic!, pointState: { kind: 'regular', teamA: 40, teamB: 0 } };
    state = scoreLivePoint(state, 'teamA', classicRules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 7, teamB: 5 });
    expect(state.activeSetIndex).toBe(1);
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 0, teamB: 0 });
  });

  it('scores simple points mode independently from classic point state', () => {
    let state = createInitialLiveScoringState(pointsRules);
    state = scoreLivePoint(state, 'teamB', pointsRules).state;
    state = scoreLivePoint(state, 'teamB', pointsRules).state;
    state = unscoreLivePoint(state, 'teamB', pointsRules).state;

    expect(state.mode).toBe('points');
    expect(state.classic).toBeUndefined();
    expect(state.sets[0]).toMatchObject({ teamA: 0, teamB: 1 });
  });

  it('Bo3 2–0 does not keep a phantom third official row or advance activeSetIndex past last played set', () => {
    let state = createInitialLiveScoringState(classicRules, [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 5, teamB: 3, isTieBreak: false },
    ]);
    state.activeSetIndex = 1;
    state.classic = { ...state.classic!, pointState: { kind: 'regular', teamA: 40, teamB: 0 } };
    state = scoreLivePoint(state, 'teamA', classicRules).state;
    expect(state.sets.length).toBe(2);
    expect(state.activeSetIndex).toBe(1);
    expect(computeMatchWinner(state.sets, classicRules)).toBe('A');
  });

  it('POINTS_21 stops at total cap and matches computeMatchWinner', () => {
    let state = createInitialLiveScoringState(points21Rules);
    for (let i = 0; i < 12; i += 1) state = scoreLivePoint(state, 'teamA', points21Rules).state;
    for (let i = 0; i < 9; i += 1) state = scoreLivePoint(state, 'teamB', points21Rules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 12, teamB: 9 });
    expect(scoreLivePoint(state, 'teamA', points21Rules).changed).toBe(false);
    expect(computeMatchWinner(state.sets, points21Rules)).toBe('A');
    expect(isOfficialPointsBallBudgetExhausted(state.sets, state.activeSetIndex, points21Rules)).toBe(true);
  });

  it('isOfficialPointsBallBudgetExhausted matches live engine (full valid row only)', () => {
    expect(isOfficialPointsBallBudgetExhausted([{ teamA: 12, teamB: 8 }], 0, points21Rules)).toBe(false);
    expect(isOfficialPointsBallBudgetExhausted([{ teamA: 12, teamB: 9 }], 0, points21Rules)).toBe(true);
  });

  it('CLASSIC_SUPER_TIEBREAK at 1–1 adds STB row then ends after decider', () => {
    let state = createInitialLiveScoringState(superTbRules, [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 4, teamB: 5, isTieBreak: false },
    ]);
    state.activeSetIndex = 1;
    state.classic = { ...state.classic!, pointState: { kind: 'regular', teamA: 0, teamB: 40 } };
    state = scoreLivePoint(state, 'teamB', superTbRules).state;
    expect(state.sets.length).toBe(3);
    expect(state.sets[2]).toMatchObject({ teamA: 0, teamB: 0, isTieBreak: true });
    expect(state.activeSetIndex).toBe(2);
    for (let i = 0; i < 10; i += 1) state = scoreLivePoint(state, 'teamA', superTbRules).state;
    expect(scoreLivePoint(state, 'teamA', superTbRules).changed).toBe(false);
    expect(computeMatchWinner(state.sets, superTbRules)).toBe('A');
    expect(state.activeSetIndex).toBe(2);
  });

  it('grows official rows before supplemental EXTRA_* when advancing', () => {
    let state = createInitialLiveScoringState(superTbRules, [
      { teamA: 6, teamB: 4, isTieBreak: false, role: 'OFFICIAL' as const },
      { teamA: 4, teamB: 5, isTieBreak: false, role: 'OFFICIAL' as const },
      { teamA: 0, teamB: 0, isTieBreak: false, role: 'EXTRA_GAMES' as const },
    ]);
    state.activeSetIndex = 1;
    state.classic = { ...state.classic!, pointState: { kind: 'regular', teamA: 0, teamB: 40 } };
    state = scoreLivePoint(state, 'teamB', superTbRules).state;
    expect(state.sets.length).toBe(4);
    expect(state.sets[2]).toMatchObject({ teamA: 0, teamB: 0, isTieBreak: true, role: 'OFFICIAL' });
    expect(state.sets[3].role).toBe('EXTRA_GAMES');
  });

  it('golden point after two deuces (modern padel)', () => {
    const gpRules = { ...classicRules, deucesBeforeGoldenPoint: 2 };
    let state = createInitialLiveScoringState(gpRules);
    state = play('teamA', 3, state);
    state = play('teamB', 3, state);
    state = scoreLivePoint(state, 'teamA', gpRules).state;
    expect(state.classic?.pointState).toEqual({ kind: 'advantage', side: 'teamA' });
    state = scoreLivePoint(state, 'teamB', gpRules).state;
    expect(state.classic?.deuceCount).toBe(1);
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 40, teamB: 40 });
    state = scoreLivePoint(state, 'teamA', gpRules).state;
    expect(state.classic?.pointState).toEqual({ kind: 'advantage', side: 'teamA' });
    state = scoreLivePoint(state, 'teamB', gpRules).state;
    expect(state.classic?.deuceCount).toBe(2);
    state = scoreLivePoint(state, 'teamA', gpRules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 1, teamB: 0 });
  });

  it('golden point awards game from 40–40', () => {
    const gpRules = { ...classicRules, deucesBeforeGoldenPoint: 0 };
    let state = createInitialLiveScoringState(gpRules);
    state = play('teamA', 3, state);
    state = play('teamB', 3, state);
    state = scoreLivePoint(state, 'teamA', gpRules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 1, teamB: 0 });
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 0, teamB: 0 });
  });

  it('preserves supplemental set roles in normalize', () => {
    const sets = [
      { teamA: 1, teamB: 0, isTieBreak: false, role: 'OFFICIAL' as const },
      { teamA: 0, teamB: 0, isTieBreak: false, role: 'EXTRA_GAMES' as const },
    ];
    const state = createInitialLiveScoringState(classicRules, sets);
    expect(state.sets[1].role).toBe('EXTRA_GAMES');
  });

  it('optional decider blocks scoring until format chosen', () => {
    const rules = {
      ...getRulesFromPreset('CLASSIC_BEST_OF_3'),
      preset: 'CLASSIC_BEST_OF_3' as const,
      superTieBreakReplacesDeciderAtIndex: null,
      deucesBeforeGoldenPoint: null,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const state = createInitialLiveScoringState(rules, [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 4, teamB: 6, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ]);
    state.activeSetIndex = 2;
    state.classic = { ...state.classic!, pointState: { kind: 'regular', teamA: 0, teamB: 0 } };
    expect(optionalDeciderChoicePending(state, rules)).toBe(true);
    expect(scoreLivePoint(state, 'teamA', rules).changed).toBe(false);
    const picked = applyOptionalDeciderFormat(state, rules, 'SUPER_TIEBREAK');
    expect(picked.changed).toBe(true);
    expect(picked.state.sets[2].isTieBreak).toBe(true);
    expect(optionalDeciderChoicePending(picked.state, rules)).toBe(false);
  });

  it('CLASSIC_AUTOMATIC asks record mode, continue, then optional decider', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
    expect(rules.superTieBreakReplacesDeciderAtIndex).toBeNull();
    expect(rules.strictValidation).toBe('CLASSIC_AUTOMATIC_RELAXED');

    let state = createInitialLiveScoringState(rules);
    expect(automaticRecordModeChoicePending(state, rules)).toBe(true);
    expect(scoreLivePoint(state, 'teamA', rules).changed).toBe(false);

    const mode = applyAutomaticRecordMode(state, rules, 'GAMES');
    expect(mode.changed).toBe(true);
    state = mode.state;
    expect(state.automaticRecordMode).toBe('GAMES');
    expect(automaticRecordModeChoicePending(state, rules)).toBe(false);

    state = {
      ...state,
      sets: [{ teamA: 6, teamB: 4, isTieBreak: false, role: 'OFFICIAL' }],
      activeSetIndex: 0,
      classic: { ...state.classic!, pointState: { kind: 'regular', teamA: 0, teamB: 0 } },
    };
    expect(optionalContinueSetChoicePending(state, rules)).toBe(true);
    expect(scoreLivePoint(state, 'teamA', rules).changed).toBe(false);

    const continued = applyAutomaticContinueChoice(state, rules, 'CONTINUE');
    expect(continued.changed).toBe(true);
    state = continued.state;
    expect(state.activeSetIndex).toBe(1);

    state = {
      ...state,
      sets: [
        { teamA: 6, teamB: 4, isTieBreak: false, role: 'OFFICIAL' },
        { teamA: 4, teamB: 6, isTieBreak: false, role: 'OFFICIAL' },
      ],
      activeSetIndex: 1,
    };
    const toDecider = applyAutomaticContinueChoice(state, rules, 'CONTINUE');
    expect(toDecider.changed).toBe(true);
    state = toDecider.state;
    expect(state.activeSetIndex).toBe(2);
    expect(optionalDeciderChoicePending(state, rules)).toBe(true);

    const stb = applyOptionalDeciderFormat(state, rules, 'SUPER_TIEBREAK');
    expect(stb.changed).toBe(true);
    expect(stb.state.sets[2].isTieBreak).toBe(true);
  });

  it('CLASSIC_AUTOMATIC americano keeps scoring until finish set, then early end', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
    let state = applyAutomaticRecordMode(createInitialLiveScoringState(rules), rules, 'AMERICANO_POINTS').state;
    expect(state.mode).toBe('points');

    state = scoreLivePoint(state, 'teamA', rules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 1, teamB: 0 });
    expect(optionalContinueSetChoicePending(state, rules)).toBe(false);
    expect(canConfirmAutomaticOpenEndedSetChoice(state, rules)).toBe(true);

    for (let i = 0; i < 8; i += 1) {
      const next = scoreLivePoint(state, i % 2 === 0 ? 'teamB' : 'teamA', rules);
      expect(next.changed).toBe(true);
      state = next.state;
    }
    // 1-0 then B/A×4 → 5-4
    expect(state.sets[0].teamA).not.toBe(state.sets[0].teamB);
    expect(optionalContinueSetChoicePending(state, rules)).toBe(false);

    const finished = applyAutomaticOpenEndedSetConfirm(state, rules);
    expect(finished.changed).toBe(true);
    state = finished.state;
    expect(optionalContinueSetChoicePending(state, rules)).toBe(true);
    expect(scoreLivePoint(state, 'teamA', rules).changed).toBe(false);

    const ended = applyAutomaticContinueChoice(state, rules, 'END');
    expect(ended.changed).toBe(true);
    expect(ended.state.automaticEarlyFinish).toBe(true);
    expect(isAutomaticLiveMatchComplete(ended.state, rules)).toBe(true);
  });

  it('CLASSIC_AUTOMATIC keeps scoring after continue into set 2', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
    let state = applyAutomaticRecordMode(createInitialLiveScoringState(rules), rules, 'AMERICANO_POINTS').state;
    state = {
      ...state,
      sets: [{ teamA: 24, teamB: 18, isTieBreak: false, role: 'OFFICIAL' }],
      activeSetIndex: 0,
      automaticOpenEndedSetConfirmed: true,
    };
    state = applyAutomaticContinueChoice(state, rules, 'CONTINUE').state;
    expect(state.activeSetIndex).toBe(1);
    state = scoreLivePoint(state, 'teamA', rules).state;
    expect(state.sets[1]).toMatchObject({ teamA: 1, teamB: 0 });
    expect(isAutomaticLiveMatchComplete(state, rules)).toBe(false);
    expect(scoreLivePoint(state, 'teamA', rules).changed).toBe(true);
  });

  it('CLASSIC_AUTOMATIC americano continues into optional STB', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
    let state = applyAutomaticRecordMode(createInitialLiveScoringState(rules), rules, 'AMERICANO_POINTS').state;
    state = {
      ...state,
      sets: [{ teamA: 24, teamB: 18, isTieBreak: false, role: 'OFFICIAL' }],
      activeSetIndex: 0,
      automaticOpenEndedSetConfirmed: true,
    };
    state = applyAutomaticContinueChoice(state, rules, 'CONTINUE').state;
    expect(state.activeSetIndex).toBe(1);
    expect(state.automaticOpenEndedSetConfirmed).toBeUndefined();

    state = {
      ...state,
      sets: [
        { teamA: 24, teamB: 18, isTieBreak: false, role: 'OFFICIAL' },
        { teamA: 18, teamB: 24, isTieBreak: false, role: 'OFFICIAL' },
      ],
      activeSetIndex: 1,
      automaticOpenEndedSetConfirmed: true,
    };
    state = applyAutomaticContinueChoice(state, rules, 'CONTINUE').state;
    expect(optionalDeciderChoicePending(state, rules)).toBe(true);

    const stb = applyOptionalDeciderFormat(state, rules, 'SUPER_TIEBREAK');
    expect(stb.changed).toBe(true);
    state = stb.state;
    expect(state.sets[2].isTieBreak).toBe(true);
    expect(state.mode).toBe('points');

    state = { ...state, sets: [state.sets[0], state.sets[1], { teamA: 9, teamB: 8, isTieBreak: true, role: 'OFFICIAL' }] };
    state = scoreLivePoint(state, 'teamA', rules).state;
    expect(state.sets[2]).toMatchObject({ teamA: 10, teamB: 8 });
    expect(isAutomaticLiveMatchComplete(state, rules)).toBe(true);
  });

  it('CLASSIC_AUTOMATIC supports a regular deciding set in either record mode', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
    const splitSets = [
      { teamA: 6, teamB: 4, isTieBreak: false, role: 'OFFICIAL' as const },
      { teamA: 4, teamB: 6, isTieBreak: false, role: 'OFFICIAL' as const },
      { teamA: 0, teamB: 0, isTieBreak: false, role: 'OFFICIAL' as const },
    ];

    let gamesState = {
      ...applyAutomaticRecordMode(createInitialLiveScoringState(rules), rules, 'GAMES').state,
      sets: splitSets,
      activeSetIndex: 2,
    };
    gamesState = applyOptionalDeciderFormat(gamesState, rules, 'REGULAR_SET').state;
    expect(gamesState.optionalDeciderFormat).toBe('REGULAR_SET');
    expect(gamesState.mode).toBe('classic');
    expect(gamesState.sets[2].isTieBreak).toBe(false);
    gamesState = {
      ...gamesState,
      sets: [gamesState.sets[0], gamesState.sets[1], { ...gamesState.sets[2], teamA: 6, teamB: 4 }],
    };
    expect(isAutomaticLiveMatchComplete(gamesState, rules)).toBe(true);

    let pointsState = {
      ...applyAutomaticRecordMode(createInitialLiveScoringState(rules), rules, 'AMERICANO_POINTS').state,
      sets: [
        { ...splitSets[0], teamA: 24, teamB: 18 },
        { ...splitSets[1], teamA: 18, teamB: 24 },
        splitSets[2],
      ],
      activeSetIndex: 2,
    };
    pointsState = applyOptionalDeciderFormat(pointsState, rules, 'REGULAR_SET').state;
    expect(pointsState.mode).toBe('points');
    expect(pointsState.sets[2].isTieBreak).toBe(false);
    pointsState = {
      ...pointsState,
      sets: [pointsState.sets[0], pointsState.sets[1], { ...pointsState.sets[2], teamA: 7, teamB: 5 }],
    };
    expect(isAutomaticLiveMatchComplete(pointsState, rules)).toBe(false);
    pointsState = applyAutomaticOpenEndedSetConfirm(pointsState, rules).state;
    expect(isAutomaticLiveMatchComplete(pointsState, rules)).toBe(true);
  });

  it('CLASSIC_AUTOMATIC restores or infers the selected record mode', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
    const pristine = createInitialLiveScoringState(rules);
    const seeded = seedAutomaticRecordModeOnState(
      pristine,
      rules,
      { automaticRecordMode: 'AMERICANO_POINTS' },
      (meta) => meta?.automaticRecordMode === 'AMERICANO_POINTS' ? 'AMERICANO_POINTS' : 'GAMES',
      'automaticRecordMode',
    );
    expect(seeded.automaticRecordMode).toBe('AMERICANO_POINTS');
    expect(seeded.mode).toBe('points');

    const inferred = parseLiveScoringState(
      {
        mode: 'points',
        sets: [{ teamA: 3, teamB: 1, isTieBreak: false }],
        activeSetIndex: 0,
      },
      rules,
    );
    expect(inferred.automaticRecordMode).toBe('AMERICANO_POINTS');
  });

  it('CLASSIC_AUTOMATIC rejects scoring after the match is complete', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
    const gamesState = {
      ...applyAutomaticRecordMode(createInitialLiveScoringState(rules), rules, 'GAMES').state,
      sets: [
        { teamA: 6, teamB: 4, isTieBreak: false, role: 'OFFICIAL' as const },
        { teamA: 6, teamB: 3, isTieBreak: false, role: 'OFFICIAL' as const },
      ],
      activeSetIndex: 1,
    };

    expect(isAutomaticLiveMatchComplete(gamesState, rules)).toBe(true);
    expect(scoreLivePoint(gamesState, 'teamA', rules).changed).toBe(false);
    expect(unscoreLivePoint(gamesState, 'teamA', rules).changed).toBe(false);
  });

  it('timed partial lock allows advancing an incomplete set', () => {
    const timedRules = {
      ...getRulesFromPreset('CLASSIC_BEST_OF_3'),
      preset: 'CLASSIC_BEST_OF_3' as const,
      allowIncompleteRegularSetGames: true,
      deucesBeforeGoldenPoint: null,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
    };
    let state = createInitialLiveScoringState(timedRules, [{ teamA: 3, teamB: 2, isTieBreak: false }, { teamA: 0, teamB: 0 }]);
    state = freezeTimedClassicSetAtPartialScore(state, timedRules).state;
    expect(state.timedClassicSetLocked).toBe(true);
    const adv = advanceLiveSet(state, timedRules);
    expect(adv.changed).toBe(true);
    expect(adv.state.activeSetIndex).toBe(1);
    expect(adv.state.timedClassicSetLocked).toBeUndefined();
  });
});
