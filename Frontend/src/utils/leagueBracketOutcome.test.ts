import { describe, expect, it } from 'vitest';
import type { BracketPlayoffGroupDto, BracketSlotDto } from '@/api/leagues';
import type { Game } from '@/types';
import {
  buildBracketPodium,
  buildBracketSlotHighlights,
  bracketHasPodium,
  collectChampionPathSlotIds,
  findFinalMainSlot,
  isPlayInPhaseComplete,
  participantLabel,
  participantLabelFromSlots,
  slotWinnerParticipantId,
} from './leagueBracketOutcome';

function slot(partial: Partial<BracketSlotDto> & Pick<BracketSlotDto, 'id' | 'slotKey' | 'slotKind'>): BracketSlotDto {
  return {
    phaseIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    ...partial,
  };
}

function finalGame(winner: 'teamA' | 'teamB', teamAUserId: string, teamBUserId: string): Game {
  const winsA = winner === 'teamA' ? 2 : 0;
  const winsB = winner === 'teamB' ? 2 : 0;
  return {
    id: 'g-final',
    entityType: 'LEAGUE',
    gameType: 'COMPETITIVE',
    city: { id: 'c', name: 'X', country: 'Y' },
    startTime: '2026-01-01T10:00:00Z',
    endTime: '2026-01-01T12:00:00Z',
    maxParticipants: 4,
    minParticipants: 4,
    isPublic: false,
    affectsRating: false,
    allowDirectJoin: false,
    status: 'ANNOUNCED',
    resultsStatus: 'FINAL',
    participants: [],
    fixedTeams: [
      {
        id: 't1',
        gameId: 'g-final',
        teamNumber: 1,
        players: [{ id: 'p1', gameTeamId: 't1', userId: teamAUserId, user: { id: teamAUserId, firstName: 'A', lastName: 'One' } }],
      },
      {
        id: 't2',
        gameId: 'g-final',
        teamNumber: 2,
        players: [{ id: 'p2', gameTeamId: 't2', userId: teamBUserId, user: { id: teamBUserId, firstName: 'B', lastName: 'Two' } }],
      },
    ],
    outcomes: [
      { id: 'o1', userId: teamAUserId, wins: winsA, user: { id: teamAUserId } },
      { id: 'o2', userId: teamBUserId, wins: winsB, user: { id: teamBUserId } },
    ],
  } as Game;
}

describe('isPlayInPhaseComplete', () => {
  it('returns true when there are no play-in games', () => {
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 8,
      bracketSize: 8,
      byeCount: 0,
      playInGameCount: 0,
      slots: [],
    };
    expect(isPlayInPhaseComplete(group)).toBe(true);
  });

  it('returns false until all play-in games are FINAL', () => {
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 7,
      bracketSize: 8,
      byeCount: 1,
      playInGameCount: 1,
      slots: [
        slot({
          id: 'pi1',
          slotKey: 'PI-0',
          slotKind: 'PLAY_IN',
          gameId: 'g1',
          game: { id: 'g1', resultsStatus: 'NONE' },
        }),
      ],
    };
    expect(isPlayInPhaseComplete(group)).toBe(false);
  });
});

describe('findFinalMainSlot', () => {
  it('picks the MAIN slot with no winnerSlotId at max round', () => {
    const slots: BracketSlotDto[] = [
      slot({ id: 'sf', slotKey: 'MAIN-R1-M0', slotKind: 'MAIN', roundIndex: 1, winnerSlotId: 'fin' }),
      slot({ id: 'fin', slotKey: 'MAIN-R2-M0', slotKind: 'MAIN', roundIndex: 2, winnerSlotId: null }),
    ];
    expect(findFinalMainSlot(slots)?.id).toBe('fin');
  });
});

