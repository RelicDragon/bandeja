import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import {
  resolveBracketRoundPickerLabel,
  resolveBracketRoundTitleFromSlots,
} from './bracketRoundDisplay.util';

function slot(partial: Partial<BracketSlotDto> & Pick<BracketSlotDto, 'id' | 'slotKind'>): BracketSlotDto {
  return {
    slotKey: partial.id,
    phaseIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    ...partial,
  };
}

describe('resolveBracketRoundTitleFromSlots', () => {
  it('returns latest main round label when present', () => {
    const slots = [
      slot({ id: 'a', slotKind: 'MAIN', roundIndex: 0, roundLabel: 'Quarterfinals' }),
      slot({ id: 'b', slotKind: 'MAIN', roundIndex: 1, roundLabel: 'Semifinals' }),
      slot({ id: 'c', slotKind: 'MAIN', roundIndex: 2, roundLabel: 'Final' }),
    ];
    expect(resolveBracketRoundTitleFromSlots(slots)).toBe('Final');
  });

  it('falls back to any slot roundLabel', () => {
    const slots = [slot({ id: 'p', slotKind: 'PLAY_IN', roundIndex: 0, roundLabel: 'Play-in' })];
    expect(resolveBracketRoundTitleFromSlots(slots)).toBe('Play-in');
  });

  it('returns null when no labels', () => {
    expect(resolveBracketRoundTitleFromSlots([slot({ id: 'a', slotKind: 'MAIN', roundIndex: 0 })])).toBeNull();
  });
});

describe('resolveBracketRoundPickerLabel', () => {
  it('uses slot-derived title when available', () => {
    const round = {
      id: 'r1',
      leagueSeasonId: 's1',
      orderIndex: 2,
      sentStartMessage: false,
      createdAt: '',
      updatedAt: '',
      games: [],
    };
    expect(resolveBracketRoundPickerLabel(round, 'Semifinals', 'Round 3')).toBe('Semifinals');
  });

  it('falls back to generic round label', () => {
    const round = {
      id: 'r1',
      leagueSeasonId: 's1',
      orderIndex: 0,
      sentStartMessage: false,
      createdAt: '',
      updatedAt: '',
      games: [],
    };
    expect(resolveBracketRoundPickerLabel(round, null, 'Round 1')).toBe('Round 1');
  });
});
