import { describe, expect, it } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import goldenFixtures from './fixtures/golden.json';
import {
  advanceLiveSet,
  cancelPendingGameWin,
  confirmPendingGameWin,
  createInitialLiveScoringState,
  scoreLivePoint,
  unscoreLivePoint,
} from './core';

const classicRules = {
  ...getRulesFromPreset('CLASSIC_BEST_OF_3'),
  preset: 'CLASSIC_BEST_OF_3' as const,
  hasGoldenPoint: false,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const pointsRules = {
  ...getRulesFromPreset('POINTS_16'),
  preset: 'POINTS_16' as const,
  hasGoldenPoint: false,
  allowDrawPerSet: true,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

const play = (side: 'teamA' | 'teamB', times: number, start = createInitialLiveScoringState(classicRules)) => {
  let state = start;
  for (let i = 0; i < times; i += 1) {
    const result = scoreLivePoint(state, side, classicRules, { confirmGameWin: true });
    state = result.state;
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

  it('requires confirmation before awarding a normal game', () => {
    let state = play('teamA', 3);
    const pending = scoreLivePoint(state, 'teamA', classicRules);

    expect(pending.needsGameWinConfirm).toBe('teamA');
    expect(pending.state.classic?.pendingGameWinConfirmSide).toBe('teamA');
    expect(pending.state.sets[0]).toMatchObject({ teamA: 0, teamB: 0 });

    state = cancelPendingGameWin(pending.state).state;
    expect(state.classic?.pendingGameWinConfirmSide).toBeUndefined();

    state = scoreLivePoint(state, 'teamA', classicRules).state;
    state = confirmPendingGameWin(state, classicRules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 1, teamB: 0 });
    expect(state.classic?.pointState).toEqual({ kind: 'regular', teamA: 0, teamB: 0 });
  });

  it('handles deuce and advantage game confirmation', () => {
    let state = createInitialLiveScoringState(classicRules);
    state = play('teamA', 3, state);
    state = play('teamB', 3, state);
    state = scoreLivePoint(state, 'teamA', classicRules).state;

    expect(state.classic?.pointState).toEqual({ kind: 'advantage', side: 'teamA' });

    const pending = scoreLivePoint(state, 'teamA', classicRules);
    expect(pending.needsGameWinConfirm).toBe('teamA');

    state = confirmPendingGameWin(pending.state, classicRules).state;
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
    expect(state.classic?.withinSetTieBreak).toBe(false);
    expect(state.classic?.tieBreakA).toBe(0);
  });

  it('advances to the next set after a completed set', () => {
    let state = createInitialLiveScoringState(classicRules, [{ teamA: 6, teamB: 4 }, { teamA: 0, teamB: 0 }]);
    state = advanceLiveSet(state, classicRules).state;

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

  it.each(goldenFixtures)('matches golden fixture: $name', (fixture) => {
    let state = createInitialLiveScoringState(classicRules, fixture.initialSets);
    for (const side of fixture.actions) {
      state = scoreLivePoint(state, side as 'teamA' | 'teamB', classicRules, { confirmGameWin: true }).state;
    }

    expect(state.sets).toMatchObject(fixture.expected.sets);
    expect(state.classic).toMatchObject(fixture.expected.classic);
  });
});
