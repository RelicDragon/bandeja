import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import type { Game } from '@/types';
import { resolveFeederParticipant, slotsById } from './leagueBracketLayout';

function slot(partial: Partial<BracketSlotDto> & Pick<BracketSlotDto, 'id' | 'slotKind'>): BracketSlotDto {
  return {
    slotKey: partial.id,
    phaseIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    ...partial,
  };
}

function finalGame(winner: 'teamA' | 'teamB', _participantAId: string, _participantBId: string): Game {
  const teamAUser = winner === 'teamA' ? 'u-win' : 'u-lose';
  const teamBUser = winner === 'teamB' ? 'u-win' : 'u-lose';
  return {
    id: 'g',
    resultsStatus: 'FINAL',
    fixedTeams: [
      { teamNumber: 1, players: [{ user: { id: teamAUser } }] },
      { teamNumber: 2, players: [{ user: { id: teamBUser } }] },
    ],
    outcomes: [
      { user: { id: teamAUser }, wins: winner === 'teamA' ? 2 : 0 },
      { user: { id: teamBUser }, wins: winner === 'teamB' ? 2 : 0 },
    ],
  } as Game;
}

describe('resolveFeederParticipant', () => {
  it('does not leak an SF waiting participant into the Final', () => {
    const winner = { id: 'p-win', displayName: 'QF Winner' };
    const loser = { id: 'p-lose', displayName: 'QF Loser' };
    const slots: BracketSlotDto[] = [
      slot({
        id: 'qf2',
        slotKind: 'MAIN',
        roundIndex: 0,
        matchIndex: 2,
        winnerSlotId: 'sf1',
        gameId: 'g-qf2',
        game: finalGame('teamA', 'p-win', 'p-lose'),
        participant: winner,
      }),
      slot({
        id: 'qf3',
        slotKind: 'MAIN',
        roundIndex: 0,
        matchIndex: 3,
        winnerSlotId: 'sf1',
        participant: loser,
      }),
      slot({
        id: 'sf1',
        slotKind: 'MAIN',
        roundIndex: 1,
        matchIndex: 1,
        feederSlotAId: 'qf2',
        feederSlotBId: 'qf3',
        winnerSlotId: 'fin',
        leagueParticipantId: 'p-win',
        participant: winner,
      }),
      slot({
        id: 'sf0',
        slotKind: 'MAIN',
        roundIndex: 1,
        matchIndex: 0,
        feederSlotAId: 'qf0',
        feederSlotBId: 'qf1',
        winnerSlotId: 'fin',
      }),
      slot({
        id: 'qf0',
        slotKind: 'MAIN',
        roundIndex: 0,
        matchIndex: 0,
        winnerSlotId: 'sf0',
      }),
      slot({
        id: 'qf1',
        slotKind: 'MAIN',
        roundIndex: 0,
        matchIndex: 1,
        winnerSlotId: 'sf0',
      }),
      slot({
        id: 'fin',
        slotKind: 'MAIN',
        roundIndex: 2,
        matchIndex: 0,
        feederSlotAId: 'sf0',
        feederSlotBId: 'sf1',
      }),
    ];
    const lookup = slotsById(slots);

    expect(resolveFeederParticipant('qf2', lookup)?.id).toBe('p-win');
    expect(resolveFeederParticipant('sf1', lookup)).toBeNull();
    expect(resolveFeederParticipant('fin', lookup)).toBeNull();

    const fin = lookup.get('fin')!;
    expect(resolveFeederParticipant(fin.feederSlotAId, lookup)).toBeNull();
    expect(resolveFeederParticipant(fin.feederSlotBId, lookup)).toBeNull();
  });
});
