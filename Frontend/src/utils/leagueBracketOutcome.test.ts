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
