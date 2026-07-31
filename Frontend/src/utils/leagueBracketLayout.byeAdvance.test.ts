import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import {
  buildBracketColumns,
  buildGrandFinalColumns,
  resolveSlotFeederParticipant,
  resolveByeAdvanceRoundLabel,
} from './leagueBracketLayout';

function slot(partial: Partial<BracketSlotDto> & Pick<BracketSlotDto, 'id' | 'slotKind'>): BracketSlotDto {
  return {
    slotKey: partial.id,
    phaseIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    ...partial,
  };
}

function participant(id: string, userId: string): NonNullable<BracketSlotDto['participant']> {
  return {
    id,
    displayName: id,
    leagueTeam: {
      id: `team-${id}`,
      players: [{ id: `player-${id}`, userId, user: { id: userId } }],
    },
  };
}

function finalGame(teamAUserId: string, teamBUserId: string, winner: 'A' | 'B') {
  return {
    id: `game-${teamAUserId}-${teamBUserId}`,
    resultsStatus: 'FINAL',
    fixedTeams: [
      { teamNumber: 1, players: [{ user: { id: teamAUserId } }] },
      { teamNumber: 2, players: [{ user: { id: teamBUserId } }] },
    ],
    outcomes: [
      { user: { id: teamAUserId }, wins: winner === 'A' ? 2 : 0 },
      { user: { id: teamBUserId }, wins: winner === 'B' ? 2 : 0 },
    ],
  } as NonNullable<BracketSlotDto['game']>;
}

describe('resolveByeAdvanceRoundLabel', () => {
  it('uses winner slot roundLabel when present', () => {
    const slots = [
      slot({ id: 'bye-1', slotKind: 'BYE', winnerSlotId: 'main-0' }),
      slot({
        id: 'main-0',
        slotKind: 'MAIN',
        roundIndex: 0,
        roundLabel: 'Quarterfinals',
      }),
    ];
    expect(resolveByeAdvanceRoundLabel(slots[0], slots, (i) => `Round ${i + 1}`)).toBe('Quarterfinals');
  });

  it('falls back to main round label when winner has no roundLabel', () => {
    const slots = [
      slot({ id: 'bye-1', slotKind: 'BYE', winnerSlotId: 'main-0' }),
      slot({ id: 'main-0', slotKind: 'MAIN', roundIndex: 1 }),
    ];
    expect(resolveByeAdvanceRoundLabel(slots[0], slots, (i) => `Round ${i + 1}`)).toBe('Round 2');
  });

  it('returns null when bye has no winner slot', () => {
    const slots = [slot({ id: 'bye-1', slotKind: 'BYE' })];
    expect(resolveByeAdvanceRoundLabel(slots[0], slots, (i) => `Round ${i + 1}`)).toBeNull();
  });
});

describe('buildBracketColumns roundLabel (UX-A13)', () => {
  it('uses play-in slot roundLabel for play-in column header', () => {
    const slots = [
      slot({ id: 'pi-1', slotKind: 'PLAY_IN', roundIndex: 0, roundLabel: 'Play-in round' }),
    ];
    const cols = buildBracketColumns(slots, {
      playIn: 'Play-in',
      byes: 'Byes',
      thirdPlace: '3rd',
      mainFallback: (i) => `Round ${i + 1}`,
    });
    expect(cols.find((c) => c.kind === 'PLAY_IN')?.label).toBe('Play-in round');
  });

  it('places the conditional reset in its own column after the grand final', () => {
    const columns = buildGrandFinalColumns(
      [
        slot({ id: 'gf1', slotKind: 'GRAND_FINAL', roundLabel: 'Grand final' }),
        slot({
          id: 'gf2',
          slotKind: 'GRAND_FINAL',
          roundIndex: 1,
          roundLabel: 'Grand final reset',
        }),
      ],
      'Grand final'
    );

    expect(columns.map((column) => ({
      id: column.id,
      label: column.label,
      slots: column.slots.map((item) => item.id),
    }))).toEqual([
      { id: 'grand-final', label: 'Grand final', slots: ['gf1'] },
      { id: 'grand-final-reset-1', label: 'Grand final reset', slots: ['gf2'] },
    ]);
  });

  it('places the third-place match beneath the final in one column', () => {
    const slots = [
      slot({ id: 'sf-1', slotKind: 'MAIN', roundIndex: 0, roundLabel: 'Semifinals' }),
      slot({ id: 'final', slotKind: 'MAIN', roundIndex: 1, roundLabel: 'Final' }),
      slot({ id: 'third', slotKind: 'THIRD_PLACE', roundIndex: 1, roundLabel: 'Third place' }),
    ];
    const cols = buildBracketColumns(slots, {
      playIn: 'Play-in',
      byes: 'Byes',
      thirdPlace: 'Third place',
      mainFallback: (i) => `Round ${i + 1}`,
    });

    expect(cols).toHaveLength(2);
    expect(cols.at(-1)).toMatchObject({
      id: 'main-1',
      label: 'Final',
      slots: [{ id: 'final' }, { id: 'third' }],
    });
  });
});

describe('advanced feeder outcomes', () => {
  it('feeds a main-bracket loser into the losers bracket', () => {
    const pA = participant('p-a', 'u-a');
    const pB = participant('p-b', 'u-b');
    const slots = [
      slot({ id: 'a', slotKind: 'BYE', participant: pA }),
      slot({ id: 'b', slotKind: 'BYE', participant: pB }),
      slot({
        id: 'main',
        slotKind: 'MAIN',
        feederSlotAId: 'a',
        feederSlotBId: 'b',
        game: finalGame('u-a', 'u-b', 'A'),
      }),
      slot({
        id: 'losers',
        slotKind: 'LOSERS',
        feederSlotAId: 'main',
      }),
    ];
    const lookup = new Map(slots.map((item) => [item.id, item]));

    expect(resolveSlotFeederParticipant(slots[3], 'A', lookup)?.id).toBe('p-b');
  });

  it('feeds winner and loser of GF1 into the reset final', () => {
    const pA = participant('p-a', 'u-a');
    const pB = participant('p-b', 'u-b');
    const slots = [
      slot({ id: 'a', slotKind: 'BYE', participant: pA }),
      slot({ id: 'b', slotKind: 'BYE', participant: pB }),
      slot({
        id: 'gf1',
        slotKind: 'GRAND_FINAL',
        feederSlotAId: 'a',
        feederSlotBId: 'b',
        game: finalGame('u-a', 'u-b', 'B'),
      }),
      slot({
        id: 'reset',
        slotKind: 'GRAND_FINAL',
        roundIndex: 1,
        feederSlotAId: 'gf1',
        feederSlotBId: 'gf1',
      }),
    ];
    const lookup = new Map(slots.map((item) => [item.id, item]));

    expect(resolveSlotFeederParticipant(slots[3], 'A', lookup)?.id).toBe('p-a');
    expect(resolveSlotFeederParticipant(slots[3], 'B', lookup)?.id).toBe('p-b');
  });
});