describe('collectChampionPathSlotIds', () => {
  it('includes final and its feeders', () => {
    const slots: BracketSlotDto[] = [
      slot({ id: 'qf0', slotKey: 'MAIN-R0-M0', slotKind: 'MAIN', roundIndex: 0, winnerSlotId: 'sf' }),
      slot({ id: 'qf1', slotKey: 'MAIN-R0-M1', slotKind: 'MAIN', roundIndex: 0, winnerSlotId: 'sf' }),
      slot({
        id: 'sf',
        slotKey: 'MAIN-R1-M0',
        slotKind: 'MAIN',
        roundIndex: 1,
        feederSlotAId: 'qf0',
        feederSlotBId: 'qf1',
        winnerSlotId: 'fin',
      }),
      slot({
        id: 'fin',
        slotKey: 'MAIN-R2-M0',
        slotKind: 'MAIN',
        roundIndex: 2,
        feederSlotAId: 'sf',
        winnerSlotId: null,
      }),
    ];
    const path = collectChampionPathSlotIds(slots);
    expect(path.has('fin')).toBe(true);
    expect(path.has('sf')).toBe(true);
    expect(path.has('qf0')).toBe(true);
    expect(path.has('qf1')).toBe(true);
  });
});

describe('buildBracketPodium', () => {
  it('derives finalist from final game loser', () => {
    const slots: BracketSlotDto[] = [
      slot({
        id: 'fin',
        slotKey: 'MAIN-R1-M0',
        slotKind: 'MAIN',
        roundIndex: 1,
        feederSlotAId: 'a',
        feederSlotBId: 'b',
        gameId: 'g-final',
        game: finalGame('teamA', 'u-a', 'u-b'),
        participant: { id: 'p-a', displayName: 'Team A' },
      }),
      slot({
        id: 'a',
        slotKey: 'MAIN-R0-M0',
        slotKind: 'MAIN',
        roundIndex: 0,
        participant: { id: 'p-a', displayName: 'Team A' },
        winnerSlotId: 'fin',
      }),
      slot({
        id: 'b',
        slotKey: 'MAIN-R0-M1',
        slotKind: 'MAIN',
        roundIndex: 0,
        participant: { id: 'p-b', displayName: 'Team B' },
        winnerSlotId: 'fin',
      }),
    ];
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 4,
      bracketSize: 4,
      byeCount: 0,
      playInGameCount: 0,
      championParticipantId: 'p-a',
      slots,
    };
    const podium = buildBracketPodium(group);
    expect(podium.championId).toBe('p-a');
    expect(podium.finalistId).toBe('p-b');
  });

  it('uses API championship places for double elimination', () => {
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 8,
      bracketSize: 8,
      byeCount: 0,
      playInGameCount: 0,
      includeDoubleElimination: true,
      championParticipantId: 'lower-champion',
      finalistParticipantId: 'upper-finalist',
      slots: [
        slot({
          id: 'winners-final',
          slotKey: 'MAIN-R2-M0',
          slotKind: 'MAIN',
          roundIndex: 2,
          winnerSlotId: 'gf1',
        }),
        slot({
          id: 'gf1',
          slotKey: 'GRAND-FINAL-M0',
          slotKind: 'GRAND_FINAL',
          winnerSlotId: 'reset',
        }),
        slot({
          id: 'reset',
          slotKey: 'GRAND-FINAL-M1',
          slotKind: 'GRAND_FINAL',
          roundIndex: 1,
        }),
      ],
    };

    expect(buildBracketPodium(group)).toMatchObject({
      championId: 'lower-champion',
      finalistId: 'upper-finalist',
    });
  });

  it('keeps independent finalists for multi-group PER_GROUP trees', () => {
    // Two parallel division finals: each group carries its own API finalist id.
    const groupA: BracketPlayoffGroupDto = {
      leagueGroupId: 'div-a',
      entrantCount: 4,
      bracketSize: 4,
      byeCount: 0,
      playInGameCount: 0,
      championParticipantId: 'a-champ',
      finalistParticipantId: 'a-finalist',
      slots: [
        slot({
          id: 'a-fin',
          slotKey: 'MAIN-R1-M0',
          slotKind: 'MAIN',
          roundIndex: 1,
          winnerSlotId: null,
          feederSlotAId: 'a-sf1',
          feederSlotBId: 'a-sf2',
          game: finalGame('teamA', 'u-ac', 'u-af'),
        }),
      ],
    };
    const groupB: BracketPlayoffGroupDto = {
      leagueGroupId: 'div-b',
      entrantCount: 4,
      bracketSize: 4,
      byeCount: 0,
      playInGameCount: 0,
      championParticipantId: 'b-champ',
      finalistParticipantId: 'b-finalist',
      slots: [
        slot({
          id: 'b-fin',
          slotKey: 'MAIN-R1-M0',
          slotKind: 'MAIN',
          roundIndex: 1,
          winnerSlotId: null,
          feederSlotAId: 'b-sf1',
          feederSlotBId: 'b-sf2',
          game: finalGame('teamB', 'u-bf', 'u-bc'),
        }),
      ],
    };

    expect(buildBracketPodium(groupA)).toMatchObject({
      championId: 'a-champ',
      finalistId: 'a-finalist',
    });
    expect(buildBracketPodium(groupB)).toMatchObject({
      championId: 'b-champ',
      finalistId: 'b-finalist',
    });
  });

  it('derives CROSS_GROUP / season-wide finalist from final-game sides when API finalist is absent', () => {
    // Season-wide tree uses leagueGroupId null (CROSS_GROUP response shape).
    const slots: BracketSlotDto[] = [
      slot({
        id: 'seed-a',
        slotKey: 'seed-a',
        slotKind: 'BYE',
        participant: { id: 'p-champ', displayName: 'Champ' },
        winnerSlotId: 'fin',
      }),
      slot({
        id: 'seed-b',
        slotKey: 'seed-b',
        slotKind: 'BYE',
        participant: { id: 'p-finalist', displayName: 'Finalist' },
        winnerSlotId: 'fin',
      }),
      slot({
        id: 'fin',
        slotKey: 'MAIN-R0-M0',
        slotKind: 'MAIN',
        roundIndex: 0,
        winnerSlotId: null,
        feederSlotAId: 'seed-a',
        feederSlotBId: 'seed-b',
        gameId: 'g-final',
        game: finalGame('teamA', 'u-a', 'u-b'),
      }),
    ];
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: null,
      entrantCount: 2,
      bracketSize: 2,
      byeCount: 0,
      playInGameCount: 0,
      championParticipantId: 'p-champ',
      // no finalistParticipantId — must come from final loser side
      slots,
    };
    expect(buildBracketPodium(group)).toMatchObject({
      championId: 'p-champ',
      finalistId: 'p-finalist',
    });
  });
});

