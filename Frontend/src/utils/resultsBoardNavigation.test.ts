import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import type { Match, Round } from '@/types/gameResults';
import { getRules } from '@/utils/scoring';
import {
  autoFillLineup,
  canAdvanceAfterSave,
  findNextScoreTarget,
  getRestingPlayerIds,
  hasOtherMatchToScore,
  matchOutcomeAfterSet,
  moveToOtherTeam,
  nextEntrySetIndex,
  pickInitialExpandedRoundIds,
  resolveLineupTargetTeam,
  restoreRemovedPlayer,
  summarizeResultsProgress,
  swapPlayersInRound,
} from './resultsBoardNavigation';

const americano = getRules({ sport: Sports.PADEL, scoringPreset: 'POINTS_21' } as never);
const bestOf3 = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_BEST_OF_3' } as never);
const automatic = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);

const match = (id: string, teamA: string[], teamB: string[], sets: Match['sets'] = [{ teamA: 0, teamB: 0 }]): Match => ({
  id,
  teamA,
  teamB,
  sets,
});

describe('score entry navigation', () => {
  it('skips scored and incomplete matches and wraps to earlier rounds', () => {
    const rounds: Round[] = [
      { id: 'r1', matches: [match('m1', ['a', 'b'], ['c', 'd'])] },
      {
        id: 'r2',
        matches: [
          match('m2', ['a', 'c'], ['b', 'd'], [{ teamA: 12, teamB: 9 }]),
          match('m3', ['a'], ['b']),
        ],
      },
    ];
    expect(findNextScoreTarget(rounds, americano, 2, { matchId: 'm2' })).toEqual({
      roundId: 'r1',
      matchId: 'm1',
      setIndex: 0,
    });
  });

  it('continues inside a best-of-three match before moving on', () => {
    const rounds: Round[] = [
      {
        id: 'r1',
        matches: [
          match('m1', ['a', 'b'], ['c', 'd'], [{ teamA: 6, teamB: 4 }]),
          match('m2', ['e', 'f'], ['g', 'h']),
        ],
      },
    ];
    expect(nextEntrySetIndex(rounds[0].matches[0], bestOf3)).toBe(1);
    expect(findNextScoreTarget(rounds, bestOf3, 2, { matchId: 'm1' })).toEqual({
      roundId: 'r1',
      matchId: 'm1',
      setIndex: 1,
    });
  });

  it('offers save-and-next only when something can follow', () => {
    const single: Round[] = [{ id: 'r1', matches: [match('m1', ['a', 'b'], ['c', 'd'])] }];
    expect(canAdvanceAfterSave(single, americano, 2, 'm1')).toBe(false);
    expect(canAdvanceAfterSave(single, bestOf3, 2, 'm1')).toBe(true);
    expect(hasOtherMatchToScore(single, bestOf3, 2, 'm1')).toBe(false);
  });

  it('knows when the score being entered ends the match', () => {
    const won = [{ teamA: 6, teamB: 4 }];
    expect(matchOutcomeAfterSet([{ teamA: 0, teamB: 0 }], 0, { teamA: 6, teamB: 4 }, bestOf3)).toBeNull();
    expect(matchOutcomeAfterSet(won, 1, { teamA: 6, teamB: 4 }, bestOf3)).toBe('A');
    expect(matchOutcomeAfterSet(won, 1, { teamA: 4, teamB: 6 }, bestOf3)).toBeNull();
    expect(
      matchOutcomeAfterSet([{ teamA: 6, teamB: 4 }, { teamA: 4, teamB: 6 }], 2, { teamA: 3, teamB: 6 }, bestOf3),
    ).toBe('B');
    expect(matchOutcomeAfterSet([{ teamA: 0, teamB: 0 }], 0, { teamA: 12, teamB: 9 }, americano)).toBe('A');
    expect(matchOutcomeAfterSet(won, 1, { teamA: 6, teamB: 4 }, automatic)).toBeNull();
  });

  it('opens the first round that still has open matches', () => {
    const rounds: Round[] = [
      { id: 'r1', matches: [match('m1', ['a', 'b'], ['c', 'd'], [{ teamA: 11, teamB: 10 }])] },
      { id: 'r2', matches: [match('m2', ['a', 'c'], ['b', 'd'])] },
      { id: 'r3', matches: [match('m3', ['a', 'd'], ['b', 'c'])] },
    ];
    expect(pickInitialExpandedRoundIds(rounds, americano)).toEqual(['r2']);
  });
});

