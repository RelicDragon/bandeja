import { describe, expect, it } from 'vitest';
import {
  formatSignedDelta,
  resolveLeagueStandingsColumns,
  standingsScoreUnitDelta,
} from './leagueStandingsColumns';

describe('resolveLeagueStandingsColumns', () => {
  it('fixed teams + classic → Games (no Sets on main table)', () => {
    expect(
      resolveLeagueStandingsColumns({ hasFixedTeams: true, playersPerMatch: 4, ballsInGames: true })
    ).toEqual({
      showPoints: false,
      showSets: false,
      showGames: true,
      showBalls: false,
    });
  });

  it('fixed teams + simple points → Balls (no Sets on main table)', () => {
    expect(
      resolveLeagueStandingsColumns({ hasFixedTeams: true, playersPerMatch: 4, ballsInGames: false })
    ).toEqual({
      showPoints: false,
      showSets: false,
      showGames: false,
      showBalls: true,
    });
  });

  it('1v1 + classic → Games (same H2H mode, no Sets on main table)', () => {
    expect(
      resolveLeagueStandingsColumns({ hasFixedTeams: false, playersPerMatch: 2, ballsInGames: true })
    ).toEqual({
      showPoints: false,
      showSets: false,
      showGames: true,
      showBalls: false,
    });
  });

  it('rotating 2v2 + classic → Points + Games', () => {
    expect(
      resolveLeagueStandingsColumns({ hasFixedTeams: false, playersPerMatch: 4, ballsInGames: true })
    ).toEqual({
      showPoints: true,
      showSets: false,
      showGames: true,
      showBalls: false,
    });
  });

  it('rotating + simple → Points + Balls', () => {
    expect(
      resolveLeagueStandingsColumns({ hasFixedTeams: false, playersPerMatch: 4, ballsInGames: false })
    ).toEqual({
      showPoints: true,
      showSets: false,
      showGames: false,
      showBalls: true,
    });
  });
});

describe('formatSignedDelta', () => {
  it('formats signed values', () => {
    expect(formatSignedDelta(3)).toBe('+3');
    expect(formatSignedDelta(0)).toBe('0');
    expect(formatSignedDelta(-2)).toBe('-2');
  });
});

describe('standingsScoreUnitDelta', () => {
  it('prefers fixture gameDelta when present including 0', () => {
    expect(standingsScoreUnitDelta({ gameDelta: 0, scoreDelta: 9 })).toBe(0);
    expect(standingsScoreUnitDelta({ gameDelta: 5, scoreDelta: 9 })).toBe(5);
  });

  it('falls back to scoreDelta when gameDelta missing', () => {
    expect(standingsScoreUnitDelta({ scoreDelta: 9 })).toBe(9);
    expect(standingsScoreUnitDelta({ gameDelta: null, scoreDelta: 9 })).toBe(9);
  });
});