describe('slotWinnerParticipantId', () => {
  it('reads BYE participant', () => {
    const slots = [
      slot({
        id: 'bye',
        slotKey: 'BYE-0',
        slotKind: 'BYE',
        leagueParticipantId: 'p1',
        participant: { id: 'p1', displayName: 'Seed 1' },
      }),
    ];
    expect(slotWinnerParticipantId(slots[0], new Map(slots.map((s) => [s.id, s])))).toBe('p1');
  });

  it('ignores a cached participant on an unresolved non-BYE match', () => {
    const unresolved = slot({
      id: 'semi',
      slotKey: 'MAIN-R1-M0',
      slotKind: 'MAIN',
      leagueParticipantId: 'cached-quarterfinal-winner',
      gameId: null,
      game: null,
    });
    expect(slotWinnerParticipantId(unresolved, new Map([[unresolved.id, unresolved]]))).toBeNull();
  });
});

describe('buildBracketSlotHighlights', () => {
  it('marks winner and loser on completed slots outside champion path', () => {
    const slots: BracketSlotDto[] = [
      slot({
        id: 'qf0',
        slotKey: 'MAIN-R0-M0',
        slotKind: 'MAIN',
        roundIndex: 0,
        feederSlotAId: 'a',
        feederSlotBId: 'b',
        gameId: 'g-qf',
        game: finalGame('teamA', 'u-a', 'u-b'),
      }),
      slot({
        id: 'a',
        slotKey: 'MAIN-R0-M0-A',
        slotKind: 'MAIN',
        roundIndex: -1,
        participant: { id: 'p-a', displayName: 'Team A' },
      }),
      slot({
        id: 'b',
        slotKey: 'MAIN-R0-M0-B',
        slotKind: 'MAIN',
        roundIndex: -1,
        participant: { id: 'p-b', displayName: 'Team B' },
      }),
      slot({
        id: 'fin',
        slotKey: 'MAIN-R1-M0',
        slotKind: 'MAIN',
        roundIndex: 1,
        winnerSlotId: null,
      }),
    ];
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 4,
      bracketSize: 4,
      byeCount: 0,
      playInGameCount: 0,
      slots,
    };
    const highlights = buildBracketSlotHighlights(group);
    const qf = highlights.get('qf0');
    expect(qf?.winnerSide).toBe('A');
    expect(qf?.loserSide).toBe('B');
    expect(qf?.onChampionPath).toBe(false);
  });

  it('highlights only the champion feeder route', () => {
    const participants = ['a', 'b', 'c', 'd'].map((id) =>
      slot({
        id,
        slotKey: `seed-${id}`,
        slotKind: 'BYE',
        participant: { id: `p-${id}`, displayName: id },
      })
    );
    const sfA = slot({
      id: 'sf-a',
      slotKey: 'MAIN-R0-M0',
      slotKind: 'MAIN',
      feederSlotAId: 'a',
      feederSlotBId: 'b',
      game: finalGame('teamA', 'u-a', 'u-b'),
      winnerSlotId: 'final',
    });
    const sfB = slot({
      id: 'sf-b',
      slotKey: 'MAIN-R0-M1',
      slotKind: 'MAIN',
      matchIndex: 1,
      feederSlotAId: 'c',
      feederSlotBId: 'd',
      game: finalGame('teamA', 'u-c', 'u-d'),
      winnerSlotId: 'final',
    });
    const final = slot({
      id: 'final',
      slotKey: 'MAIN-R1-M0',
      slotKind: 'MAIN',
      roundIndex: 1,
      feederSlotAId: 'sf-a',
      feederSlotBId: 'sf-b',
      game: finalGame('teamA', 'u-a', 'u-c'),
    });
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 4,
      bracketSize: 4,
      byeCount: 0,
      playInGameCount: 0,
      championParticipantId: 'p-a',
      finalistParticipantId: 'p-c',
      slots: [...participants, sfA, sfB, final],
    };

    const highlights = buildBracketSlotHighlights(group);
    expect(highlights.get('final')?.onChampionPath).toBe(true);
    expect(highlights.get('sf-a')?.onChampionPath).toBe(true);
    expect(highlights.get('a')?.onChampionPath).toBe(true);
    expect(highlights.get('sf-b')?.onChampionPath).toBe(false);
    expect(highlights.get('c')?.onChampionPath).toBe(false);
  });
});

