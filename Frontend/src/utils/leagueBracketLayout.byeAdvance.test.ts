import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import { buildBracketColumns, resolveByeAdvanceRoundLabel } from './leagueBracketLayout';

function slot(partial: Partial<BracketSlotDto> & Pick<BracketSlotDto, 'id' | 'slotKind'>): BracketSlotDto {
  return {
    slotKey: partial.id,
    phaseIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    ...partial,
  };
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
