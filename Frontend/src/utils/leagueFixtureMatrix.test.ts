import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  buildPairCellMap,
  buildSigResolveMap,
  gameHasFixturePairTeams,
  matchupKey,
  rosterKeyToSig,
  rowPerspectiveOutcome,
  teamPlayerSig,
  type MatrixTeam,
} from './leagueFixtureMatrix';

function leagueGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    entityType: 'LEAGUE',
    leagueGroupId: 'group-a',
    hasFixedTeams: false,
    fixedTeams: [
      {
        teamNumber: 1,
        players: [{ userId: 'u1' }, { userId: 'u2' }],
      },
      {
        teamNumber: 2,
        players: [{ userId: 'u3' }, { userId: 'u4' }],
      },
    ],
    ...overrides,
  } as Game;
}

const teamA: MatrixTeam = {
  leagueTeamId: 'tid-a',
  participantId: 'p-a',
  sig: teamPlayerSig(['replacement', 'partner']),
  label: 'R / P',
  players: [
    { userId: 'replacement' },
    { userId: 'partner' },
  ],
};

const teamB: MatrixTeam = {
  leagueTeamId: 'tid-b',
  participantId: 'p-b',
  sig: teamPlayerSig(['u3', 'u4']),
  label: 'U3 / U4',
  players: [{ userId: 'u3' }, { userId: 'u4' }],
};

describe('gameHasFixturePairTeams', () => {
  it('returns true when two full fixed teams exist even if hasFixedTeams is false', () => {
    expect(gameHasFixturePairTeams(leagueGame())).toBe(true);
  });

  it('returns false when fixed teams are missing', () => {
    expect(gameHasFixturePairTeams(leagueGame({ fixedTeams: [] }))).toBe(false);
  });
});

describe('buildPairCellMap', () => {
  it('includes games with pair teams when hasFixedTeams flag is false', () => {
    const map = buildPairCellMap(
      [
        {
          roundType: 'REGULAR',
          games: [leagueGame()],
        },
      ] as Parameters<typeof buildPairCellMap>[0],
      'group-a',
    );

    expect(map.size).toBe(1);
    expect(map.get('u1,u2|u3,u4')?.[0]?.id).toBe('game-1');
  });

  it('places historical post-swap fixtures under current franchise matchup keys', () => {
    const resolveMap = buildSigResolveMap([teamA, teamB], [
      { rosterKey: 'injured:partner', leagueTeamId: 'tid-a' },
    ]);
    const pastGame = leagueGame({
      id: 'past-final',
      resultsStatus: 'FINAL',
      hasFixedTeams: true,
      fixedTeams: [
        { teamNumber: 1, players: [{ userId: 'injured' }, { userId: 'partner' }] },
        { teamNumber: 2, players: [{ userId: 'u3' }, { userId: 'u4' }] },
      ],
      outcomes: [
        { userId: 'injured', isWinner: true, wins: 1, losses: 0, ties: 0 },
        { userId: 'partner', isWinner: true, wins: 1, losses: 0, ties: 0 },
        { userId: 'u3', isWinner: false, wins: 0, losses: 1, ties: 0 },
        { userId: 'u4', isWinner: false, wins: 0, losses: 1, ties: 0 },
      ],
    });

    const map = buildPairCellMap(
      [{ roundType: 'REGULAR', games: [pastGame] }] as Parameters<typeof buildPairCellMap>[0],
      'group-a',
      resolveMap,
    );

    const currentKey = matchupKey(teamA.sig, teamB.sig);
    expect(map.get(currentKey)?.[0]?.id).toBe('past-final');
    expect(map.has(matchupKey('injured,partner', 'u3,u4'))).toBe(false);
  });
});

