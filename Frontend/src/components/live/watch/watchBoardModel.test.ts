import { describe, expect, it } from 'vitest';
import type { LiveScoringClassicState, LiveScoringState } from '@/utils/liveScoring';
import { getRules } from '@/utils/scoring';
import { watchBoardModel } from './watchBoardModel';

const classic = (extra: Partial<LiveScoringClassicState> = {}): LiveScoringClassicState => ({
  pointState: { kind: 'regular', teamA: 30, teamB: 15 },
  withinSetTieBreak: false,
  tieBreakA: 0,
  tieBreakB: 0,
  classicPointsPlayedInGame: 3,
  deuceCount: 0,
  ...extra,
});

const state = (extra: Partial<LiveScoringState> = {}): LiveScoringState => ({
  activeSetIndex: 1,
  mode: 'classic',
  sets: [
    { teamA: 6, teamB: 4 },
    { teamA: 3, teamB: 2 },
  ],
  classic: classic(),
  ...extra,
});

const rules = getRules(null);

describe('watchBoardModel', () => {
  it('lists every set up to the running one and marks it active', () => {
    const model = watchBoardModel(state(), rules, false);
    expect(model.sets.map((s) => [s.teamA, s.teamB, s.active])).toEqual([
      [6, 4, false],
      [3, 2, true],
    ]);
    expect(model.activeLabel).toEqual({ kind: 'REGULAR', setOneBased: 2 });
  });

  it('gives the game points and the side ahead inside the game', () => {
    const model = watchBoardModel(state(), rules, false);
    expect(model.points).toEqual({ teamA: '30', teamB: '15' });
    expect(model.pointLeader).toBe('teamA');
    expect(model.status).toBeNull();
  });

  it('calls level at 40 a deuce with nobody ahead', () => {
    const model = watchBoardModel(
      state({ classic: classic({ pointState: { kind: 'regular', teamA: 40, teamB: 40 } }) }),
      rules,
      false,
    );
    expect(model.status).toBe('deuce');
    expect(model.pointLeader).toBeNull();
  });

  it('turns deuce into golden point once the configured deuces have been played', () => {
    const model = watchBoardModel(
      state({ classic: classic({ pointState: { kind: 'regular', teamA: 40, teamB: 40 }, deuceCount: 1 }) }),
      { ...rules, deucesBeforeGoldenPoint: 1 },
      false,
    );
    expect(model.status).toBe('goldenPoint');
  });

  it('shows advantage as AD on the side that has it', () => {
    const model = watchBoardModel(
      state({ classic: classic({ pointState: { kind: 'advantage', side: 'teamB' } }) }),
      rules,
      false,
    );
    expect(model.points).toEqual({ teamA: '40', teamB: 'AD' });
    expect(model.pointLeader).toBe('teamB');
    expect(model.status).toBe('advantage');
  });

  it('shows tie-break points inside a set tie-break', () => {
    const model = watchBoardModel(
      state({
        sets: [
          { teamA: 6, teamB: 4 },
          { teamA: 6, teamB: 6 },
        ],
        classic: classic({ withinSetTieBreak: true, tieBreakA: 4, tieBreakB: 5 }),
      }),
      rules,
      false,
    );
    expect(model.points).toEqual({ teamA: '4', teamB: '5' });
    expect(model.pointLeader).toBe('teamB');
    expect(model.status).toBe('tieBreak');
    expect(model.inTieBreak).toBe(true);
  });

  it('has no game points in points mode', () => {
    const model = watchBoardModel(
      { activeSetIndex: 0, mode: 'points', sets: [{ teamA: 14, teamB: 11 }] },
      rules,
      false,
    );
    expect(model.points).toBeNull();
    expect(model.status).toBeNull();
  });

  it('drops the running game and names the winner once the match is decided', () => {
    const model = watchBoardModel(
      state({
        sets: [
          { teamA: 6, teamB: 4 },
          { teamA: 6, teamB: 3 },
        ],
      }),
      rules,
      true,
    );
    expect(model.points).toBeNull();
    expect(model.pointLeader).toBeNull();
    expect(model.sets.every((s) => !s.active)).toBe(true);
    expect(model.winner).toBe('teamA');
  });
});
