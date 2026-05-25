import { describe, expect, it } from 'vitest';
import type { BracketPlayoffGroupDto, BracketSlotDto } from '@/api/leagues';
import type { Game } from '@/types';
import { buildBracketPodiumDisplayRows } from './bracketPodiumProgress.util';

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

describe('buildBracketPodiumDisplayRows', () => {
  it('shows resolved champion when championParticipantId is set', () => {
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 2,
      bracketSize: 2,
      byeCount: 0,
      playInGameCount: 0,
      championParticipantId: 'p-a',
      slots: [
        slot({
          id: 'fin',
          slotKey: 'MAIN-R0-M0',
          slotKind: 'MAIN',
          participant: { id: 'p-a', displayName: 'Champion' },
        }),
      ],
    };
    const rows = buildBracketPodiumDisplayRows(group);
    expect(rows).toContainEqual(
      expect.objectContaining({ kind: 'champion', status: 'resolved', participantId: 'p-a' })
    );
  });

  it('shows champion and finalist resolved after final', () => {
    const slots: BracketSlotDto[] = [
      slot({
        id: 'fin',
        slotKey: 'MAIN-R1-M0',
        slotKind: 'MAIN',
        roundIndex: 1,
        feederSlotAId: 'a',
        feederSlotBId: 'b',
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
      slots,
    };
    const rows = buildBracketPodiumDisplayRows(group);
    expect(rows.some((r) => r.kind === 'champion' && r.status === 'in_progress')).toBe(false);

    const withFinal: BracketPlayoffGroupDto = {
      ...group,
      slots: slots.map((s) =>
        s.id === 'fin'
          ? {
              ...s,
              gameId: 'g-final',
              game: finalGame('teamA', 'u-a', 'u-b'),
            }
          : s
      ),
    };
    const finalRows = buildBracketPodiumDisplayRows(withFinal);
    expect(finalRows.some((r) => r.kind === 'champion' && r.status === 'resolved')).toBe(true);
    expect(finalRows.some((r) => r.kind === 'finalist' && r.status === 'resolved')).toBe(true);
  });

  it('returns empty when no podium data', () => {
    const group: BracketPlayoffGroupDto = {
      leagueGroupId: 'g1',
      entrantCount: 4,
      bracketSize: 4,
      byeCount: 0,
      playInGameCount: 0,
      slots: [slot({ id: 'fin', slotKey: 'MAIN-R1-M0', slotKind: 'MAIN', roundIndex: 1 })],
    };
    expect(buildBracketPodiumDisplayRows(group)).toEqual([]);
  });
});