describe('buildSigResolveMap / rowPerspectiveOutcome after swap', () => {
  it('converts colon rosterKey to comma sig', () => {
    expect(rosterKeyToSig('b:a')).toBe('a,b');
  });

  it('resolves historical roster to current franchise and keeps W/L from who played', () => {
    const resolveMap = buildSigResolveMap([teamA, teamB], [
      { rosterKey: 'injured:partner', leagueTeamId: 'tid-a' },
    ]);
    expect(resolveMap.get('injured,partner')).toBe(teamA.sig);

    const pastGame = leagueGame({
      id: 'past-final',
      resultsStatus: 'FINAL',
      fixedTeams: [
        { teamNumber: 1, players: [{ userId: 'injured' }, { userId: 'partner' }] },
        { teamNumber: 2, players: [{ userId: 'u3' }, { userId: 'u4' }] },
      ],
      outcomes: [
        { userId: 'injured', isWinner: true, wins: 1, losses: 0, ties: 0 },
        { userId: 'partner', isWinner: true, wins: 1, losses: 0, ties: 0 },
        { userId: 'u3', isWinner: false, wins: 0, losses: 1, ties: 0 },
        { userId: 'u4', isWinner: false, wins: 0, losses: 1, ties: 0 },
      ],
    });

    expect(rowPerspectiveOutcome(pastGame, teamA.sig, teamB.sig, resolveMap).outcome).toBe('W');
    expect(rowPerspectiveOutcome(pastGame, teamB.sig, teamA.sig, resolveMap).outcome).toBe('L');
  });

  it('prefers a current franchise roster over a conflicting historical alias', () => {
    const recycled: MatrixTeam = {
      leagueTeamId: 'tid-b',
      participantId: 'p-b',
      sig: teamPlayerSig(['injured', 'partner']),
      label: 'I / P',
      players: [{ userId: 'injured' }, { userId: 'partner' }],
    };
    const resolveMap = buildSigResolveMap([teamA, recycled], [
      // Alias claims injured+partner for franchise A, but B currently fields that pair.
      { rosterKey: 'injured:partner', leagueTeamId: 'tid-a' },
    ]);
    expect(resolveMap.get('injured,partner')).toBe(recycled.sig);
    expect(resolveMap.get(teamA.sig)).toBe(teamA.sig);
  });

  it('resolves a chain of historical rosters for the same franchise', () => {
    const resolveMap = buildSigResolveMap([teamA, teamB], [
      { rosterKey: 'v1a:v1b', leagueTeamId: 'tid-a' },
      { rosterKey: 'partner:v2', leagueTeamId: 'tid-a' },
    ]);
    expect(resolveMap.get('v1a,v1b')).toBe(teamA.sig);
    expect(resolveMap.get('partner,v2')).toBe(teamA.sig);
    expect(resolveMap.get(teamA.sig)).toBe(teamA.sig);
  });

  it('ignores aliases for teams outside the current matrix group', () => {
    const resolveMap = buildSigResolveMap([teamB], [
      { rosterKey: 'injured:partner', leagueTeamId: 'tid-a' },
    ]);
    expect(resolveMap.has('injured,partner')).toBe(false);
  });

  it('places games when both franchises were swapped after the fixture', () => {
    const teamC: MatrixTeam = {
      leagueTeamId: 'tid-c',
      participantId: 'p-c',
      sig: teamPlayerSig(['c-new', 'c-stay']),
      label: 'C',
      players: [{ userId: 'c-new' }, { userId: 'c-stay' }],
    };
    const resolveMap = buildSigResolveMap([teamA, teamC], [
      { rosterKey: 'injured:partner', leagueTeamId: 'tid-a' },
      { rosterKey: 'c-old:c-stay', leagueTeamId: 'tid-c' },
    ]);
    const pastGame = leagueGame({
      id: 'both-swapped',
      resultsStatus: 'FINAL',
      hasFixedTeams: true,
      fixedTeams: [
        { teamNumber: 1, players: [{ userId: 'injured' }, { userId: 'partner' }] },
        { teamNumber: 2, players: [{ userId: 'c-old' }, { userId: 'c-stay' }] },
      ],
      outcomes: [
        { userId: 'injured', isWinner: false, wins: 0, losses: 1, ties: 0 },
        { userId: 'partner', isWinner: false, wins: 0, losses: 1, ties: 0 },
        { userId: 'c-old', isWinner: true, wins: 1, losses: 0, ties: 0 },
        { userId: 'c-stay', isWinner: true, wins: 1, losses: 0, ties: 0 },
      ],
    });

    const map = buildPairCellMap(
      [{ roundType: 'REGULAR', games: [pastGame] }] as Parameters<typeof buildPairCellMap>[0],
      'group-a',
      resolveMap,
    );
    expect(map.get(matchupKey(teamA.sig, teamC.sig))?.[0]?.id).toBe('both-swapped');
    expect(rowPerspectiveOutcome(pastGame, teamA.sig, teamC.sig, resolveMap).outcome).toBe('L');
    expect(rowPerspectiveOutcome(pastGame, teamC.sig, teamA.sig, resolveMap).outcome).toBe('W');
  });
});
