import { describe, expect, it } from 'vitest';
import {
  capPlayerIds,
  maxFixedTeamSlots,
  maxPlayersPerTeamForGame,
  playersPerMatchOf,
  playersPerTeamOf,
  syncPlayersPerMatchOnRosterChange,
  syncRosterOnSportChange,
  teamSideSlotsFull,
} from './matchFormat';

const PARITY_CASES = [
  {
    label: 'singles 2-roster',
    game: { maxParticipants: 2, playersPerMatch: 2, sport: 'PADEL' },
    playersPerMatch: 2,
    playersPerTeam: 1,
    maxFixedTeamSlots: 2,
    maxPlayersPerTeam: 1,
  },
  {
    label: 'doubles 4-roster',
    game: { maxParticipants: 4, playersPerMatch: 4, sport: 'PADEL' },
    playersPerMatch: 4,
    playersPerTeam: 2,
    maxFixedTeamSlots: 2,
    maxPlayersPerTeam: 2,
  },
  {
    label: '8-player singles rotation',
    game: { maxParticipants: 8, playersPerMatch: 2, sport: 'TENNIS' },
    playersPerMatch: 2,
    playersPerTeam: 1,
    maxFixedTeamSlots: 8,
    maxPlayersPerTeam: 1,
  },
  {
    label: 'padel sport default doubles',
    game: { maxParticipants: 4, sport: 'PADEL' },
    playersPerMatch: 4,
    playersPerTeam: 2,
    maxFixedTeamSlots: 2,
    maxPlayersPerTeam: 2,
  },
] as const;

describe('matchFormat parity table', () => {
  for (const c of PARITY_CASES) {
    it(c.label, () => {
      expect(playersPerMatchOf(c.game)).toBe(c.playersPerMatch);
      expect(playersPerTeamOf(c.game)).toBe(c.playersPerTeam);
      expect(maxFixedTeamSlots(c.game)).toBe(c.maxFixedTeamSlots);
      expect(maxPlayersPerTeamForGame(c.game, c.game.maxParticipants)).toBe(c.maxPlayersPerTeam);
    });
  }

  it('falls back to roster size 2 for singles display cap', () => {
    expect(maxPlayersPerTeamForGame({ sport: 'PADEL' }, 2)).toBe(1);
    expect(maxPlayersPerTeamForGame({ sport: 'PADEL' }, 4)).toBe(2);
  });
});

describe('maxPlayersPerTeamForGame', () => {
  it('uses playersPerMatch when set', () => {
    expect(maxPlayersPerTeamForGame({ playersPerMatch: 2 }, 4)).toBe(1);
    expect(maxPlayersPerTeamForGame({ playersPerMatch: 4 }, 2)).toBe(2);
  });
});

describe('syncRosterOnSportChange', () => {
  it('forces padel doubles when switching from singles 2-roster', () => {
    expect(syncRosterOnSportChange(2, 2, 4, 4)).toEqual({
      maxParticipants: 4,
      playersPerMatch: 4,
      resetFixedTeams: true,
    });
  });

  it('forces tennis singles when switching from doubles 4-roster', () => {
    expect(syncRosterOnSportChange(4, 4, 2, 4)).toEqual({
      maxParticipants: 2,
      playersPerMatch: 2,
      resetFixedTeams: true,
    });
  });

  it('promotes singles roster to doubles when target sport defaults to doubles', () => {
    expect(syncRosterOnSportChange(4, 2, 4, 4)).toEqual({
      maxParticipants: 4,
      playersPerMatch: 4,
      resetFixedTeams: true,
    });
    expect(syncRosterOnSportChange(8, 2, 4, 4)).toEqual({
      maxParticipants: 8,
      playersPerMatch: 4,
      resetFixedTeams: true,
    });
  });

  it('does not change roster when already on target match format', () => {
    expect(syncRosterOnSportChange(4, 4, 4, 4)).toBeNull();
    expect(syncRosterOnSportChange(8, 4, 2, 4)).toBeNull();
  });

  it('does not change roster when target sport defaults to singles and roster is already singles', () => {
    expect(syncRosterOnSportChange(2, 2, 2, 4)).toBeNull();
  });
});

describe('syncPlayersPerMatchOnRosterChange', () => {
  it('forces 1v1 when roster is 2', () => {
    expect(syncPlayersPerMatchOnRosterChange(4, 2, 4, [2, 4])).toEqual({
      playersPerMatch: 2,
      resetFixedTeams: true,
    });
  });

  it('restores sport default when roster goes from 2 to 4+', () => {
    expect(syncPlayersPerMatchOnRosterChange(2, 4, 4, [2, 4])).toEqual({
      playersPerMatch: 4,
      resetFixedTeams: false,
    });
    expect(syncPlayersPerMatchOnRosterChange(2, 8, 2, [2, 4])).toEqual({
      playersPerMatch: 2,
      resetFixedTeams: false,
    });
  });

  it('does not change match format when roster stays 4+', () => {
    expect(syncPlayersPerMatchOnRosterChange(4, 6, 4, [2, 4])).toBeNull();
    expect(syncPlayersPerMatchOnRosterChange(8, 4, 4, [2, 4])).toBeNull();
  });
});

describe('teamSideSlotsFull', () => {
  it('checks slot indices not raw length', () => {
    expect(
      teamSideSlotsFull({ teamA: ['a', 'b', 'stale'], teamB: [] }, 'teamA', 2),
    ).toBe(true);
    expect(teamSideSlotsFull({ teamA: ['a'], teamB: [] }, 'teamA', 2)).toBe(false);
    expect(teamSideSlotsFull({ teamA: ['a'], teamB: [] }, 'teamA', 1)).toBe(true);
  });
});

describe('capPlayerIds', () => {
  it('slices to max per team', () => {
    expect(capPlayerIds(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
    expect(capPlayerIds(['a'], 2)).toEqual(['a']);
  });
});
