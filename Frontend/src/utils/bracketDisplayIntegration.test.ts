import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import type { Game } from '@/types';
import { resolveBracketSideDisplayLabel } from './bracketFeederSlotLabel.util';
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

function finalGame(winner: 'teamA' | 'teamB', winnerParticipant: BracketSlotDto['participant']): Game {
  const winUser = 'u-win';
  const loseUser = 'u-lose';
  return {
    id: 'g',
    resultsStatus: 'FINAL',
    fixedTeams: [
      {
        teamNumber: 1,
        players: winnerParticipant?.leagueTeam?.players ?? [{ user: { id: winUser } }],
      },
      { teamNumber: 2, players: [{ user: { id: loseUser } }] },
    ],
    outcomes: [
      { user: { id: winUser }, wins: winner === 'teamA' ? 2 : 0 },
      { user: { id: loseUser }, wins: winner === 'teamB' ? 2 : 0 },
    ],
  } as Game;
}

/** 8-team bracket: QF1 done (winner in SF1 side A), SF1 open, Final open. */
function buildEightTeamPartialProgress(): BracketSlotDto[] {
  const winner = {
    id: 'p-win',
    displayName: 'Team Alpha',
    leagueTeam: { id: 't1', players: [{ id: 'tp1', userId: 'u-win', user: { id: 'u-win' } }] },
  };
  return [
    slot({
      id: 'qf0',
      slotKind: 'MAIN',
      roundIndex: 0,
      matchIndex: 0,
      roundLabel: 'Quarterfinals',
      winnerSlotId: 'sf0',
      gameId: 'g-qf0',
      game: finalGame('teamA', winner),
      participant: winner,
    }),
    slot({
      id: 'qf1',
      slotKind: 'MAIN',
      roundIndex: 0,
      matchIndex: 1,
      roundLabel: 'Quarterfinals',
      winnerSlotId: 'sf0',
    }),
    slot({
      id: 'qf2',
      slotKind: 'MAIN',
      roundIndex: 0,
      matchIndex: 2,
      roundLabel: 'Quarterfinals',
      winnerSlotId: 'sf1',
    }),
    slot({
      id: 'qf3',
      slotKind: 'MAIN',
      roundIndex: 0,
      matchIndex: 3,
      roundLabel: 'Quarterfinals',
      winnerSlotId: 'sf1',
    }),
    slot({
      id: 'sf0',
      slotKind: 'MAIN',
      roundIndex: 1,
      matchIndex: 0,
      roundLabel: 'Semifinals',
      feederSlotAId: 'qf0',
      feederSlotBId: 'qf1',
      winnerSlotId: 'fin',
      leagueParticipantId: 'p-win',
      participant: winner,
    }),
    slot({
      id: 'sf1',
      slotKind: 'MAIN',
      roundIndex: 1,
      matchIndex: 1,
      roundLabel: 'Semifinals',
      feederSlotAId: 'qf2',
      feederSlotBId: 'qf3',
      winnerSlotId: 'fin',
    }),
    slot({
      id: 'fin',
      slotKind: 'MAIN',
      roundIndex: 2,
      matchIndex: 0,
      roundLabel: 'Final',
      feederSlotAId: 'sf0',
      feederSlotBId: 'sf1',
    }),
  ];
}

describe('bracket display integration (8-team partial progress)', () => {
  const slots = buildEightTeamPartialProgress();
  const lookup = slotsById(slots);
  const sf0 = lookup.get('sf0')!;
  const sf1 = lookup.get('sf1')!;
  const fin = lookup.get('fin')!;

  it('QF1 winner appears in SF1 via completed QF1 feeder', () => {
    expect(resolveFeederParticipant('qf0', lookup)?.displayName).toBe('Team Alpha');
  });

  it('SF1 shows QF1 winner on side A and QF2 label on side B while QF2 open', () => {
    const sideA = resolveFeederParticipant(sf0.feederSlotAId, lookup);
    const sideB = resolveFeederParticipant(sf0.feederSlotBId, lookup);
    expect(resolveBracketSideDisplayLabel(sideA, sf0.feederSlotAId, lookup)).toBe('Team Alpha');
    expect(resolveBracketSideDisplayLabel(sideB, sf0.feederSlotBId, lookup)).toBe('QF2');
  });

  it('SF2 shows QF3 and QF4 labels while both QFs open', () => {
    const sideA = resolveFeederParticipant(sf1.feederSlotAId, lookup);
    const sideB = resolveFeederParticipant(sf1.feederSlotBId, lookup);
    expect(resolveBracketSideDisplayLabel(sideA, sf1.feederSlotAId, lookup)).toBe('QF3');
    expect(resolveBracketSideDisplayLabel(sideB, sf1.feederSlotBId, lookup)).toBe('QF4');
  });

  it('Final does not show QF/SF winners — only SF1 vs SF2 labels', () => {
    const sideA = resolveFeederParticipant(fin.feederSlotAId, lookup);
    const sideB = resolveFeederParticipant(fin.feederSlotBId, lookup);
    expect(sideA).toBeNull();
    expect(sideB).toBeNull();
    expect(resolveBracketSideDisplayLabel(sideA, fin.feederSlotAId, lookup)).toBe('SF1');
    expect(resolveBracketSideDisplayLabel(sideB, fin.feederSlotBId, lookup)).toBe('SF2');
  });

  it('feeder labels align with preview convention (QF1–QF4, SF1–SF2)', () => {
    expect(resolveBracketSideDisplayLabel(null, 'qf0', lookup)).toBe('QF1');
    expect(resolveBracketSideDisplayLabel(null, 'qf1', lookup)).toBe('QF2');
    expect(resolveBracketSideDisplayLabel(null, 'qf2', lookup)).toBe('QF3');
    expect(resolveBracketSideDisplayLabel(null, 'qf3', lookup)).toBe('QF4');
    expect(resolveBracketSideDisplayLabel(null, 'sf0', lookup)).toBe('SF1');
    expect(resolveBracketSideDisplayLabel(null, 'sf1', lookup)).toBe('SF2');
  });
});