describe('bracketHasPodium', () => {
  it('returns true when champion is known', () => {
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 2,
      bracketSize: 2,
      byeCount: 0,
      playInGameCount: 0,
      championParticipantId: 'p1',
      slots: [],
    };
    expect(bracketHasPodium(group)).toBe(true);
  });

  it('returns false when bracket is still open', () => {
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 4,
      bracketSize: 4,
      byeCount: 0,
      playInGameCount: 0,
      slots: [slot({ id: 'fin', slotKey: 'MAIN-R1-M0', slotKind: 'MAIN', roundIndex: 1 })],
    };
    expect(bracketHasPodium(group)).toBe(false);
  });
});

describe('participantLabelFromSlots (stale slot cache resilience)', () => {
  const player = (id: string, first: string, last: string) => ({
    id: `${id}-p`,
    userId: id,
    user: { id, firstName: first, lastName: last },
  });

  it('resolves a label from a slot participant when present', () => {
    const slots: BracketSlotDto[] = [
      slot({
        id: 's1',
        slotKey: 'MAIN-R2-M0',
        slotKind: 'MAIN',
        roundIndex: 2,
        participant: { id: 'champ', leagueTeam: { id: 'lt1', players: [player('u1', 'Ada', 'Lovelace')] } },
      }),
    ];
    expect(participantLabelFromSlots('champ', slots)).toBe('Ada Lovelace');
  });

  it('falls back to the resolved participant object when no slot carries the id (stale cache)', () => {
    // Champion id 'champ' is NOT attached to any slot (stale slot cache), but the
    // backend provides a resolved champion participant object.
    const slots: BracketSlotDto[] = [
      slot({
        id: 's1',
        slotKey: 'MAIN-R2-M0',
        slotKind: 'MAIN',
        roundIndex: 2,
        participant: { id: 'loser', leagueTeam: { id: 'lt2', players: [player('u2', 'Bob', 'Hope')] } },
      }),
    ];
    const resolved = { id: 'champ', leagueTeam: { id: 'lt1', players: [player('u1', 'Ada', 'Lovelace')] } };
    expect(participantLabelFromSlots('champ', slots, resolved)).toBe('Ada Lovelace');
    // Without the resolved object it would be empty (the original bug).
    expect(participantLabelFromSlots('champ', slots)).toBe('');
  });

  it('prefers displayName when present', () => {
    expect(participantLabel({ id: 'x', displayName: 'Team Rocket' })).toBe('Team Rocket');
  });
});