describe('results progress', () => {
  it('counts finished, unscored, incomplete and tied matches', () => {
    const rounds: Round[] = [
      {
        id: 'r1',
        matches: [
          match('m1', ['a', 'b'], ['c', 'd'], [{ teamA: 12, teamB: 9 }]),
          match('m2', ['e', 'f'], ['g', 'h']),
          match('m3', ['e'], []),
        ],
      },
    ];
    const summary = summarizeResultsProgress(rounds, americano, 2);
    expect(summary.total).toBe(3);
    expect(summary.finished).toBe(1);
    expect(summary.unscored.map((ref) => ref.matchId)).toEqual(['m2']);
    expect(summary.incompleteLineups.map((ref) => [ref.roundNumber, ref.matchNumber])).toEqual([[1, 3]]);
  });

  it('lists resting players only once someone has been placed', () => {
    expect(getRestingPlayerIds({ matches: [match('m1', [], [])] }, ['a', 'b'])).toEqual([]);
    expect(getRestingPlayerIds({ matches: [match('m1', ['a'], [])] }, ['a', 'b', 'c'])).toEqual(['b', 'c']);
  });
});

describe('lineup edits', () => {
  it('targets the preferred side while it has room', () => {
    const m = match('m1', ['a', 'b'], ['c']);
    expect(resolveLineupTargetTeam(m, 'teamA', 2)).toBe('teamB');
    expect(resolveLineupTargetTeam(m, 'teamB', 2)).toBe('teamB');
    expect(resolveLineupTargetTeam(match('m2', ['a', 'b'], ['c', 'd']), null, 2)).toBeNull();
  });

  it('moves a player to the other side only when there is room', () => {
    expect(moveToOtherTeam(match('m1', ['a', 'b'], ['c']), 'teamA', 'a', 2)).toEqual({
      matchId: 'm1',
      teamA: ['b'],
      teamB: ['c', 'a'],
    });
    expect(moveToOtherTeam(match('m1', ['a', 'b'], ['c', 'd']), 'teamA', 'a', 2)).toBeNull();
  });

  it('swaps seats inside a match, across matches, and with a resting player', () => {
    const round = {
      matches: [match('m1', ['a', 'b'], ['c', 'd']), match('m2', ['e', 'f'], ['g', 'h'])],
    };
    expect(swapPlayersInRound(round, { matchId: 'm1', team: 'teamA', playerId: 'b' }, 'c')).toEqual([
      { matchId: 'm1', teamA: ['a', 'c'], teamB: ['b', 'd'] },
    ]);
    expect(swapPlayersInRound(round, { matchId: 'm1', team: 'teamA', playerId: 'a' }, 'h')).toEqual([
      { matchId: 'm1', teamA: ['h', 'b'], teamB: ['c', 'd'] },
      { matchId: 'm2', teamA: ['e', 'f'], teamB: ['g', 'a'] },
    ]);
    expect(swapPlayersInRound(round, { matchId: 'm1', team: 'teamB', playerId: 'd' }, 'z')).toEqual([
      { matchId: 'm1', teamA: ['a', 'b'], teamB: ['c', 'z'] },
    ]);
    expect(swapPlayersInRound(round, { matchId: 'm1', team: 'teamA', playerId: 'a' }, 'b')).toEqual([]);
  });

  it('auto-fills open seats in roster order, preferred side first', () => {
    expect(autoFillLineup(match('m1', ['a'], []), ['a', 'x', 'y', 'z'], 2, 'teamB')).toEqual({
      matchId: 'm1',
      teamA: ['a', 'z'],
      teamB: ['x', 'y'],
    });
    expect(autoFillLineup(match('m1', ['a', 'b'], ['c', 'd']), ['x'], 2)).toBeNull();
  });

  it('restores a removed player to the old seat unless they were placed again', () => {
    const seat = { matchId: 'm1', team: 'teamA' as const, index: 0, playerId: 'a' };
    expect(restoreRemovedPlayer({ matches: [match('m1', ['b'], ['c', 'd'])] }, seat, 2)).toEqual({
      matchId: 'm1',
      teamA: ['a', 'b'],
      teamB: ['c', 'd'],
    });
    expect(
      restoreRemovedPlayer({ matches: [match('m1', ['b'], ['c', 'd']), match('m2', ['a'], [])] }, seat, 2),
    ).toBeNull();
  });
});
